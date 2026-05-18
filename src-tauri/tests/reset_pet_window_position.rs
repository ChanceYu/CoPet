// Compile-time check that the public symbol `pethover_lib::commands::reset_pet_window_position`
// exists at the expected module path. Renaming or moving the command will fail this test.

use pethover_lib::commands::reset_pet_window_position;

#[test]
fn reset_pet_window_position_command_symbol_exists() {
    let _ = reset_pet_window_position; // force the symbol to be resolved
}

#[test]
fn reset_pet_window_position_restores_visibility_when_hidden() {
    let source = include_str!("../src/commands.rs");
    let body = source
        .split("pub fn reset_pet_window_position")
        .nth(1)
        .expect("reset_pet_window_position body should exist");

    assert!(
        body.contains("is_visible"),
        "reset must consult is_visible() so a tray-hidden pet is re-shown on reset"
    );
    assert!(
        body.contains("keep_pet_window_on_top"),
        "reset must re-apply the z-order policy when the pet was hidden, matching \
         toggle_pet_window_visibility's show branch"
    );
    assert!(
        body.contains("schedule_pet_window_z_order_reassertions"),
        "reset must schedule reassertions when re-showing so the panel lands on the \
         active Space, including another app's fullscreen Space"
    );
    assert!(
        body.contains("refresh_tray_menu"),
        "reset must refresh the tray menu after re-showing so the Hide/Show label \
         reflects the new visibility"
    );
}

#[test]
fn default_pet_window_margin_is_scale_aware_logical_pixels() {
    let source = include_str!("../src/window_placement.rs");
    let constant_line = source
        .lines()
        .find(|line| line.contains("BOTTOM_RIGHT_MARGIN_LOGICAL_PX"))
        .expect("BOTTOM_RIGHT_MARGIN_LOGICAL_PX should be declared in window_placement.rs");

    // The default first-launch position and reset position share this margin.
    // Using logical pixels keeps the gap consistent on Retina displays, where
    // a fixed physical margin would visually halve and put the pet back in
    // the corner. 200 logical px sits well off the bottom-right corner while
    // still occupying the bottom-right region.
    assert!(
        constant_line.contains("f64"),
        "margin should be a logical (f64) value scaled by monitor.scale_factor(); found: {constant_line}"
    );
    assert!(
        constant_line.contains("200"),
        "margin should be 200 logical px so the default position is clearly off the corner on Retina monitors; found: {constant_line}"
    );

    let place_fn = source
        .split("pub fn place_window_bottom_right")
        .nth(1)
        .and_then(|rest| rest.split("pub fn").next())
        .expect("place_window_bottom_right body should exist");
    assert!(
        place_fn.contains("scale_factor"),
        "place_window_bottom_right must multiply the logical margin by monitor.scale_factor() so the gap is consistent across DPIs"
    );
}
