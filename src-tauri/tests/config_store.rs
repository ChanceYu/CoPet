use pethover_lib::{
    config_store::ConfigStore,
    i18n::{Locale, LocalePreference},
    pet_registry::BUILTIN_PET_ID,
};
use std::{fs, path::Path, path::PathBuf};

fn builtin_pets_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets/pets")
}

fn make_store(temp: &tempfile::TempDir) -> ConfigStore {
    ConfigStore::with_builtin_dir(temp.path().join(".pethover"), builtin_pets_dir())
}

#[test]
fn ensure_ready_initializes_pethover_tree_without_copying_builtins() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);

    let state = store.ensure_ready().unwrap();

    assert_eq!(state.current_pet_id, "pethover");
    assert!(!state.onboarding_complete);
    assert!(state.pets.iter().any(|pet| pet.id == "pethover"));
    assert!(store.root().join("config.json").exists());
    assert!(store.root().join("runtime").exists());
    // Built-in pets are not copied to the user dir under the new architecture.
    assert!(!store.root().join("pets/pethover").exists());
    assert!(!store.root().join("pets/goku").exists());
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
    let goku = state.pets.iter().find(|pet| pet.id == "goku").unwrap();

    assert!(ids.contains(&"pethover"));
    assert!(ids.contains(&"goku"));
    assert!(goku.built_in);
    assert_eq!(goku.display_name, "Goku");
}

#[test]
fn list_pets_returns_user_imports_alongside_builtins() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();
    create_user_pet(store.root(), "desk-cat", "Desk Cat");

    let state = store.app_state().unwrap();
    let desk_cat = state.pets.iter().find(|pet| pet.id == "desk-cat").unwrap();
    let pethover = state.pets.iter().find(|pet| pet.id == "pethover").unwrap();

    assert!(!desk_cat.built_in);
    assert!(pethover.built_in);
}

#[test]
fn list_pets_orders_pethover_then_user_imports_then_builtins() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();
    create_user_pet(store.root(), "z-user-pet", "Zebra Pet");
    create_user_pet(store.root(), "a-user-pet", "Alpha Pet");

    let pets = store.list_pets().unwrap();

    assert_eq!(pets.first().unwrap().id, "pethover");

    let user_indices = pets
        .iter()
        .enumerate()
        .filter_map(|(idx, pet)| (!pet.built_in).then_some((idx, pet.id.as_str())))
        .collect::<Vec<_>>();
    let builtin_non_pethover_indices = pets
        .iter()
        .enumerate()
        .filter_map(|(idx, pet)| {
            (pet.built_in && pet.id != "pethover").then_some((idx, pet.id.as_str()))
        })
        .collect::<Vec<_>>();

    // Every user import must come before any non-pethover built-in.
    let max_user_idx = user_indices.iter().map(|(idx, _)| *idx).max().unwrap();
    let min_builtin_idx = builtin_non_pethover_indices
        .iter()
        .map(|(idx, _)| *idx)
        .min()
        .unwrap();
    assert!(max_user_idx < min_builtin_idx);

    // User imports sort alphabetically by display name within their group.
    let user_ids = user_indices.iter().map(|(_, id)| *id).collect::<Vec<_>>();
    assert_eq!(user_ids, vec!["a-user-pet", "z-user-pet"]);
}

#[test]
fn ensure_ready_prunes_stale_builtin_copies_from_user_dir() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    fs::create_dir_all(store.root().join("pets")).unwrap();
    // Simulate a stale copy left over from the previous sync-based architecture.
    create_user_pet(store.root(), "pethover", "Stale PetHover");
    create_user_pet(store.root(), "goku", "Stale Goku");
    create_user_pet(store.root(), "desk-cat", "Desk Cat");

    store.ensure_ready().unwrap();

    assert!(!store.root().join("pets/pethover").exists());
    assert!(!store.root().join("pets/goku").exists());
    assert!(store.root().join("pets/desk-cat").exists());
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
    let local_fox = state.pets.iter().find(|pet| pet.id == "local-fox").unwrap();

    assert_eq!(state.current_pet_id, "local-fox");
    // Imported pet always lives in user dir regardless of manifest hint.
    assert!(store.root().join("pets/local-fox/pet.json").exists());
    assert!(!local_fox.built_in);
}

#[test]
fn import_pet_files_rejects_builtin_id_collision() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();
    let manifest = r#"{
  "id": "goku",
  "slug": "goku",
  "displayName": "Fake Goku",
  "frameWidth": 160,
  "frameHeight": 64,
  "gridColumns": 8,
  "gridRows": 9
}"#;

    let error = store
        .import_pet_files(manifest, "spritesheet.png", b"sprite".to_vec())
        .unwrap_err();

    assert!(error.to_string().contains("built-in"));
    assert!(!store.root().join("pets/goku").exists());
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
        .find(|pet| pet.id == "folder-fox")
        .unwrap();

    assert_eq!(state.current_pet_id, "folder-fox");
    assert!(store.root().join("pets/folder-fox/pet.json").exists());
    assert!(store
        .root()
        .join("pets/folder-fox/spritesheet.png")
        .exists());
    assert!(!folder_fox.built_in);
}

#[test]
fn remove_pet_deletes_user_pet_and_falls_back_when_current() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();
    create_user_pet(store.root(), "desk-cat", "Desk Cat");
    store.select_pet("desk-cat").unwrap();

    let state = store.remove_pet("desk-cat").unwrap();

    assert_eq!(state.current_pet_id, BUILTIN_PET_ID);
    assert!(!state.pets.iter().any(|pet| pet.id == "desk-cat"));
    assert!(!store.root().join("pets/desk-cat").exists());
}

#[test]
fn remove_pet_rejects_built_in_pet() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();

    let error = store.remove_pet(BUILTIN_PET_ID).unwrap_err();

    assert!(error.to_string().contains("built-in"));
}

#[test]
fn remove_pet_rejects_any_bundled_builtin() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();

    let error = store.remove_pet("goku").unwrap_err();

    assert!(error.to_string().contains("built-in"));
}

#[test]
fn select_pet_persists_current_pet_in_config() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();
    create_user_pet(store.root(), "desk-cat", "Desk Cat");

    let state = store.select_pet("desk-cat").unwrap();
    let reloaded = store.ensure_ready().unwrap();

    assert_eq!(state.current_pet_id, "desk-cat");
    assert_eq!(reloaded.current_pet_id, "desk-cat");
}

#[test]
fn app_state_defaults_pet_window_size_to_30() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);

    let state = store.ensure_ready().unwrap();

    assert_eq!(state.pet_window_size, 30);
}

#[test]
fn app_state_exposes_default_locale() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);

    let state = store.ensure_ready().unwrap();

    assert_eq!(state.locale, pethover_lib::i18n::default_locale());
    assert_eq!(state.locale_preference, LocalePreference::System);
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
fn set_locale_preference_system_returns_to_default_locale_detection() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();
    store.set_locale_preference(LocalePreference::ZhCn).unwrap();

    let state = store
        .set_locale_preference(LocalePreference::System)
        .unwrap();

    assert_eq!(state.locale_preference, LocalePreference::System);
    assert_eq!(state.locale, pethover_lib::i18n::default_locale());
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

    assert!(ids.contains(&"pethover"));
    assert!(ids.contains(&"good-pet"));
    assert!(!ids.contains(&"broken-pet"));
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
    assert!(ids.contains(&"space-cat"));
    assert!(store.root().join("pets/space-cat/pet.json").exists());
    assert!(store.root().join("pets/space-cat/spritesheet.png").exists());
}

#[test]
fn import_codex_pets_skips_packages_that_collide_with_builtin_ids() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let codex_pets = temp.path().join(".codex/pets");
    create_pet_package(&codex_pets.join("space-cat"), "space-cat", "Space Cat");
    create_pet_package(&codex_pets.join("goku"), "goku", "Fake Goku");
    store.ensure_ready().unwrap();

    let result = store.import_codex_pets(&codex_pets).unwrap();

    assert_eq!(result.imported, 1);
    assert_eq!(result.skipped, 1);
    assert!(!store.root().join("pets/goku").exists());
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
    assert_eq!(pets[0].id, "space-cat");
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

    let state = store.install_codex_pet(&codex_pets, "space-cat").unwrap();

    assert_eq!(state.current_pet_id, "space-cat");
    assert!(state.pets.iter().any(|pet| pet.id == "space-cat"));
    assert!(!state.pets.iter().any(|pet| pet.id == "desk-cat"));
    assert!(store.root().join("pets/space-cat/pet.json").exists());
}

#[test]
fn install_codex_pet_rejects_builtin_id_collision() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let codex_pets = temp.path().join(".codex/pets");
    create_pet_package(&codex_pets.join("goku"), "goku", "Fake Goku");
    store.ensure_ready().unwrap();

    let error = store.install_codex_pet(&codex_pets, "goku").unwrap_err();

    assert!(error.to_string().contains("built-in"));
    assert!(!store.root().join("pets/goku").exists());
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
