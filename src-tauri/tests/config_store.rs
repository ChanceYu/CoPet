use copet_lib::{
    app_state::AgentMessageDisplay,
    config_store::ConfigStore,
    i18n::{Locale, LocalePreference},
};
use std::{fs, path::Path, path::PathBuf};

const NON_DEFAULT_BUILTIN_PET_ID: &str = "dragon";

fn builtin_pets_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets/pets")
}

fn make_store(temp: &tempfile::TempDir) -> ConfigStore {
    ConfigStore::with_builtin_dir(temp.path().join(".copet"), builtin_pets_dir())
}

#[test]
fn ensure_ready_initializes_copet_tree_without_copying_builtins() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);

    let state = store.ensure_ready().unwrap();

    assert_eq!(state.current_pet_id, "system:copet");
    assert!(!state.onboarding_complete);
    assert_eq!(state.agent_message_display, AgentMessageDisplay::All);
    assert!(state.pets.iter().any(|pet| pet.id == "system:copet"));
    assert!(store.root().join("config.json").exists());
    assert!(store.root().join("runtime").exists());
    // Built-in pets are not copied to the user dir under the new architecture.
    assert!(!store.root().join("pets/copet").exists());
    assert!(!store
        .root()
        .join("pets")
        .join(NON_DEFAULT_BUILTIN_PET_ID)
        .exists());
}

#[test]
fn list_pets_exposes_all_builtin_packages_from_resource_dir() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);

    let state = store.ensure_ready().unwrap();
    let ids = state
        .pets
        .iter()
        .map(|pet| pet.id.as_str())
        .collect::<Vec<_>>();
    let dragon = state
        .pets
        .iter()
        .find(|pet| pet.id == format!("system:{NON_DEFAULT_BUILTIN_PET_ID}"))
        .unwrap();

    assert!(ids.contains(&"system:copet"));
    assert!(ids.contains(&format!("system:{NON_DEFAULT_BUILTIN_PET_ID}").as_str()));
    assert!(dragon.built_in);
}

#[test]
fn list_pets_returns_user_imports_alongside_builtins() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();
    create_user_pet(store.root(), "desk-cat", "Desk Cat");

    let state = store.app_state().unwrap();
    let desk_cat = state
        .pets
        .iter()
        .find(|pet| pet.id == "user:desk-cat")
        .unwrap();
    let copet = state
        .pets
        .iter()
        .find(|pet| pet.id == "system:copet")
        .unwrap();

    assert!(!desk_cat.built_in);
    assert!(copet.built_in);
}

#[test]
fn list_pets_orders_copet_then_user_imports_then_builtins() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();
    create_user_pet(store.root(), "z-user-pet", "Zebra Pet");
    create_user_pet(store.root(), "a-user-pet", "Alpha Pet");

    let pets = store.list_pets().unwrap();

    assert_eq!(pets.first().unwrap().id, "system:copet");

    let user_indices = pets
        .iter()
        .enumerate()
        .filter_map(|(idx, pet)| (!pet.built_in).then_some((idx, pet.id.as_str())))
        .collect::<Vec<_>>();
    let builtin_non_copet_indices = pets
        .iter()
        .enumerate()
        .filter_map(|(idx, pet)| {
            (pet.built_in && pet.id != "system:copet").then_some((idx, pet.id.as_str()))
        })
        .collect::<Vec<_>>();

    // Every user import must come before any non-copet built-in.
    let max_user_idx = user_indices.iter().map(|(idx, _)| *idx).max().unwrap();
    let min_builtin_idx = builtin_non_copet_indices
        .iter()
        .map(|(idx, _)| *idx)
        .min()
        .unwrap();
    assert!(max_user_idx < min_builtin_idx);

    // User imports sort alphabetically by display name within their group.
    let user_ids = user_indices.iter().map(|(_, id)| *id).collect::<Vec<_>>();
    assert_eq!(user_ids, vec!["user:a-user-pet", "user:z-user-pet"]);
}

#[test]
fn ensure_ready_preserves_user_pet_that_shadows_builtin_id() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    fs::create_dir_all(store.root().join("pets")).unwrap();
    create_user_pet(store.root(), "copet", "User CoPet");
    create_user_pet(store.root(), "desk-cat", "Desk Cat");

    let state = store.ensure_ready().unwrap();

    assert!(store.root().join("pets/copet").exists());
    assert!(store.root().join("pets/desk-cat").exists());
    assert!(state.pets.iter().any(|pet| pet.id == "system:copet"));
    assert!(state.pets.iter().any(|pet| pet.id == "user:copet"));
}

#[test]
fn ensure_ready_removes_legacy_pet_index_file() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    fs::create_dir_all(store.root().join("pets")).unwrap();
    fs::write(store.root().join("pets/index.json"), "[]").unwrap();

    store.ensure_ready().unwrap();

    assert!(!store.root().join("pets/index.json").exists());
}

#[test]
fn import_pet_files_writes_user_dir_and_marks_not_builtin() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();
    let manifest = r#"{
  "id": "local-fox",
  "slug": "local-fox",
  "displayName": "Local Fox",
  "description": "Imported from a local folder.",
  "frameWidth": 160,
  "frameHeight": 64,
  "gridColumns": 8,
  "gridRows": 9,
  "builtIn": true
}"#;

    let state = store
        .import_pet_files(manifest, "spritesheet.png", b"sprite".to_vec())
        .unwrap();
    let local_fox = state
        .pets
        .iter()
        .find(|pet| pet.id == "user:local-fox")
        .unwrap();

    assert_eq!(state.current_pet_id, "user:local-fox");
    // Imported pet always lives in user dir regardless of manifest hint.
    assert!(store.root().join("pets/local-fox/pet.json").exists());
    assert!(!local_fox.built_in);
}

#[test]
fn import_pet_files_allows_user_pet_that_shadows_builtin_id() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();
    let manifest = r#"{
  "id": "dragon",
  "slug": "dragon",
  "displayName": "Fake Builtin",
  "frameWidth": 160,
  "frameHeight": 64,
  "gridColumns": 8,
  "gridRows": 9,
  "builtIn": true
}"#;

    let state = store
        .import_pet_files(manifest, "spritesheet.png", b"sprite".to_vec())
        .unwrap();
    let saved_manifest: serde_json::Value = serde_json::from_slice(
        &fs::read(
            store
                .root()
                .join("pets")
                .join(NON_DEFAULT_BUILTIN_PET_ID)
                .join("pet.json"),
        )
        .unwrap(),
    )
    .unwrap();

    assert_eq!(state.current_pet_id, "user:dragon");
    assert!(state.pets.iter().any(|pet| pet.id == "system:dragon"));
    assert!(state.pets.iter().any(|pet| pet.id == "user:dragon"));
    assert_eq!(saved_manifest["id"], "dragon");
    assert_eq!(saved_manifest["builtIn"], true);
}

#[test]
fn import_pet_folder_reads_manifest_and_sprite_from_selected_directory() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();
    let source_dir = temp.path().join("local-folder-pet");
    fs::create_dir_all(&source_dir).unwrap();
    fs::write(
        source_dir.join("pet.json"),
        r#"{
  "id": "folder-fox",
  "slug": "folder-fox",
  "displayName": "Folder Fox",
  "description": "Imported from a selected folder.",
  "frameWidth": 160,
  "frameHeight": 64,
  "gridColumns": 8,
  "gridRows": 9,
  "builtIn": true
}"#,
    )
    .unwrap();
    fs::write(source_dir.join("spritesheet.png"), b"sprite").unwrap();

    let state = store.import_pet_folder(&source_dir).unwrap();
    let folder_fox = state
        .pets
        .iter()
        .find(|pet| pet.id == "user:folder-fox")
        .unwrap();

    assert_eq!(state.current_pet_id, "user:folder-fox");
    assert!(store.root().join("pets/folder-fox/pet.json").exists());
    assert!(store
        .root()
        .join("pets/folder-fox/spritesheet.png")
        .exists());
    assert!(!folder_fox.built_in);
}

#[test]
fn import_pet_folder_allows_user_pet_that_shadows_builtin_id() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();
    let source_dir = temp.path().join("shadow-builtin-pet");
    create_pet_package(&source_dir, NON_DEFAULT_BUILTIN_PET_ID, "Shadow Builtin");
    let source_manifest_path = source_dir.join("pet.json");
    let mut source_manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(&source_manifest_path).unwrap()).unwrap();
    source_manifest["builtIn"] = serde_json::Value::Bool(true);
    fs::write(
        &source_manifest_path,
        serde_json::to_vec_pretty(&source_manifest).unwrap(),
    )
    .unwrap();

    let state = store.import_pet_folder(&source_dir).unwrap();
    let saved_manifest: serde_json::Value = serde_json::from_slice(
        &fs::read(
            store
                .root()
                .join("pets")
                .join(NON_DEFAULT_BUILTIN_PET_ID)
                .join("pet.json"),
        )
        .unwrap(),
    )
    .unwrap();

    assert_eq!(state.current_pet_id, "user:dragon");
    assert!(state.pets.iter().any(|pet| pet.id == "system:dragon"));
    assert!(state.pets.iter().any(|pet| pet.id == "user:dragon"));
    assert_eq!(saved_manifest["id"], "dragon");
    assert_eq!(saved_manifest["builtIn"], true);
}

#[test]
fn remove_pet_deletes_user_pet_and_falls_back_when_current() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();
    create_user_pet(store.root(), "desk-cat", "Desk Cat");
    store.select_pet("user:desk-cat").unwrap();

    let state = store.remove_pet("user:desk-cat").unwrap();

    assert_eq!(state.current_pet_id, "system:copet");
    assert!(!state.pets.iter().any(|pet| pet.id == "user:desk-cat"));
    assert!(!store.root().join("pets/desk-cat").exists());
}

#[test]
fn remove_pet_rejects_built_in_pet() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();

    let error = store.remove_pet("system:copet").unwrap_err();

    assert!(error.to_string().contains("built-in"));
}

#[test]
fn remove_pet_rejects_any_bundled_builtin() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();

    let error = store
        .remove_pet(&format!("system:{NON_DEFAULT_BUILTIN_PET_ID}"))
        .unwrap_err();

    assert!(error.to_string().contains("built-in"));
}

#[test]
fn select_pet_persists_current_pet_in_config() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();
    create_user_pet(store.root(), "desk-cat", "Desk Cat");

    let state = store.select_pet("user:desk-cat").unwrap();
    let reloaded = store.ensure_ready().unwrap();

    assert_eq!(state.current_pet_id, "user:desk-cat");
    assert_eq!(reloaded.current_pet_id, "user:desk-cat");
}

#[test]
fn app_state_defaults_pet_window_size_to_40() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);

    let state = store.ensure_ready().unwrap();

    assert_eq!(state.pet_window_size, 40);
}

#[test]
fn app_state_exposes_default_locale() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);

    let state = store.ensure_ready().unwrap();
    let expected = copet_lib::i18n::default_locale();

    assert_eq!(state.locale, expected);
    assert_eq!(
        state.locale_preference,
        LocalePreference::from_locale(expected),
    );
}

#[test]
fn set_locale_preference_persists_explicit_locale() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();

    let state = store.set_locale_preference(LocalePreference::ZhCn).unwrap();
    let reloaded = store.ensure_ready().unwrap();

    assert_eq!(state.locale_preference, LocalePreference::ZhCn);
    assert_eq!(state.locale, Locale::ZhCn);
    assert_eq!(reloaded.locale_preference, LocalePreference::ZhCn);
    assert_eq!(reloaded.locale, Locale::ZhCn);
}

#[test]
fn legacy_system_locale_preference_is_migrated_to_detected_locale() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();

    let config_path = store.root().join("config.json");
    let raw = fs::read_to_string(&config_path).unwrap();
    let mut value: serde_json::Value = serde_json::from_str(&raw).unwrap();
    value
        .as_object_mut()
        .unwrap()
        .insert("localePreference".into(), serde_json::json!("system"));
    fs::write(&config_path, serde_json::to_vec_pretty(&value).unwrap()).unwrap();

    let state = store.ensure_ready().unwrap();
    let expected = copet_lib::i18n::default_locale();

    assert_eq!(state.locale, expected);
    assert_eq!(
        state.locale_preference,
        LocalePreference::from_locale(expected),
    );

    // The legacy "system" string should be rewritten on first load.
    let rewritten: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&config_path).unwrap()).unwrap();
    let stored = rewritten
        .as_object()
        .unwrap()
        .get("localePreference")
        .and_then(|v| v.as_str())
        .unwrap();
    assert!(stored == "en-US" || stored == "zh-CN");
    assert_ne!(stored, "system");
}

#[test]
fn set_pet_window_size_persists_selection_in_config() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();

    let state = store.set_pet_window_size(90).unwrap();
    let reloaded = store.ensure_ready().unwrap();

    assert_eq!(state.pet_window_size, 90);
    assert_eq!(reloaded.pet_window_size, 90);
}

#[test]
fn set_pet_window_size_clamps_zero_to_minimum() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();

    let state = store.set_pet_window_size(0).unwrap();
    let reloaded = store.ensure_ready().unwrap();

    assert_eq!(state.pet_window_size, 1);
    assert_eq!(reloaded.pet_window_size, 1);
}

#[test]
fn list_pets_hides_broken_user_packages_without_crashing() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();
    create_user_pet(store.root(), "good-pet", "Good Pet");
    fs::create_dir_all(store.root().join("pets/broken-pet")).unwrap();
    fs::write(store.root().join("pets/broken-pet/pet.json"), "{").unwrap();

    let pets = store.list_pets().unwrap();
    let ids = pets.iter().map(|pet| pet.id.as_str()).collect::<Vec<_>>();

    assert!(ids.contains(&"system:copet"));
    assert!(ids.contains(&"user:good-pet"));
    assert!(!ids.contains(&"user:broken-pet"));
}

#[test]
fn import_codex_pets_copies_valid_packages_and_skips_broken_packages() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let codex_pets = temp.path().join(".codex/pets");
    create_pet_package(&codex_pets.join("space-cat"), "space-cat", "Space Cat");
    fs::create_dir_all(codex_pets.join("broken")).unwrap();
    fs::write(codex_pets.join("broken/pet.json"), "{").unwrap();
    store.ensure_ready().unwrap();

    let result = store.import_codex_pets(&codex_pets).unwrap();
    let ids = result
        .pets
        .iter()
        .map(|pet| pet.id.as_str())
        .collect::<Vec<_>>();

    assert_eq!(result.imported, 1);
    assert_eq!(result.skipped, 1);
    assert!(ids.contains(&"user:space-cat"));
    assert!(store.root().join("pets/space-cat/pet.json").exists());
    assert!(store.root().join("pets/space-cat/spritesheet.png").exists());
}

#[test]
fn import_codex_pets_imports_packages_that_shadow_builtin_ids() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let codex_pets = temp.path().join(".codex/pets");
    create_pet_package(&codex_pets.join("space-cat"), "space-cat", "Space Cat");
    create_pet_package(
        &codex_pets.join(NON_DEFAULT_BUILTIN_PET_ID),
        NON_DEFAULT_BUILTIN_PET_ID,
        "Fake Builtin",
    );
    store.ensure_ready().unwrap();

    let result = store.import_codex_pets(&codex_pets).unwrap();
    let ids = result
        .pets
        .iter()
        .map(|pet| pet.id.as_str())
        .collect::<Vec<_>>();

    assert_eq!(result.imported, 2);
    assert_eq!(result.skipped, 0);
    assert!(store
        .root()
        .join("pets")
        .join(NON_DEFAULT_BUILTIN_PET_ID)
        .exists());
    assert!(ids.contains(&"system:dragon"));
    assert!(ids.contains(&"user:dragon"));
}

#[test]
fn list_codex_pets_reads_source_without_installing() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let codex_pets = temp.path().join(".codex/pets");
    create_pet_package(&codex_pets.join("space-cat"), "space-cat", "Space Cat");
    fs::create_dir_all(codex_pets.join("broken")).unwrap();
    fs::write(codex_pets.join("broken/pet.json"), "{").unwrap();
    store.ensure_ready().unwrap();

    let pets = store.list_codex_pets(&codex_pets).unwrap();

    assert_eq!(pets.len(), 1);
    assert_eq!(pets[0].id, "user:space-cat");
    assert!(pets[0].sprite_path.contains(".codex"));
    assert!(!store.root().join("pets/space-cat").exists());
}

#[test]
fn install_codex_pet_copies_one_pet_and_sets_current_pet() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let codex_pets = temp.path().join(".codex/pets");
    create_pet_package(&codex_pets.join("space-cat"), "space-cat", "Space Cat");
    create_pet_package(&codex_pets.join("desk-cat"), "desk-cat", "Desk Cat");
    store.ensure_ready().unwrap();
    let available = store.list_codex_pets(&codex_pets).unwrap();
    let space_cat = available
        .iter()
        .find(|pet| pet.id == "user:space-cat")
        .unwrap();

    let state = store.install_codex_pet(&codex_pets, &space_cat.id).unwrap();

    assert_eq!(state.current_pet_id, "user:space-cat");
    assert!(state.pets.iter().any(|pet| pet.id == "user:space-cat"));
    assert!(!state.pets.iter().any(|pet| pet.id == "user:desk-cat"));
    assert!(store.root().join("pets/space-cat/pet.json").exists());
}

#[test]
fn install_codex_pet_allows_user_pet_that_shadows_builtin_id() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let codex_pets = temp.path().join(".codex/pets");
    create_pet_package(
        &codex_pets.join(NON_DEFAULT_BUILTIN_PET_ID),
        NON_DEFAULT_BUILTIN_PET_ID,
        "Fake Builtin",
    );
    store.ensure_ready().unwrap();

    let state = store
        .install_codex_pet(&codex_pets, &format!("user:{NON_DEFAULT_BUILTIN_PET_ID}"))
        .unwrap();

    assert_eq!(state.current_pet_id, "user:dragon");
    assert!(store
        .root()
        .join("pets")
        .join(NON_DEFAULT_BUILTIN_PET_ID)
        .exists());
    assert!(state.pets.iter().any(|pet| pet.id == "system:dragon"));
    assert!(state.pets.iter().any(|pet| pet.id == "user:dragon"));
}

#[test]
fn install_codex_pet_rejects_unsafe_source_storage_id_without_writing() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let codex_pets = temp.path().join(".codex/pets");
    create_pet_package(&codex_pets.join("bad:id"), "desk-cat", "Desk Cat");
    store.ensure_ready().unwrap();

    let error = store
        .install_codex_pet(&codex_pets, "user:bad:id")
        .unwrap_err();

    assert!(error.to_string().contains("safe storage id"));
    assert!(!store.root().join("pets/bad:id").exists());
    assert!(!store.root().join("pets/desk-cat").exists());
}

#[test]
fn install_codex_pet_rejects_unsafe_manifest_id_without_writing() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let codex_pets = temp.path().join(".codex/pets");
    create_pet_package(&codex_pets.join("bad-manifest"), "bad:id", "Bad Manifest");
    store.ensure_ready().unwrap();

    let error = store
        .install_codex_pet(&codex_pets, "user:bad-manifest")
        .unwrap_err();

    assert!(error.to_string().contains("safe storage id"));
    assert!(!store.root().join("pets/bad-manifest").exists());
    assert!(!store.root().join("pets/bad:id").exists());
}

#[test]
fn agent_message_visible_defaults_to_true() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);

    let state = store.ensure_ready().unwrap();

    assert!(state.agent_message_visible);
}

#[test]
fn set_agent_message_visible_persists_and_round_trips() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();

    let updated = store.set_agent_message_visible(false).unwrap();
    assert!(!updated.agent_message_visible);

    // Open a fresh handle pointed at the same root; field must survive.
    let reopened = ConfigStore::with_builtin_dir(temp.path().join(".copet"), builtin_pets_dir());
    let state = reopened.app_state().unwrap();
    assert!(!state.agent_message_visible);
}

#[test]
fn legacy_config_missing_agent_message_visible_defaults_to_true() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join(".copet");
    fs::create_dir_all(&root).unwrap();
    // Write a config.json that resembles the old schema — no agentMessageVisible key.
    fs::write(
        root.join("config.json"),
        r#"{"currentPetId":"copet","onboardingComplete":false,"petWindowSize":30}"#,
    )
    .unwrap();

    let store = ConfigStore::with_builtin_dir(root, builtin_pets_dir());
    let state = store.app_state().unwrap();

    assert!(state.agent_message_visible);
}

#[test]
fn agent_auto_install_complete_defaults_to_false() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);

    store.ensure_ready().unwrap();

    assert!(!store.agent_auto_install_complete().unwrap());
}

#[test]
fn set_agent_auto_install_complete_persists_and_round_trips() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();

    store.set_agent_auto_install_complete(true).unwrap();

    let reopened = ConfigStore::with_builtin_dir(temp.path().join(".copet"), builtin_pets_dir());
    assert!(reopened.agent_auto_install_complete().unwrap());
}

#[test]
fn legacy_config_missing_agent_auto_install_complete_defaults_to_false() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join(".copet");
    fs::create_dir_all(&root).unwrap();
    fs::write(
        root.join("config.json"),
        r#"{"currentPetId":"copet","onboardingComplete":false,"petWindowSize":30}"#,
    )
    .unwrap();

    let store = ConfigStore::with_builtin_dir(root, builtin_pets_dir());

    assert!(!store.agent_auto_install_complete().unwrap());
}

#[test]
fn legacy_raw_user_current_pet_id_migrates_to_user_runtime_id() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join(".copet");
    create_pet_package(&root.join("pets/desk-cat"), "desk-cat", "Desk Cat");
    write_legacy_config(&root, "desk-cat");
    let store = ConfigStore::with_builtin_dir(root.clone(), builtin_pets_dir());

    let state = store.app_state().unwrap();
    let config: serde_json::Value =
        serde_json::from_slice(&fs::read(root.join("config.json")).unwrap()).unwrap();

    assert_eq!(state.current_pet_id, "user:desk-cat");
    assert_eq!(config["currentPetId"], "user:desk-cat");
}

#[test]
fn legacy_raw_builtin_current_pet_id_migrates_to_system_runtime_id() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join(".copet");
    write_legacy_config(&root, NON_DEFAULT_BUILTIN_PET_ID);
    let store = ConfigStore::with_builtin_dir(root.clone(), builtin_pets_dir());

    let state = store.app_state().unwrap();
    let config: serde_json::Value =
        serde_json::from_slice(&fs::read(root.join("config.json")).unwrap()).unwrap();

    assert_eq!(state.current_pet_id, "system:dragon");
    assert_eq!(config["currentPetId"], "system:dragon");
}

#[test]
fn legacy_raw_builtin_id_prefers_system_when_user_shadow_exists() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join(".copet");
    create_pet_package(
        &root.join("pets").join(NON_DEFAULT_BUILTIN_PET_ID),
        NON_DEFAULT_BUILTIN_PET_ID,
        "User Shadow",
    );
    write_legacy_config(&root, NON_DEFAULT_BUILTIN_PET_ID);
    let store = ConfigStore::with_builtin_dir(root.clone(), builtin_pets_dir());

    let state = store.app_state().unwrap();
    let config: serde_json::Value =
        serde_json::from_slice(&fs::read(root.join("config.json")).unwrap()).unwrap();

    assert_eq!(state.current_pet_id, "system:dragon");
    assert_eq!(config["currentPetId"], "system:dragon");
    assert!(state.pets.iter().any(|pet| pet.id == "system:dragon"));
    assert!(state.pets.iter().any(|pet| pet.id == "user:dragon"));
}

#[test]
fn codex_pet_runtime_id_comes_from_source_directory_name() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let codex_pets = temp.path().join(".codex/pets");
    create_pet_package(&codex_pets.join("desk-cat-2"), "desk-cat", "Desk Cat Copy");
    store.ensure_ready().unwrap();

    let available = store.list_codex_pets(&codex_pets).unwrap();
    let preview = available
        .iter()
        .find(|pet| pet.id == "user:desk-cat-2")
        .unwrap();
    let state = store.install_codex_pet(&codex_pets, &preview.id).unwrap();
    let installed_manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(store.root().join("pets/desk-cat-2/pet.json")).unwrap())
            .unwrap();

    assert!(!available.iter().any(|pet| pet.id == "user:desk-cat"));
    assert_eq!(state.current_pet_id, "user:desk-cat-2");
    assert!(state.pets.iter().any(|pet| pet.id == "user:desk-cat-2"));
    assert!(!store.root().join("pets/desk-cat").exists());
    assert_eq!(installed_manifest["id"], "desk-cat");
}

#[test]
fn app_state_exposes_namespaced_runtime_pet_ids() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);

    let state = store.ensure_ready().unwrap();

    assert_eq!(state.current_pet_id, "system:copet");
    assert!(state.pets.iter().any(|pet| pet.id == "system:copet"));
    assert!(state
        .pets
        .iter()
        .any(|pet| pet.id == format!("system:{NON_DEFAULT_BUILTIN_PET_ID}")));
}

#[test]
fn user_pet_runtime_id_comes_from_user_directory_name() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();
    create_user_pet(store.root(), "desk-cat-2", "Desk Cat Copy");
    let manifest_path = store.root().join("pets/desk-cat-2/pet.json");
    let mut manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(&manifest_path).unwrap()).unwrap();
    manifest["id"] = serde_json::Value::String("desk-cat".to_string());
    fs::write(
        &manifest_path,
        serde_json::to_vec_pretty(&manifest).unwrap(),
    )
    .unwrap();

    let state = store.app_state().unwrap();

    assert!(state.pets.iter().any(|pet| pet.id == "user:desk-cat-2"));
    assert!(!state.pets.iter().any(|pet| pet.id == "user:desk-cat"));
}

#[test]
fn selecting_namespaced_user_pet_persists_runtime_id() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();
    create_user_pet(store.root(), "desk-cat", "Desk Cat");

    let state = store.select_pet("user:desk-cat").unwrap();
    let reloaded = store.ensure_ready().unwrap();

    assert_eq!(state.current_pet_id, "user:desk-cat");
    assert_eq!(reloaded.current_pet_id, "user:desk-cat");
}

#[test]
fn removing_system_pet_is_rejected_by_namespace() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();

    let error = store.remove_pet("system:copet").unwrap_err();

    assert!(error.to_string().contains("built-in"));
}

fn create_user_pet(root: &Path, id: &str, display_name: &str) {
    let dir = root.join("pets").join(id);
    create_pet_package(&dir, id, display_name);
}

fn create_pet_package(dir: &Path, id: &str, display_name: &str) {
    fs::create_dir_all(dir).unwrap();
    fs::write(
        dir.join("pet.json"),
        format!(
            r#"{{
  "id": "{id}",
  "slug": "{id}",
  "displayName": "{display_name}",
  "frameWidth": 160,
  "frameHeight": 64,
  "gridColumns": 8,
  "gridRows": 9
}}"#
        ),
    )
    .unwrap();
    fs::write(dir.join("spritesheet.png"), b"sprite").unwrap();
}

fn write_legacy_config(root: &Path, current_pet_id: &str) {
    fs::create_dir_all(root).unwrap();
    fs::write(
        root.join("config.json"),
        format!(
            r#"{{
  "currentPetId": "{current_pet_id}",
  "onboardingComplete": false,
  "petWindowSize": 30
}}"#
        ),
    )
    .unwrap();
}
