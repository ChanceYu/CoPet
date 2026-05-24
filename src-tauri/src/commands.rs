use crate::config_store::ConfigStore;
use crate::refresh_tray_menu;
use crate::window_placement::{
    animate_pet_window_from_offscreen_right, keep_pet_window_on_top, place_window_bottom_right,
    schedule_pet_window_z_order_reassertions,
};
use tauri::Manager;

#[tauri::command]
pub fn reset_pet_window_position(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("pet")
        .ok_or_else(|| "pet window is not available".to_string())?;
    let was_hidden = matches!(window.is_visible(), Ok(false));
    place_window_bottom_right(&window).map_err(|e| e.to_string())?;
    if was_hidden {
        // Match the show branch of toggle_pet_window_visibility: re-applying the
        // z-order policy is what actually surfaces an NSPanel onto the active
        // Space; the async reassertion alone is too late, and the tray menu
        // must be refreshed so the "Hide Pet" / "Show Pet" label stays in sync.
        keep_pet_window_on_top(&window).map_err(|e| e.to_string())?;
        schedule_pet_window_z_order_reassertions(&app);
        if let Ok(state) = ConfigStore::from_home().and_then(|store| store.app_state()) {
            refresh_tray_menu(&app, &state);
        }
    }
    Ok(())
}

#[tauri::command(async)]
pub fn run_pet_startup_window_animation(
    app: tauri::AppHandle,
    duration_ms: u64,
) -> Result<bool, String> {
    // The `async` attribute on the Tauri command macro is load-bearing: it
    // tells Tauri to run this command on the async runtime's worker thread
    // instead of the main runloop. Sync commands without this attribute run
    // on the macOS main thread, so the animation's thread::sleep loop would
    // freeze the webview for the entire slide — the running-left CSS
    // keyframe pauses, queued set_position frame updates never reach
    // WindowServer, and the user only sees the final arrival heart at the
    // end.
    let window = app
        .get_webview_window("pet")
        .ok_or_else(|| "pet window is not available".to_string())?;
    if !window.is_visible().map_err(|e| e.to_string())? {
        return Ok(false);
    }
    match animate_pet_window_from_offscreen_right(&window, duration_ms) {
        Ok(completed) => Ok(completed),
        Err(error) => {
            let _ = place_window_bottom_right(&window);
            Err(error.to_string())
        }
    }
}
