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
use std::{io, path::PathBuf, process::Command};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    path::BaseDirectory,
    tray::{TrayIcon, TrayIconBuilder},
    AppHandle, Emitter, EventTarget, Manager, State,
};
#[cfg(target_os = "macos")]
use tauri_nspanel::WebviewWindowExt;
use window_placement::{
    apply_pet_window_size, install_pet_window_z_order_guard,
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

#[allow(dead_code)]
fn resolve_builtin_pets_dir_from_handle(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(path) = app.path().resolve("assets/pets", BaseDirectory::Resource) {
        if path.is_dir() {
            return Some(path);
        }
    }
    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets/pets");
    dev_path.is_dir().then_some(dev_path)
}
const PROJECT_HOMEPAGE_URL: &str = "https://github.com/ChanceYu/pethover";
const TRAY_MENU_BRAND_ID: &str = "brand-homepage";
const TRAY_MENU_SETTINGS_ID: &str = "settings-center";
const TRAY_MENU_QUIT_ID: &str = "quit-app";

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
    Ok(state)
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

fn open_project_homepage() -> io::Result<()> {
    open_url_in_default_browser(PROJECT_HOMEPAGE_URL)
}

#[cfg(target_os = "macos")]
fn open_url_in_default_browser(url: &str) -> io::Result<()> {
    Command::new("open").arg(url).spawn().map(|_| ())
}

#[cfg(target_os = "windows")]
fn open_url_in_default_browser(url: &str) -> io::Result<()> {
    Command::new("cmd")
        .args(["/C", "start", "", url])
        .spawn()
        .map(|_| ())
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn open_url_in_default_browser(url: &str) -> io::Result<()> {
    Command::new("xdg-open").arg(url).spawn().map(|_| ())
}

fn install_tray_menu(app: &mut tauri::App) -> tauri::Result<()> {
    let locale = current_locale();
    let brand = MenuItem::with_id(
        app,
        TRAY_MENU_BRAND_ID,
        t(locale, MessageKey::TrayBrand),
        true,
        None::<&str>,
    )?;
    let brand_separator = PredefinedMenuItem::separator(app)?;
    let settings = MenuItem::with_id(
        app,
        TRAY_MENU_SETTINGS_ID,
        t(locale, MessageKey::TraySettings),
        true,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(
        app,
        TRAY_MENU_QUIT_ID,
        t(locale, MessageKey::TrayQuit),
        true,
        None::<&str>,
    )?;
    let menu = Menu::with_items(
        app,
        &[&brand, &brand_separator, &settings, &separator, &quit],
    )?;

    let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;

    let tray = TrayIconBuilder::with_id("pethover")
        .tooltip("PetHover")
        .icon(tray_icon)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_MENU_BRAND_ID => {
                let _ = open_project_homepage();
            }
            TRAY_MENU_SETTINGS_ID => {
                let _ = show_settings_window(app);
            }
            TRAY_MENU_QUIT_ID => app.exit(0),
            _ => {}
        })
        .build(app)?;
    app.manage::<TrayIcon>(tray);
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
