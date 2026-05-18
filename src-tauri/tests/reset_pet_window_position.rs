// Compile-time check that the public symbol `pethover_lib::commands::reset_pet_window_position`
// exists at the expected module path. Renaming or moving the command will fail this test.

use pethover_lib::commands::reset_pet_window_position;

#[test]
fn reset_pet_window_position_command_symbol_exists() {
    let _ = reset_pet_window_position; // force the symbol to be resolved
}
