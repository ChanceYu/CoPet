use std::{
    thread,
    time::{Duration, Instant},
};

use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

use crate::app_state::{
    normalize_pet_window_size, PetWindowSize, MAX_PET_WINDOW_SIZE, MIN_PET_WINDOW_SIZE,
};

// Logical pixels of breathing room from the monitor's bottom-right edge for
// the default pet placement (first-launch position and tray "Reset Position").
// Expressed in logical units so the gap looks consistent on Retina monitors,
// where a fixed physical margin would visually halve.
const BOTTOM_RIGHT_MARGIN_LOGICAL_PX: f64 = 200.0;
const MIN_PET_WINDOW_WIDTH: f64 = 95.0;
const MIN_PET_WINDOW_HEIGHT: f64 = 110.0;
const MAX_PET_WINDOW_WIDTH: f64 = 270.0;
const MAX_PET_WINDOW_HEIGHT: f64 = 310.0;
const PET_STARTUP_ANIMATION_FRAME_MS: u64 = 16;
const PET_WINDOW_REASSERTION_DELAYS_MS: &[u64] = &[0, 120, 360, 900, 1_800, 3_200];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct PetWindowZOrderPolicy {
    macos_floating_level: bool,
    macos_screen_saver_level: bool,
    visible_on_all_workspaces: bool,
    visible_on_all_applications: bool,
    stationary_across_spaces: bool,
    fullscreen_auxiliary: bool,
    ignores_window_cycle: bool,
    hides_on_deactivate: bool,
    can_hide: bool,
    focusable: bool,
    orders_front_regardless: bool,
    restores_visibility: bool,
    deminiaturizes: bool,
    unhides_application_without_activation: bool,
    windows_hwnd_topmost: bool,
    windows_no_activate: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct SettingsWindowInteractionPolicy {
    macos_normal_level: bool,
    macos_screen_saver_level: bool,
    orders_front_regardless: bool,
}

pub fn apply_pet_window_size(window: &WebviewWindow, size: PetWindowSize) -> tauri::Result<()> {
    keep_pet_window_on_top(window)?;
    let (width, height) = pet_window_logical_dimensions(size);
    window.set_size(LogicalSize::new(width, height))?;
    place_window_bottom_right(window)?;
    keep_pet_window_on_top(window)?;
    Ok(())
}

pub fn apply_pet_window_size_for_startup(
    window: &WebviewWindow,
    size: PetWindowSize,
) -> tauri::Result<()> {
    // orderFront the panel at its final fully-on-screen frame first so macOS
    // WindowServer commits it into the current Space's window collection.
    // The startup animation's set_position(start) call afterwards moves an
    // already-registered NSPanel to the half-off-screen start frame without
    // losing Space membership — if we orderFront at the half-off-screen
    // frame instead, the panel never gets composited until a workspace
    // reassertion fires, and the user only sees the arrival heart at the
    // end of the slide.
    let (width, height) = pet_window_logical_dimensions(size);
    window.set_size(LogicalSize::new(width, height))?;
    place_window_bottom_right(window)?;
    keep_pet_window_on_top(window)?;
    Ok(())
}

pub fn resize_pet_window_from_center(
    window: &WebviewWindow,
    size: PetWindowSize,
) -> tauri::Result<()> {
    keep_pet_window_on_top(window)?;
    let old_position = window.outer_position()?;
    let old_size = window.outer_size()?;
    let (width, height) = pet_window_logical_dimensions(size);
    window.set_size(LogicalSize::new(width, height))?;
    let new_size = window.outer_size()?;
    window.set_position(center_anchored_position(old_position, old_size, new_size))?;
    keep_pet_window_on_top(window)?;
    Ok(())
}

pub fn place_window_bottom_right(window: &WebviewWindow) -> tauri::Result<()> {
    let Some(monitor) = window.current_monitor()? else {
        return Ok(());
    };
    let window_size = window.outer_size()?;
    let margin = (BOTTOM_RIGHT_MARGIN_LOGICAL_PX * monitor.scale_factor()).round() as i32;
    let position = bottom_right_position(*monitor.position(), *monitor.size(), window_size, margin);
    window.set_position(position)?;
    Ok(())
}

pub fn animate_pet_window_from_offscreen_right(
    window: &WebviewWindow,
    duration_ms: u64,
) -> tauri::Result<bool> {
    let Some(monitor) = window.current_monitor()? else {
        return Ok(true);
    };
    let window_size = window.outer_size()?;
    let margin = (BOTTOM_RIGHT_MARGIN_LOGICAL_PX * monitor.scale_factor()).round() as i32;
    let (start, target) =
        pet_startup_window_positions(*monitor.position(), *monitor.size(), window_size, margin);

    // Dispatch the keep-on-top reassertion through the main runloop. The
    // startup command runs on a tokio worker thread (#[tauri::command(async)])
    // so thread::sleep does not freeze the webview; but keep_pet_window_on_top
    // ultimately calls NSWindow.orderFrontRegardless via objc2, and AppKit
    // requires all NSWindow methods to run on the main thread — calling it
    // from a worker thread aborts with SIGTRAP ("Must only be used from the
    // main thread"). The dispatch is fire-and-forget; we don't await its
    // completion because there's no return value the loop depends on.
    let started_at = Instant::now();
    let app_handle = window.app_handle().clone();
    let window_for_keep = window.clone();
    animate_pet_window_positions_while_visible(
        start,
        target,
        duration_ms,
        || window.is_visible(),
        |position| window.set_position(position),
        move || {
            let window_inner = window_for_keep.clone();
            app_handle
                .run_on_main_thread(move || {
                    let _ = keep_pet_window_on_top(&window_inner);
                })
                .map_err(Into::into)
        },
        thread::sleep,
        || started_at.elapsed().as_millis() as u64,
    )
}

pub fn keep_pet_window_on_top(window: &WebviewWindow) -> tauri::Result<()> {
    let policy = pet_window_z_order_policy();
    apply_tauri_pet_window_z_order_policy(window)?;
    #[cfg(not(target_os = "macos"))]
    {
        window.set_focusable(policy.focusable)?;
        window.set_visible_on_all_workspaces(policy.visible_on_all_workspaces)?;
    }
    restore_tauri_pet_window_visibility(window, policy)?;
    apply_native_pet_window_z_order_policy(window, policy)?;
    Ok(())
}

pub fn reassert_pet_window_on_top(app: &AppHandle) {
    if !pet_window_reassertion_allowed(settings_window_is_focused(app)) {
        return;
    }
    if let Some(window) = app.get_webview_window("pet") {
        // Skip reassertion when the user has hidden the pet via the tray menu.
        // The guard otherwise re-shows the window on the next focus/space/wake
        // event because keep_pet_window_on_top calls orderFrontRegardless on
        // macOS and show() on other platforms. The Show Pet path explicitly
        // schedules its own reassertion after window.show(), so a visible
        // window will still be observed on the next tick.
        if matches!(window.is_visible(), Ok(false)) {
            return;
        }
        let _ = keep_pet_window_on_top(&window);
    }
}

pub fn pet_window_event_needs_z_order_reassertion(label: &str, event: &tauri::WindowEvent) -> bool {
    label == "pet" && matches!(event, tauri::WindowEvent::Focused(false))
}

pub fn schedule_pet_window_z_order_reassertions(app: &AppHandle) {
    for delay_ms in pet_window_reassertion_delays_ms() {
        let app = app.clone();
        let delay_ms = *delay_ms;
        thread::spawn(move || {
            if delay_ms > 0 {
                thread::sleep(Duration::from_millis(delay_ms));
            }
            reassert_pet_window_on_main_thread(app);
        });
    }
}

pub fn install_pet_window_z_order_guard(app: &AppHandle) {
    install_native_pet_window_z_order_guard(app);
}

pub fn prepare_settings_window_for_interaction(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = apply_native_settings_window_interaction_policy(
            &window,
            settings_window_interaction_policy(),
        );
    }
}

fn pet_window_z_order_policy() -> PetWindowZOrderPolicy {
    PetWindowZOrderPolicy {
        macos_floating_level: false,
        macos_screen_saver_level: true,
        visible_on_all_workspaces: true,
        visible_on_all_applications: true,
        stationary_across_spaces: true,
        fullscreen_auxiliary: true,
        ignores_window_cycle: true,
        hides_on_deactivate: false,
        can_hide: false,
        focusable: false,
        orders_front_regardless: true,
        restores_visibility: true,
        deminiaturizes: true,
        unhides_application_without_activation: true,
        windows_hwnd_topmost: true,
        windows_no_activate: true,
    }
}

fn pet_window_reassertion_delays_ms() -> &'static [u64] {
    PET_WINDOW_REASSERTION_DELAYS_MS
}

fn pet_window_reassertion_allowed(settings_window_focused: bool) -> bool {
    !settings_window_focused
}

fn settings_window_interaction_policy() -> SettingsWindowInteractionPolicy {
    SettingsWindowInteractionPolicy {
        macos_normal_level: true,
        macos_screen_saver_level: false,
        orders_front_regardless: false,
    }
}

#[cfg(target_os = "macos")]
fn apply_tauri_pet_window_z_order_policy(_window: &WebviewWindow) -> tauri::Result<()> {
    // On macOS, ordinary always-on-top only sets a floating level. The native
    // policy below owns the level and Space/full-screen behavior together.
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn apply_tauri_pet_window_z_order_policy(window: &WebviewWindow) -> tauri::Result<()> {
    window.set_always_on_top(true)
}

#[cfg(target_os = "macos")]
fn restore_tauri_pet_window_visibility(
    _window: &WebviewWindow,
    _policy: PetWindowZOrderPolicy,
) -> tauri::Result<()> {
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn restore_tauri_pet_window_visibility(
    window: &WebviewWindow,
    policy: PetWindowZOrderPolicy,
) -> tauri::Result<()> {
    if policy.restores_visibility && !window.is_visible()? {
        window.show()?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn apply_native_pet_window_z_order_policy(
    window: &WebviewWindow,
    policy: PetWindowZOrderPolicy,
) -> tauri::Result<()> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{
        NSApplication, NSFloatingWindowLevel, NSScreenSaverWindowLevel, NSWindow,
        NSWindowCollectionBehavior,
    };

    unsafe {
        if policy.unhides_application_without_activation {
            if let Some(mtm) = MainThreadMarker::new() {
                NSApplication::sharedApplication(mtm).unhideWithoutActivation();
            }
        }

        let ns_window = &*window.ns_window()?.cast::<NSWindow>();
        if policy.macos_screen_saver_level {
            ns_window.setLevel(NSScreenSaverWindowLevel);
        } else if policy.macos_floating_level {
            ns_window.setLevel(NSFloatingWindowLevel);
        }
        ns_window.setHidesOnDeactivate(policy.hides_on_deactivate);
        ns_window.setCanHide(policy.can_hide);

        // NSPanel is swizzled via to_panel() in setup. The NonActivatingPanel style
        // mask prevents the pet window from activating the app when clicked.
        #[allow(non_upper_case_globals)]
        const NSWindowStyleMaskNonActivatingPanel: isize = 1 << 7;
        let current_mask: isize = objc2::msg_send![ns_window, styleMask];
        let _: () = objc2::msg_send![ns_window, setStyleMask: current_mask | NSWindowStyleMaskNonActivatingPanel];

        let mut behavior = ns_window.collectionBehavior();
        if policy.visible_on_all_workspaces {
            behavior |= NSWindowCollectionBehavior::CanJoinAllSpaces;
            behavior &= !NSWindowCollectionBehavior::MoveToActiveSpace;
        }
        if policy.stationary_across_spaces {
            behavior |= NSWindowCollectionBehavior::Stationary;
        }
        if policy.fullscreen_auxiliary {
            behavior |= NSWindowCollectionBehavior::FullScreenAuxiliary;
        }
        if policy.ignores_window_cycle {
            behavior |= NSWindowCollectionBehavior::IgnoresCycle;
        }
        if policy.visible_on_all_applications {
            behavior |= NSWindowCollectionBehavior::CanJoinAllApplications;
        }
        ns_window.setCollectionBehavior(behavior);
        if policy.deminiaturizes && ns_window.isMiniaturized() {
            ns_window.deminiaturize(None);
        }
        if policy.orders_front_regardless {
            ns_window.orderFrontRegardless();
        } else if policy.restores_visibility && !ns_window.isVisible() {
            ns_window.orderFrontRegardless();
        }
    }

    Ok(())
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn apply_native_pet_window_z_order_policy(
    _window: &WebviewWindow,
    _policy: PetWindowZOrderPolicy,
) -> tauri::Result<()> {
    Ok(())
}

#[cfg(target_os = "windows")]
fn apply_native_pet_window_z_order_policy(
    window: &WebviewWindow,
    policy: PetWindowZOrderPolicy,
) -> tauri::Result<()> {
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    };

    if policy.windows_hwnd_topmost {
        let flags = if policy.windows_no_activate {
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE
        } else {
            SWP_NOMOVE | SWP_NOSIZE
        };
        unsafe {
            SetWindowPos(window.hwnd()?, HWND_TOPMOST, 0, 0, 0, 0, flags).map_err(|error| {
                std::io::Error::new(std::io::ErrorKind::Other, error.to_string())
            })?;
        }
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn apply_native_settings_window_interaction_policy(
    window: &WebviewWindow,
    policy: SettingsWindowInteractionPolicy,
) -> tauri::Result<()> {
    use objc2_app_kit::{
        NSFloatingWindowLevel, NSNormalWindowLevel, NSScreenSaverWindowLevel, NSWindow,
    };

    unsafe {
        let ns_window = &*window.ns_window()?.cast::<NSWindow>();
        if policy.macos_screen_saver_level {
            ns_window.setLevel(NSScreenSaverWindowLevel);
        } else if policy.macos_normal_level {
            ns_window.setLevel(NSNormalWindowLevel);
        } else {
            ns_window.setLevel(NSFloatingWindowLevel);
        }
        if policy.orders_front_regardless {
            ns_window.orderFrontRegardless();
        }
    }

    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn apply_native_settings_window_interaction_policy(
    _window: &WebviewWindow,
    _policy: SettingsWindowInteractionPolicy,
) -> tauri::Result<()> {
    Ok(())
}

fn reassert_pet_window_on_main_thread(app: AppHandle) {
    let app_for_task = app.clone();
    let _ = app.run_on_main_thread(move || {
        reassert_pet_window_on_top(&app_for_task);
    });
}

#[cfg(target_os = "macos")]
fn install_native_pet_window_z_order_guard(app: &AppHandle) {
    use objc2_app_kit::{
        NSApplicationDidBecomeActiveNotification, NSApplicationDidChangeOcclusionStateNotification,
        NSApplicationDidChangeScreenParametersNotification, NSApplicationDidHideNotification,
        NSApplicationDidResignActiveNotification, NSApplicationDidUnhideNotification, NSWorkspace,
        NSWorkspaceActiveSpaceDidChangeNotification, NSWorkspaceDidActivateApplicationNotification,
        NSWorkspaceDidDeactivateApplicationNotification, NSWorkspaceDidHideApplicationNotification,
        NSWorkspaceDidUnhideApplicationNotification, NSWorkspaceDidWakeNotification,
        NSWorkspaceScreensDidWakeNotification, NSWorkspaceSessionDidBecomeActiveNotification,
    };
    use objc2_foundation::{NSNotificationCenter, NSNotificationName};

    let workspace = NSWorkspace::sharedWorkspace();
    let workspace_center = workspace.notificationCenter();
    let workspace_notifications: [&'static NSNotificationName; 8] = unsafe {
        [
            NSWorkspaceDidActivateApplicationNotification,
            NSWorkspaceDidDeactivateApplicationNotification,
            NSWorkspaceDidHideApplicationNotification,
            NSWorkspaceActiveSpaceDidChangeNotification,
            NSWorkspaceDidUnhideApplicationNotification,
            NSWorkspaceDidWakeNotification,
            NSWorkspaceScreensDidWakeNotification,
            NSWorkspaceSessionDidBecomeActiveNotification,
        ]
    };
    install_pet_window_reassertion_observers(&workspace_center, &workspace_notifications, app);

    let app_center = NSNotificationCenter::defaultCenter();
    let app_notifications: [&'static NSNotificationName; 6] = unsafe {
        [
            NSApplicationDidBecomeActiveNotification,
            NSApplicationDidResignActiveNotification,
            NSApplicationDidHideNotification,
            NSApplicationDidUnhideNotification,
            NSApplicationDidChangeOcclusionStateNotification,
            NSApplicationDidChangeScreenParametersNotification,
        ]
    };
    install_pet_window_reassertion_observers(&app_center, &app_notifications, app);
}

#[cfg(target_os = "macos")]
fn install_pet_window_reassertion_observers(
    center: &objc2_foundation::NSNotificationCenter,
    notifications: &[&'static objc2_foundation::NSNotificationName],
    app: &AppHandle,
) {
    use block2::{DynBlock, RcBlock};
    use objc2_foundation::NSNotification;
    use std::ptr::NonNull;

    for notification in notifications {
        let app = app.clone();
        let block = RcBlock::new(move |_notification: NonNull<NSNotification>| {
            schedule_pet_window_z_order_reassertions(&app);
        });
        let block: &'static RcBlock<dyn Fn(NonNull<NSNotification>)> = Box::leak(Box::new(block));
        let block: &DynBlock<dyn Fn(NonNull<NSNotification>)> = block;

        unsafe {
            let _ = center.addObserverForName_object_queue_usingBlock(
                Some(notification),
                None,
                None,
                block,
            );
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn install_native_pet_window_z_order_guard(_app: &AppHandle) {}

fn settings_window_is_focused(app: &AppHandle) -> bool {
    app.get_webview_window("settings")
        .and_then(|window| window.is_focused().ok())
        .unwrap_or(false)
}

fn center_anchored_position(
    old_position: PhysicalPosition<i32>,
    old_size: PhysicalSize<u32>,
    new_size: PhysicalSize<u32>,
) -> PhysicalPosition<i32> {
    let center_x = old_position.x + old_size.width as i32 / 2;
    let center_y = old_position.y + old_size.height as i32 / 2;
    PhysicalPosition {
        x: center_x - new_size.width as i32 / 2,
        y: center_y - new_size.height as i32 / 2,
    }
}

fn pet_startup_window_positions(
    monitor_position: PhysicalPosition<i32>,
    monitor_size: PhysicalSize<u32>,
    window_size: PhysicalSize<u32>,
    margin: i32,
) -> (PhysicalPosition<i32>, PhysicalPosition<i32>) {
    // The pet window starts with its horizontal center on the monitor's right
    // edge — the left half of the panel is on screen, the right half hangs
    // off — and slides left into the default bottom-right position with
    // margin. Keeping at least half the panel on screen at the start frame
    // is enough for macOS WindowServer to commit the NSPanel into the
    // current Space's window collection (a fully off-screen first orderFront
    // gets dropped on the floor and the user only sees the pet after
    // swiping to another Space). The slide distance is window_width/2 +
    // margin, which is visibly long enough to read as motion.
    let target = bottom_right_position(monitor_position, monitor_size, window_size, margin);
    let start = PhysicalPosition {
        x: (monitor_position.x + monitor_size.width as i32 - window_size.width as i32 / 2)
            .max(monitor_position.x),
        y: target.y,
    };
    (start, target)
}

fn ease_out_cubic(progress: f64) -> f64 {
    1.0 - (1.0 - progress.clamp(0.0, 1.0)).powi(3)
}

fn interpolate_i32(start: i32, end: i32, progress: f64) -> i32 {
    let progress = progress.clamp(0.0, 1.0);
    (start as f64 + (end as f64 - start as f64) * progress).round() as i32
}

fn interpolate_position(
    start: PhysicalPosition<i32>,
    target: PhysicalPosition<i32>,
    progress: f64,
) -> PhysicalPosition<i32> {
    PhysicalPosition {
        x: interpolate_i32(start.x, target.x, progress),
        y: interpolate_i32(start.y, target.y, progress),
    }
}

fn animate_pet_window_positions_while_visible<IsVisible, SetPosition, KeepOnTop, Sleep, ElapsedMs>(
    start: PhysicalPosition<i32>,
    target: PhysicalPosition<i32>,
    duration_ms: u64,
    mut is_visible: IsVisible,
    mut set_position: SetPosition,
    mut keep_on_top: KeepOnTop,
    mut sleep: Sleep,
    mut elapsed_ms: ElapsedMs,
) -> tauri::Result<bool>
where
    IsVisible: FnMut() -> tauri::Result<bool>,
    SetPosition: FnMut(PhysicalPosition<i32>) -> tauri::Result<()>,
    KeepOnTop: FnMut() -> tauri::Result<()>,
    Sleep: FnMut(Duration),
    ElapsedMs: FnMut() -> u64,
{
    set_position(start)?;
    if !is_visible()? {
        set_position(target)?;
        return Ok(false);
    }
    keep_on_top()?;

    if duration_ms == 0 {
        set_position(target)?;
        let completed = is_visible()?;
        if completed {
            keep_on_top()?;
        }
        return Ok(completed);
    }

    loop {
        if !is_visible()? {
            set_position(target)?;
            return Ok(false);
        }

        let elapsed_ms = elapsed_ms();
        if elapsed_ms >= duration_ms {
            break;
        }

        let progress = ease_out_cubic(elapsed_ms as f64 / duration_ms as f64);
        set_position(interpolate_position(start, target, progress))?;
        sleep(Duration::from_millis(PET_STARTUP_ANIMATION_FRAME_MS));
    }

    set_position(target)?;
    let completed = is_visible()?;
    if completed {
        keep_on_top()?;
    }
    Ok(completed)
}

fn pet_window_logical_dimensions(size: PetWindowSize) -> (f64, f64) {
    let progress = f64::from(normalize_pet_window_size(size) - MIN_PET_WINDOW_SIZE)
        / f64::from(MAX_PET_WINDOW_SIZE - MIN_PET_WINDOW_SIZE);
    (
        round_to_tenth(
            MIN_PET_WINDOW_WIDTH + (MAX_PET_WINDOW_WIDTH - MIN_PET_WINDOW_WIDTH) * progress,
        ),
        round_to_tenth(
            MIN_PET_WINDOW_HEIGHT + (MAX_PET_WINDOW_HEIGHT - MIN_PET_WINDOW_HEIGHT) * progress,
        ),
    )
}

fn round_to_tenth(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

fn bottom_right_position(
    monitor_position: PhysicalPosition<i32>,
    monitor_size: PhysicalSize<u32>,
    window_size: PhysicalSize<u32>,
    margin: i32,
) -> PhysicalPosition<i32> {
    let x = monitor_position.x + monitor_size.width as i32 - window_size.width as i32 - margin;
    let y = monitor_position.y + monitor_size.height as i32 - window_size.height as i32 - margin;
    PhysicalPosition {
        x: x.max(monitor_position.x),
        y: y.max(monitor_position.y),
    }
}
