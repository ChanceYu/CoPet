use pethover_lib::config_store::ConfigStore;
use std::path::PathBuf;

fn builtin_pets_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets/pets")
}

#[test]
fn builtin_pets_persist_across_startup_and_remain_unremovable() {
    let temp = tempfile::tempdir().unwrap();
    let store = ConfigStore::with_builtin_dir(temp.path().join(".pethover"), builtin_pets_dir());

    let initial = store.ensure_ready().unwrap();
    assert!(initial.pets.iter().any(|pet| pet.id == "goku"));
    assert!(
        initial
            .pets
            .iter()
            .find(|pet| pet.id == "goku")
            .unwrap()
            .built_in
    );

    // Built-in pets cannot be removed; user-imported lifecycle is independent.
    let error = store.remove_pet("goku").unwrap_err();
    assert!(error.to_string().contains("built-in"));

    let reloaded = store.ensure_ready().unwrap();
    assert!(reloaded.pets.iter().any(|pet| pet.id == "goku"));
}
