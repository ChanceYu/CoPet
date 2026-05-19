use pethover_lib::{
    app_state::{CooldownStyle, PetInteractionPrefs},
    config_store::ConfigStore,
};
use std::{fs, path::PathBuf};

fn builtin_pets_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets/pets")
}

fn make_store(temp: &tempfile::TempDir) -> ConfigStore {
    ConfigStore::with_builtin_dir(temp.path().join(".pethover"), builtin_pets_dir())
}

#[test]
fn pet_interaction_prefs_default_values() {
    let prefs = PetInteractionPrefs::default();

    assert!(!prefs.enable_click_sounds);
    assert_eq!(prefs.cooldown_style, CooldownStyle::Normal);
}

#[test]
fn pet_interaction_prefs_round_trips_via_json() {
    let prefs = PetInteractionPrefs {
        enable_click_sounds: false,
        cooldown_style: CooldownStyle::Lazy,
    };

    let json = serde_json::to_string(&prefs).unwrap();
    let deserialized: PetInteractionPrefs = serde_json::from_str(&json).unwrap();

    assert_eq!(prefs, deserialized);
}

#[test]
fn pet_interactions_defaults_to_defaults_when_missing_from_legacy_config() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join(".pethover");
    fs::create_dir_all(&root).unwrap();
    // Write a config.json that resembles the old schema — no petInteractions key.
    fs::write(
        root.join("config.json"),
        r#"{"currentPetId":"pethover","onboardingComplete":false,"petWindowSize":30}"#,
    )
    .unwrap();

    let store = ConfigStore::with_builtin_dir(root, builtin_pets_dir());
    let state = store.app_state().unwrap();

    assert_eq!(state.pet_interactions, PetInteractionPrefs::default());
}

#[test]
fn set_pet_interactions_persists_and_round_trips() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();

    let prefs = PetInteractionPrefs {
        enable_click_sounds: false,
        cooldown_style: CooldownStyle::Short,
    };
    let updated = store.set_pet_interactions(prefs.clone()).unwrap();
    assert_eq!(updated.pet_interactions, prefs);

    // Open a fresh handle pointed at the same root; field must survive.
    let reopened = ConfigStore::with_builtin_dir(temp.path().join(".pethover"), builtin_pets_dir());
    let state = reopened.app_state().unwrap();
    assert_eq!(state.pet_interactions, prefs);
}
