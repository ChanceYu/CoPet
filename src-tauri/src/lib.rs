pub mod agents;
pub mod app_state;
pub mod commands;
pub mod config_store;
pub mod diagnostics;
pub mod i18n;
pub mod pet_package;
pub mod pet_registry;
pub mod runtime_server;
pub mod runtime_state;
pub mod window_placement;

use agents::{AdapterError, AdapterOperationResult, AdapterSummary, AgentManager};
use app_state::{AgentMessageDisplay, AppState, PetWindowSize};
use config_store::{set_builtin_pets_dir, ConfigStore, PetImportResult};
use i18n::{default_locale, t, Locale, LocalePreference, MessageKey};
use pet_package::PetSummary;
use runtime_server::{RuntimeManager, RuntimeSnapshot, RuntimeUpdate};
use std::path::PathBuf;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    path::BaseDirectory,
    tray::{TrayIcon, TrayIconBuilder},
    AppHandle, Emitter, EventTarget, Manager, State, Wry,
};
#[cfg(target_os = "macos")]
use tauri_nspanel::WebviewWindowExt;
use window_placement::{
    apply_pet_window_size, install_pet_window_z_order_guard, keep_pet_window_on_top,
    pet_window_event_needs_z_order_reassertion, prepare_settings_window_for_interaction,
    schedule_pet_window_z_order_reassertions,
};

const APP_STATE_CHANGED_EVENT: &str = "pethover-app-state-changed";

fn resolve_builtin_pets_dir(app: &tauri::App) -> Option<PathBuf> {
    if let Ok(path) = app.path().resolve("assets/pets", BaseDirectory::Resource) {
        if path.is_dir() {
            return Some(path);
        }
    }
    // Fallback for `tauri dev` and other ad-hoc launches where the bundle layout
    // isn't installed: the manifest-relative path is the source of truth.
    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets/pets");
    dev_path.is_dir().then_some(dev_path)
}

const TRAY_MENU_BRAND_HEADER_ID: &str = "brand-header";
const TRAY_MENU_VISIBILITY_ID: &str = "toggle-visibility";
const TRAY_MENU_PAUSE_ID: &str = "toggle-pause";
const TRAY_MENU_RESET_POSITION_ID: &str = "reset-pet-position";
const TRAY_MENU_PREFERENCES_ID: &str = "open-preferences";
const TRAY_MENU_LANGUAGE_SUBMENU_ID: &str = "language-submenu";
const TRAY_MENU_LANG_SYSTEM_ID: &str = "lang-system";
const TRAY_MENU_LANG_EN_ID: &str = "lang-en-us";
const TRAY_MENU_LANG_ZH_ID: &str = "lang-zh-cn";
const TRAY_MENU_ABOUT_ID: &str = "open-about";
const TRAY_MENU_QUIT_ID: &str = "quit-app";

struct TrayMenuHandles {
    brand: MenuItem<Wry>,
    visibility: MenuItem<Wry>,
    pause: MenuItem<Wry>,
    reset_position: MenuItem<Wry>,
    preferences: MenuItem<Wry>,
    language_menu: Submenu<Wry>,
    language_system: CheckMenuItem<Wry>,
    language_en: CheckMenuItem<Wry>,
    language_zh: CheckMenuItem<Wry>,
    about: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

fn current_locale() -> Locale {
    ConfigStore::from_home()
        .and_then(|store| store.effective_locale())
        .unwrap_or_else(|_| default_locale())
}

fn localize_store_error(error: config_store::StoreError) -> String {
    error.localized_message(current_locale())
}

fn localize_adapter_error(error: AdapterError) -> String {
    match current_locale() {
        Locale::EnUs => error.to_string(),
        Locale::ZhCn => match error {
            AdapterError::UnknownAdapter(adapter_id) => format!("未知适配器 '{adapter_id}'"),
            AdapterError::Io(error) => format!("I/O 错误：{error}"),
            AdapterError::Json(error) => format!("JSON 错误：{error}"),
            AdapterError::InvalidJson(path) => {
                format!("拒绝覆盖无效的 JSON 文件 {}", path.to_string_lossy())
            }
            AdapterError::AgentExecutableMissing { display_name } => {
                format!("{display_name} 未安装或不在 PATH 中")
            }
        },
    }
}

#[tauri::command]
fn get_app_state() -> Result<AppState, String> {
    ConfigStore::from_home()
        .and_then(|store| store.app_state())
        .map_err(localize_store_error)
}

#[tauri::command]
fn select_pet(app: tauri::AppHandle, pet_id: String) -> Result<AppState, String> {
    let state = ConfigStore::from_home()
        .and_then(|store| store.select_pet(&pet_id))
        .map_err(localize_store_error)?;
    emit_app_state_changed(&app, &state)?;
    Ok(state)
}

#[tauri::command]
fn set_pet_window_size(app: tauri::AppHandle, size: PetWindowSize) -> Result<AppState, String> {
    let state = ConfigStore::from_home()
        .and_then(|store| store.set_pet_window_size(size))
        .map_err(localize_store_error)?;
    emit_app_state_changed(&app, &state)?;
    Ok(state)
}

#[tauri::command]
fn set_locale_preference(
    app: tauri::AppHandle,
    locale_preference: LocalePreference,
) -> Result<AppState, String> {
    let state = ConfigStore::from_home()
        .and_then(|store| store.set_locale_preference(locale_preference))
        .map_err(localize_store_error)?;
    emit_app_state_changed(&app, &state)?;
    refresh_tray_menu(&app, &state);
    Ok(state)
}

fn refresh_tray_menu(app: &AppHandle, state: &AppState) {
    let Some(handles) = app.try_state::<TrayMenuHandles>() else {
        return;
    };
    let locale = state.locale_preference.effective_locale(default_locale());
    let pet_visible = app
        .get_webview_window("pet")
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(true);

    let _ = handles.brand.set_text(format!(
        "{} · v{}",
        t(locale, MessageKey::TrayBrand),
        env!("CARGO_PKG_VERSION")
    ));
    let _ = handles.visibility.set_text(t(
        locale,
        if pet_visible {
            MessageKey::TrayHidePet
        } else {
            MessageKey::TrayShowPet
        },
    ));
    let _ = handles.pause.set_text(t(
        locale,
        if state.response_paused {
            MessageKey::TrayResumeResponse
        } else {
            MessageKey::TrayPauseResponse
        },
    ));
    let _ = handles
        .reset_position
        .set_text(t(locale, MessageKey::TrayResetPosition));
    let _ = handles
        .preferences
        .set_text(t(locale, MessageKey::TraySettings));
    let _ = handles
        .language_menu
        .set_text(t(locale, MessageKey::TrayLanguageMenu));
    let _ = handles
        .language_system
        .set_text(t(locale, MessageKey::TrayLanguageSystem));
    let _ = handles
        .language_en
        .set_text(t(locale, MessageKey::TrayLanguageEnglish));
    let _ = handles
        .language_zh
        .set_text(t(locale, MessageKey::TrayLanguageChinese));
    let _ = handles.about.set_text(t(locale, MessageKey::TrayAbout));
    let _ = handles.quit.set_text(t(locale, MessageKey::TrayQuit));

    let pref = state.locale_preference;
    let _ = handles
        .language_system
        .set_checked(matches!(pref, LocalePreference::System));
    let _ = handles
        .language_en
        .set_checked(matches!(pref, LocalePreference::EnUs));
    let _ = handles
        .language_zh
        .set_checked(matches!(pref, LocalePreference::ZhCn));
}

fn handle_toggle_visibility(app: &AppHandle) -> Result<(), String> {
    toggle_pet_window_visibility(app.clone())?;
    Ok(())
}

fn handle_toggle_pause(app: &AppHandle) -> Result<(), String> {
    let store = ConfigStore::from_home().map_err(localize_store_error)?;
    let current = store.app_state().map_err(localize_store_error)?;
    let new_state = store
        .set_response_paused(!current.response_paused)
        .map_err(localize_store_error)?;
    emit_app_state_changed(app, &new_state)?;
    refresh_tray_menu(app, &new_state);
    Ok(())
}

fn handle_reset_position(app: &AppHandle) -> Result<(), String> {
    commands::reset_pet_window_position(app.clone())
}

fn handle_set_locale(app: &AppHandle, preference: LocalePreference) -> Result<(), String> {
    set_locale_preference(app.clone(), preference)?;
    Ok(())
}

fn handle_open_about(app: &AppHandle) -> Result<(), String> {
    open_about_section(app.clone())
}

#[tauri::command]
fn set_response_paused(app: tauri::AppHandle, paused: bool) -> Result<AppState, String> {
    let state = ConfigStore::from_home()
        .and_then(|store| store.set_response_paused(paused))
        .map_err(localize_store_error)?;
    emit_app_state_changed(&app, &state)?;
    refresh_tray_menu(&app, &state);
    Ok(state)
}

#[tauri::command]
fn toggle_pet_window_visibility(app: tauri::AppHandle) -> Result<bool, String> {
    let Some(window) = app.get_webview_window("pet") else {
        return Err("pet window was not found".to_string());
    };
    let visible = window.is_visible().map_err(|error| error.to_string())?;
    if visible {
        window.hide().map_err(|error| error.to_string())?;
    } else {
        // Re-apply the full z-order policy synchronously instead of a plain
        // tauri show call. [NSWindow makeKeyAndOrderFront:] does not reliably
        // land an NSPanel onto another app's fullscreen Space; the panel
        // needs its CanJoinAllSpaces collection behavior and screen-saver
        // level re-asserted, plus orderFrontRegardless, before the user
        // sees it. The async reassertion guard scheduled below would do
        // this eventually, but the first delay-0 tick still trampolines
        // through run_on_main_thread which is too late.
        keep_pet_window_on_top(&window).map_err(|error| error.to_string())?;
        schedule_pet_window_z_order_reassertions(&app);
    }
    let state = ConfigStore::from_home()
        .and_then(|store| store.app_state())
        .map_err(localize_store_error)?;
    refresh_tray_menu(&app, &state);
    Ok(!visible)
}

#[tauri::command]
fn open_about_section(app: tauri::AppHandle) -> Result<(), String> {
    show_settings_window(&app)?;
    app.emit_to(
        EventTarget::webview_window("settings"),
        "pethover-navigate-to-section",
        "about",
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_agent_message_display(
    app: tauri::AppHandle,
    agent_message_display: AgentMessageDisplay,
) -> Result<AppState, String> {
    let state = ConfigStore::from_home()
        .and_then(|store| store.set_agent_message_display(agent_message_display))
        .map_err(localize_store_error)?;
    emit_app_state_changed(&app, &state)?;
    Ok(state)
}

#[tauri::command]
fn list_pets() -> Result<Vec<PetSummary>, String> {
    ConfigStore::from_home()
        .and_then(|store| store.list_pets())
        .map_err(localize_store_error)
}

#[tauri::command]
fn list_codex_pets() -> Result<Vec<PetSummary>, String> {
    ConfigStore::from_home()
        .and_then(|store| store.list_codex_pets_from_home())
        .map_err(localize_store_error)
}

#[tauri::command]
fn install_codex_pet(app: tauri::AppHandle, pet_id: String) -> Result<AppState, String> {
    let state = ConfigStore::from_home()
        .and_then(|store| store.install_codex_pet_from_home(&pet_id))
        .map_err(localize_store_error)?;
    emit_app_state_changed(&app, &state)?;
    Ok(state)
}

#[tauri::command]
fn import_codex_pets() -> Result<PetImportResult, String> {
    ConfigStore::from_home()
        .and_then(|store| store.import_codex_pets_from_home())
        .map_err(localize_store_error)
}

#[tauri::command]
fn import_pet_files(
    app: tauri::AppHandle,
    manifest_json: String,
    sprite_file_name: String,
    sprite_bytes: Vec<u8>,
) -> Result<AppState, String> {
    let state = ConfigStore::from_home()
        .and_then(|store| store.import_pet_files(&manifest_json, &sprite_file_name, sprite_bytes))
        .map_err(localize_store_error)?;
    emit_app_state_changed(&app, &state)?;
    Ok(state)
}

#[tauri::command]
fn import_pet_folder(app: tauri::AppHandle, folder_path: String) -> Result<AppState, String> {
    let state = ConfigStore::from_home()
        .and_then(|store| store.import_pet_folder(&PathBuf::from(folder_path)))
        .map_err(localize_store_error)?;
    emit_app_state_changed(&app, &state)?;
    Ok(state)
}

#[tauri::command]
fn remove_pet(app: tauri::AppHandle, pet_id: String) -> Result<AppState, String> {
    let state = ConfigStore::from_home()
        .and_then(|store| store.remove_pet(&pet_id))
        .map_err(localize_store_error)?;
    emit_app_state_changed(&app, &state)?;
    Ok(state)
}

#[tauri::command]
fn get_runtime_status(runtime: State<RuntimeManager>) -> RuntimeSnapshot {
    runtime.snapshot()
}

fn emit_app_state_changed(app: &tauri::AppHandle, state: &AppState) -> Result<(), String> {
    for label in ["pet", "settings"] {
        app.emit_to(
            EventTarget::webview_window(label),
            APP_STATE_CHANGED_EVENT,
            state,
        )
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn emit_runtime_update(app: &tauri::AppHandle, state: RuntimeUpdate) {
    dev_log_app(
        "emit.pet-state-changed",
        serde_json::json!({
            "currentState": &state.current_state,
            "messages": &state.messages,
        }),
    );
    for label in ["pet", "settings"] {
        let _ = app.emit_to(
            EventTarget::webview_window(label),
            "pet-state-changed",
            state.clone(),
        );
    }
}

fn show_settings_window(app: &tauri::AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("settings") else {
        return Err(t(current_locale(), MessageKey::SettingsWindowNotFound).to_string());
    };
    window.show().map_err(|error| error.to_string())?;
    prepare_settings_window_for_interaction(app);
    window.set_focus().map_err(|error| error.to_string())?;
    schedule_pet_window_z_order_reassertions(app);
    Ok(())
}

#[tauri::command]
fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    show_settings_window(&app)
}

fn install_tray_menu(app: &mut tauri::App) -> tauri::Result<()> {
    let locale = current_locale();

    let brand_text = format!(
        "{} · v{}",
        t(locale, MessageKey::TrayBrand),
        env!("CARGO_PKG_VERSION")
    );
    // Brand header: disabled so it can't be clicked, just shows app name + version.
    let brand = MenuItem::with_id(
        app,
        TRAY_MENU_BRAND_HEADER_ID,
        brand_text,
        false,
        None::<&str>,
    )?;
    let visibility = MenuItem::with_id(
        app,
        TRAY_MENU_VISIBILITY_ID,
        t(locale, MessageKey::TrayHidePet),
        true,
        None::<&str>,
    )?;
    let pause = MenuItem::with_id(
        app,
        TRAY_MENU_PAUSE_ID,
        t(locale, MessageKey::TrayPauseResponse),
        true,
        None::<&str>,
    )?;
    let reset_position = MenuItem::with_id(
        app,
        TRAY_MENU_RESET_POSITION_ID,
        t(locale, MessageKey::TrayResetPosition),
        true,
        None::<&str>,
    )?;
    let preferences = MenuItem::with_id(
        app,
        TRAY_MENU_PREFERENCES_ID,
        t(locale, MessageKey::TraySettings),
        true,
        None::<&str>,
    )?;
    let language_system = CheckMenuItem::with_id(
        app,
        TRAY_MENU_LANG_SYSTEM_ID,
        t(locale, MessageKey::TrayLanguageSystem),
        true,
        false,
        None::<&str>,
    )?;
    let language_en = CheckMenuItem::with_id(
        app,
        TRAY_MENU_LANG_EN_ID,
        t(locale, MessageKey::TrayLanguageEnglish),
        true,
        false,
        None::<&str>,
    )?;
    let language_zh = CheckMenuItem::with_id(
        app,
        TRAY_MENU_LANG_ZH_ID,
        t(locale, MessageKey::TrayLanguageChinese),
        true,
        false,
        None::<&str>,
    )?;
    let language_menu = Submenu::with_id(
        app,
        TRAY_MENU_LANGUAGE_SUBMENU_ID,
        t(locale, MessageKey::TrayLanguageMenu),
        true,
    )?;
    language_menu.append(&language_system)?;
    language_menu.append(&language_en)?;
    language_menu.append(&language_zh)?;
    let about = MenuItem::with_id(
        app,
        TRAY_MENU_ABOUT_ID,
        t(locale, MessageKey::TrayAbout),
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(
        app,
        TRAY_MENU_QUIT_ID,
        t(locale, MessageKey::TrayQuit),
        true,
        None::<&str>,
    )?;
    let separator_after_brand = PredefinedMenuItem::separator(app)?;
    let separator_after_reset = PredefinedMenuItem::separator(app)?;
    let separator_before_quit = PredefinedMenuItem::separator(app)?;

    let menu = Menu::with_items(
        app,
        &[
            &brand,
            &separator_after_brand,
            &visibility,
            &pause,
            &reset_position,
            &separator_after_reset,
            &preferences,
            &language_menu,
            &about,
            &separator_before_quit,
            &quit,
        ],
    )?;

    let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;
    let tray = TrayIconBuilder::with_id("pethover")
        .tooltip("PetHover")
        .icon(tray_icon)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_MENU_BRAND_HEADER_ID => { /* disabled, never fires */ }
            TRAY_MENU_VISIBILITY_ID => {
                let _ = handle_toggle_visibility(app);
            }
            TRAY_MENU_PAUSE_ID => {
                let _ = handle_toggle_pause(app);
            }
            TRAY_MENU_RESET_POSITION_ID => {
                let _ = handle_reset_position(app);
            }
            TRAY_MENU_PREFERENCES_ID => {
                let _ = show_settings_window(app);
            }
            TRAY_MENU_LANG_SYSTEM_ID => {
                let _ = handle_set_locale(app, LocalePreference::System);
            }
            TRAY_MENU_LANG_EN_ID => {
                let _ = handle_set_locale(app, LocalePreference::EnUs);
            }
            TRAY_MENU_LANG_ZH_ID => {
                let _ = handle_set_locale(app, LocalePreference::ZhCn);
            }
            TRAY_MENU_ABOUT_ID => {
                let _ = handle_open_about(app);
            }
            TRAY_MENU_QUIT_ID => app.exit(0),
            _ => {}
        })
        .build(app)?;
    app.manage::<TrayIcon>(tray);
    app.manage::<TrayMenuHandles>(TrayMenuHandles {
        brand,
        visibility,
        pause,
        reset_position,
        preferences,
        language_menu,
        language_system,
        language_en,
        language_zh,
        about,
        quit,
    });
    Ok(())
}

#[tauri::command]
fn list_agent_adapters() -> Result<Vec<AdapterSummary>, String> {
    let store = ConfigStore::from_home().map_err(localize_store_error)?;
    AgentManager::from_home(store.root())
        .and_then(|manager| manager.list())
        .map_err(localize_adapter_error)
}

#[tauri::command]
fn install_agent_adapter(adapter_id: String) -> Result<AdapterOperationResult, String> {
    let store = ConfigStore::from_home().map_err(localize_store_error)?;
    let result = AgentManager::from_home(store.root())
        .and_then(|manager| manager.install(&adapter_id))
        .map_err(localize_adapter_error)?;
    let _ = store.set_onboarding_complete(true);
    Ok(result)
}

#[tauri::command]
fn uninstall_agent_adapter(adapter_id: String) -> Result<AdapterOperationResult, String> {
    let store = ConfigStore::from_home().map_err(localize_store_error)?;
    AgentManager::from_home(store.root())
        .and_then(|manager| manager.uninstall(&adapter_id))
        .map_err(localize_adapter_error)
}

#[tauri::command]
fn repair_agent_adapter(adapter_id: String) -> Result<AdapterOperationResult, String> {
    let store = ConfigStore::from_home().map_err(localize_store_error)?;
    let result = AgentManager::from_home(store.root())
        .and_then(|manager| manager.repair(&adapter_id))
        .map_err(localize_adapter_error)?;
    let _ = store.set_onboarding_complete(true);
    Ok(result)
}

pub fn run() {
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_dialog::init());

    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_nspanel::init());
    }

    builder
        .setup(|app| {
            if let Some(dir) = resolve_builtin_pets_dir(app) {
                set_builtin_pets_dir(dir);
            }
            let store = ConfigStore::from_home()?;
            store.ensure_ready()?;
            install_tray_menu(app)?;
            let handle = app.handle().clone();
            let runtime = RuntimeManager::start(&store.runtime_dir(), move |state| {
                emit_runtime_update(&handle, state);
            })?;
            app.manage(runtime);
            if let Some(window) = app.get_webview_window("pet") {
                #[cfg(target_os = "macos")]
                {
                    let _panel = window.to_panel();
                }
                let state = store.app_state()?;
                apply_pet_window_size(&window, state.pet_window_size)?;
            }
            install_pet_window_z_order_guard(app.handle());
            schedule_pet_window_z_order_reassertions(app.handle());
            let app_state = store.app_state()?;
            refresh_tray_menu(&app.handle(), &app_state);
            Ok(())
        })
        .on_window_event(|window, event| {
            if pet_window_event_needs_z_order_reassertion(window.label(), event) {
                schedule_pet_window_z_order_reassertions(window.app_handle());
            }
            if window.label() == "settings" && matches!(event, tauri::WindowEvent::Focused(true)) {
                prepare_settings_window_for_interaction(window.app_handle());
                schedule_pet_window_z_order_reassertions(window.app_handle());
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                match window.label() {
                    "settings" => {
                        api.prevent_close();
                        let _ = window.hide();
                        schedule_pet_window_z_order_reassertions(window.app_handle());
                    }
                    "pet" => {
                        window.app_handle().exit(0);
                    }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_app_state,
            select_pet,
            set_pet_window_size,
            set_locale_preference,
            set_agent_message_display,
            set_response_paused,
            toggle_pet_window_visibility,
            open_about_section,
            list_pets,
            list_codex_pets,
            install_codex_pet,
            import_codex_pets,
            import_pet_files,
            import_pet_folder,
            remove_pet,
            get_runtime_status,
            open_settings_window,
            list_agent_adapters,
            install_agent_adapter,
            uninstall_agent_adapter,
            repair_agent_adapter,
            commands::reset_pet_window_position
        ])
        .build(tauri::generate_context!())
        .expect("failed to build PetHover")
        .run(|app, event| match event {
            tauri::RunEvent::Reopen { .. } | tauri::RunEvent::Resumed => {
                schedule_pet_window_z_order_reassertions(app);
            }
            _ => {}
        });
}

#[cfg(debug_assertions)]
fn dev_log_app(stage: &str, payload: serde_json::Value) {
    eprintln!("[pethover:app:{stage}] {payload}");
}

#[cfg(not(debug_assertions))]
fn dev_log_app(_stage: &str, _payload: serde_json::Value) {}
