use copet_lib::{
    app_state::{CooldownStyle, PetInteractionPrefs},
    config_store::ConfigStore,
};
use std::{fs, path::PathBuf};

fn builtin_pets_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets/pets")
}

fn make_store(temp: &tempfile::TempDir) -> ConfigStore {
    ConfigStore::with_builtin_dir(temp.path().join(".copet"), builtin_pets_dir())
}

#[test]
fn pet_interaction_prefs_default_values() {
    let prefs = PetInteractionPrefs::default();

    assert!(prefs.enable_click_sounds);
    assert_eq!(prefs.cooldown_style, CooldownStyle::Normal);
}

#[test]
fn pet_interaction_prefs_round_trips_via_json() {
    let prefs = PetInteractionPrefs {
        enable_click_sounds: false,
        cooldown_style: CooldownStyle::Lazy,
        enable_startup_animation: false,
    };

    let json = serde_json::to_string(&prefs).unwrap();
    let deserialized: PetInteractionPrefs = serde_json::from_str(&json).unwrap();

    assert_eq!(prefs, deserialized);
}

#[test]
fn pet_interaction_prefs_missing_sound_field_defaults_enabled() {
    let prefs: PetInteractionPrefs = serde_json::from_str(r#"{"cooldownStyle":"lazy"}"#).unwrap();

    assert!(prefs.enable_click_sounds);
    assert_eq!(prefs.cooldown_style, CooldownStyle::Lazy);
}

#[test]
fn pet_interactions_defaults_to_defaults_when_missing_from_legacy_config() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join(".copet");
    fs::create_dir_all(&root).unwrap();
    // Write a config.json that resembles the old schema — no petInteractions key.
    fs::write(
        root.join("config.json"),
        r#"{"currentPetId":"copet","onboardingComplete":false,"petWindowSize":30}"#,
    )
    .unwrap();

    let store = ConfigStore::with_builtin_dir(root, builtin_pets_dir());
    let state = store.app_state().unwrap();

    assert_eq!(state.pet_interactions, PetInteractionPrefs::default());
}

#[test]
fn legacy_nested_pet_interactions_migrate_to_flat_keys_on_load() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join(".copet");
    fs::create_dir_all(&root).unwrap();
    fs::write(
        root.join("config.json"),
        r#"{"currentPetId":"copet","onboardingComplete":true,"petWindowSize":30,"petInteractions":{"enableClickSounds":true,"cooldownStyle":"lazy"}}"#,
    )
    .unwrap();

    let store = ConfigStore::with_builtin_dir(root.clone(), builtin_pets_dir());
    let state = store.app_state().unwrap();

    assert_eq!(
        state.pet_interactions,
        PetInteractionPrefs {
            enable_click_sounds: true,
            cooldown_style: CooldownStyle::Lazy,
            enable_startup_animation: true,
        }
    );

    // The migration must rewrite the file so the legacy `petInteractions`
    // key is gone and the two settings live at the top level.
    let raw = fs::read_to_string(root.join("config.json")).unwrap();
    let json: serde_json::Value = serde_json::from_str(&raw).unwrap();
    let object = json.as_object().unwrap();
    assert!(!object.contains_key("petInteractions"));
    assert_eq!(
        object.get("enableClickSounds"),
        Some(&serde_json::json!(true))
    );
    assert_eq!(
        object.get("cooldownStyle"),
        Some(&serde_json::json!("lazy"))
    );
}

#[test]
fn set_pet_interactions_writes_flat_keys() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();

    store
        .set_pet_interactions(PetInteractionPrefs {
            enable_click_sounds: true,
            cooldown_style: CooldownStyle::Short,
            enable_startup_animation: true,
        })
        .unwrap();

    let raw = fs::read_to_string(temp.path().join(".copet").join("config.json")).unwrap();
    let json: serde_json::Value = serde_json::from_str(&raw).unwrap();
    let object = json.as_object().unwrap();
    assert!(!object.contains_key("petInteractions"));
    assert_eq!(
        object.get("enableClickSounds"),
        Some(&serde_json::json!(true))
    );
    assert_eq!(
        object.get("cooldownStyle"),
        Some(&serde_json::json!("short"))
    );
}

#[test]
fn set_pet_interactions_persists_and_round_trips() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();

    let prefs = PetInteractionPrefs {
        enable_click_sounds: false,
        cooldown_style: CooldownStyle::Short,
        enable_startup_animation: false,
    };
    let updated = store.set_pet_interactions(prefs.clone()).unwrap();
    assert_eq!(updated.pet_interactions, prefs);

    // Open a fresh handle pointed at the same root; field must survive.
    let reopened = ConfigStore::with_builtin_dir(temp.path().join(".copet"), builtin_pets_dir());
    let state = reopened.app_state().unwrap();
    assert_eq!(state.pet_interactions, prefs);
}
