use crate::window_placement::place_window_bottom_right;
use tauri::Manager;

#[tauri::command]
pub fn reset_pet_window_position(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("pet")
        .ok_or_else(|| "pet window is not available".to_string())?;
    place_window_bottom_right(&window).map_err(|e| e.to_string())
}
