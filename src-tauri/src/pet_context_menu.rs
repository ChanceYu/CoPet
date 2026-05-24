use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    AppHandle, Emitter, EventTarget, LogicalPosition, Manager, WebviewWindow,
};

pub const PET_CONTEXT_MENU_ACTION_EVENT: &str = "copet-pet-context-menu-action";
pub const PET_CONTEXT_MENU_MESSAGES_ID: &str = "pet-context-menu-toggle-messages";
pub const PET_CONTEXT_MENU_SETTINGS_ID: &str = "pet-context-menu-open-settings";
pub const PET_CONTEXT_MENU_HIDE_ID: &str = "pet-context-menu-hide-pet";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PetContextMenuLabels {
    pub messages: String,
    pub open_settings: String,
    pub hide_pet: String,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PetContextMenuPosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PetContextMenuAction {
    ToggleMessages,
    OpenSettings,
    HidePet,
}

pub fn action_for_menu_id(id: &str) -> Option<PetContextMenuAction> {
    match id {
        PET_CONTEXT_MENU_MESSAGES_ID => Some(PetContextMenuAction::ToggleMessages),
        PET_CONTEXT_MENU_SETTINGS_ID => Some(PetContextMenuAction::OpenSettings),
        PET_CONTEXT_MENU_HIDE_ID => Some(PetContextMenuAction::HidePet),
        _ => None,
    }
}

pub fn handle_menu_event(app: &AppHandle, id: &str) -> bool {
    let Some(action) = action_for_menu_id(id) else {
        return false;
    };

    let _ = app.emit_to(
        EventTarget::webview_window("pet"),
        PET_CONTEXT_MENU_ACTION_EVENT,
        action,
    );
    true
}

#[tauri::command]
pub fn open_pet_context_menu(
    app: AppHandle,
    labels: PetContextMenuLabels,
    position: PetContextMenuPosition,
) -> Result<(), String> {
    let window: WebviewWindow = app
        .get_webview_window("pet")
        .ok_or_else(|| "pet window is not available".to_string())?;

    let messages = MenuItem::with_id(
        &app,
        PET_CONTEXT_MENU_MESSAGES_ID,
        labels.messages,
        true,
        None::<&str>,
    )
    .map_err(|error| error.to_string())?;
    let open_settings = MenuItem::with_id(
        &app,
        PET_CONTEXT_MENU_SETTINGS_ID,
        labels.open_settings,
        true,
        None::<&str>,
    )
    .map_err(|error| error.to_string())?;
    let separator = PredefinedMenuItem::separator(&app).map_err(|error| error.to_string())?;
    let hide_pet = MenuItem::with_id(
        &app,
        PET_CONTEXT_MENU_HIDE_ID,
        labels.hide_pet,
        true,
        None::<&str>,
    )
    .map_err(|error| error.to_string())?;

    let menu = Menu::with_items(&app, &[&open_settings, &separator, &messages, &hide_pet])
        .map_err(|error| error.to_string())?;

    window
        .popup_menu_at(&menu, LogicalPosition::new(position.x, position.y))
        .map_err(|error| error.to_string())
}
