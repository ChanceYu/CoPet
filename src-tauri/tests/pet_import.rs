use copet_lib::{
    config_store::ConfigStore,
    i18n::Locale,
    pet_import::{
        commit_import_previews, create_import_session, localize_commit_result_partial_errors,
        preview_codex_imports, preview_folder_imports,
    },
};
use std::{
    env,
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

static HOME_ENV_LOCK: Mutex<()> = Mutex::new(());

struct EnvRestore {
    key: &'static str,
    value: Option<OsString>,
}

impl Drop for EnvRestore {
    fn drop(&mut self) {
        if let Some(value) = &self.value {
            env::set_var(self.key, value);
        } else {
            env::remove_var(self.key);
        }
    }
}

fn builtin_pets_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets/pets")
}

fn make_store(temp: &tempfile::TempDir) -> ConfigStore {
    ConfigStore::with_builtin_dir(temp.path().join(".copet"), builtin_pets_dir())
}

fn create_pet_package(root: &Path, storage_id: &str, manifest_id: &str, display_name: &str) {
    let package_dir = root.join(storage_id);
    fs::create_dir_all(&package_dir).unwrap();
    fs::write(
        package_dir.join("pet.json"),
        format!(
            r#"{{
  "id": "{manifest_id}",
  "slug": "{manifest_id}",
  "displayName": "{display_name}",
  "description": "A test pet.",
  "frameWidth": 160,
  "frameHeight": 64,
  "gridColumns": 8,
  "gridRows": 9
}}"#
        ),
    )
    .unwrap();
    fs::write(package_dir.join("spritesheet.png"), b"sprite").unwrap();
}

#[test]
fn preview_session_directory_is_under_copet_root() {
    let _guard = HOME_ENV_LOCK.lock().unwrap();
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let _restore_home = EnvRestore {
        key: "HOME",
        value: env::var_os("HOME"),
    };
    env::set_var("HOME", &home);

    let session = copet_lib::create_pet_import_session().unwrap();

    assert!(home
        .join(".copet")
        .join("import-previews")
        .join(session.session_id)
        .exists());
}

#[test]
fn preview_codex_imports_stages_valid_packages_without_installing() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let codex_pets = temp.path().join(".codex/pets");
    create_pet_package(&codex_pets, "space-cat", "space-cat", "Space Cat");
    fs::create_dir_all(codex_pets.join("broken")).unwrap();
    fs::write(codex_pets.join("broken/pet.json"), "{not valid json").unwrap();

    let session = create_import_session(&store).unwrap();
    let batch = preview_codex_imports(&store, &session.session_id, &codex_pets).unwrap();

    assert_eq!(batch.previews.len(), 1);
    assert_eq!(batch.skipped, 1);
    assert!(batch.errors.is_empty());
    let preview = &batch.previews[0];
    assert_eq!(preview.summary.id, "user:space-cat");
    assert_eq!(preview.intended_pet_id, "user:space-cat");
    assert!(preview.summary.sprite_path.contains("import-previews"));
    assert!(preview.selected_by_default);
    assert!(!store.root().join("pets/space-cat").exists());
}

#[test]
fn preview_codex_imports_treats_missing_or_invalid_path_as_empty_source() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let session = create_import_session(&store).unwrap();

    let missing_codex_pets = temp.path().join(".codex/pets");
    let missing_batch =
        preview_codex_imports(&store, &session.session_id, &missing_codex_pets).unwrap();
    assert!(missing_batch.previews.is_empty());
    assert_eq!(missing_batch.skipped, 0);
    assert!(missing_batch.errors.is_empty());

    let file_codex_pets = temp.path().join("codex-pets-file");
    fs::write(&file_codex_pets, b"not a directory").unwrap();
    let file_batch = preview_codex_imports(&store, &session.session_id, &file_codex_pets).unwrap();
    assert!(file_batch.previews.is_empty());
    assert_eq!(file_batch.skipped, 0);
    assert!(file_batch.errors.is_empty());
}

#[test]
fn preview_folder_imports_accepts_package_folder_and_child_packages() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let selected_single = temp.path().join("single-pet");
    create_pet_package(temp.path(), "single-pet", "single-pet", "Single Pet");
    let selected_parent = temp.path().join("pet-packages");
    create_pet_package(&selected_parent, "beta", "beta", "Beta");
    create_pet_package(&selected_parent, "alpha", "alpha", "Alpha");

    let session = create_import_session(&store).unwrap();
    let batch = preview_folder_imports(
        &store,
        &session.session_id,
        &[selected_single, selected_parent],
    )
    .unwrap();

    assert_eq!(batch.skipped, 0);
    assert!(batch.errors.is_empty());
    assert_eq!(
        batch
            .previews
            .iter()
            .map(|preview| preview.summary.id.as_str())
            .collect::<Vec<_>>(),
        vec!["user:alpha", "user:beta", "user:single-pet"]
    );
    assert!(!store.root().join("pets/alpha").exists());
    assert!(!store.root().join("pets/beta").exists());
    assert!(!store.root().join("pets/single-pet").exists());
}

#[test]
fn preview_folder_imports_skips_unsafe_manifest_id_without_staging() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let source_dir = temp.path().join("bad-manifest");
    create_pet_package(temp.path(), "bad-manifest", "bad:id", "Bad Manifest");

    let session = create_import_session(&store).unwrap();
    let batch = preview_folder_imports(&store, &session.session_id, &[source_dir]).unwrap();

    assert!(batch.previews.is_empty());
    assert_eq!(batch.skipped, 1);
    assert!(batch.errors.is_empty());
    assert!(!store
        .import_previews_dir()
        .join(&session.session_id)
        .join("bad-manifest")
        .exists());
    assert!(!store.root().join("pets/bad-manifest").exists());
}

#[test]
fn preview_folder_imports_skips_unsafe_source_storage_id_without_staging() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let source_dir = temp.path().join("bad:id");
    create_pet_package(temp.path(), "bad:id", "bad-id", "Bad Source");

    let session = create_import_session(&store).unwrap();
    let batch = preview_folder_imports(&store, &session.session_id, &[source_dir]).unwrap();

    assert!(batch.previews.is_empty());
    assert_eq!(batch.skipped, 1);
    assert!(batch.errors.is_empty());
    assert!(!store
        .import_previews_dir()
        .join(&session.session_id)
        .join("bad-id")
        .exists());
    assert!(!store.root().join("pets/bad-id").exists());
}

#[test]
fn preview_folder_imports_uses_safe_source_storage_id_without_rewriting_manifest() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let source_dir = temp.path().join("desk-cat-2");
    create_pet_package(temp.path(), "desk-cat-2", "desk-cat", "Desk Cat");

    let session = create_import_session(&store).unwrap();
    let batch = preview_folder_imports(&store, &session.session_id, &[source_dir]).unwrap();

    assert_eq!(batch.skipped, 0);
    assert!(batch.errors.is_empty());
    assert_eq!(batch.previews.len(), 1);
    let preview = &batch.previews[0];
    assert_eq!(preview.summary.id, "user:desk-cat-2");
    assert_eq!(preview.intended_pet_id, "user:desk-cat-2");

    let staged_manifest: serde_json::Value = serde_json::from_slice(
        &fs::read(
            store
                .import_previews_dir()
                .join(&session.session_id)
                .join(&preview.preview_id)
                .join("pet.json"),
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(staged_manifest["id"], "desk-cat");
    assert!(!store.root().join("pets/desk-cat-2").exists());
}

#[test]
fn preview_folder_imports_repeated_source_in_same_session_keeps_distinct_staged_previews() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let source_dir = temp.path().join("repeat-cat");
    create_pet_package(temp.path(), "repeat-cat", "repeat-cat", "Repeat Cat");

    let session = create_import_session(&store).unwrap();
    let first = preview_folder_imports(
        &store,
        &session.session_id,
        std::slice::from_ref(&source_dir),
    )
    .unwrap();
    let second = preview_folder_imports(&store, &session.session_id, &[source_dir]).unwrap();

    assert_eq!(first.previews.len(), 1);
    assert_eq!(second.previews.len(), 1);
    let first_id = &first.previews[0].preview_id;
    let second_id = &second.previews[0].preview_id;
    assert_ne!(first_id, second_id);
    assert!(store
        .import_previews_dir()
        .join(&session.session_id)
        .join(first_id)
        .join("pet.json")
        .exists());
    assert!(store
        .import_previews_dir()
        .join(&session.session_id)
        .join(second_id)
        .join("pet.json")
        .exists());
}

#[test]
fn preview_folder_imports_rejects_malformed_session_id() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let source_dir = temp.path().join("desk-cat");
    create_pet_package(temp.path(), "desk-cat", "desk-cat", "Desk Cat");

    let result = preview_folder_imports(&store, "../bad-session", &[source_dir]);

    assert!(result.is_err());
    assert!(!store.import_previews_dir().join("bad-session").exists());
}

#[test]
fn preview_folder_imports_rejects_unknown_session_id_without_creating_directory() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let source_dir = temp.path().join("desk-cat");
    create_pet_package(temp.path(), "desk-cat", "desk-cat", "Desk Cat");

    let result = preview_folder_imports(&store, "session-unknown", &[source_dir]);

    assert!(result.is_err());
    assert!(!store.import_previews_dir().join("session-unknown").exists());
}

#[test]
fn discard_import_session_rejects_malformed_or_unknown_session_id() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);

    assert!(copet_lib::pet_import::discard_import_session(&store, "../bad-session").is_err());
    assert!(copet_lib::pet_import::discard_import_session(&store, "session-unknown").is_err());
    assert!(!store.import_previews_dir().join("bad-session").exists());
    assert!(!store.import_previews_dir().join("session-unknown").exists());
}

#[test]
fn preview_folder_imports_collects_staging_errors_and_continues() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let selected_parent = temp.path().join("pet-packages");
    create_pet_package(
        &selected_parent,
        "broken-stage",
        "broken-stage",
        "Broken Stage",
    );
    create_pet_package(
        &selected_parent,
        "working-stage",
        "working-stage",
        "Working Stage",
    );

    let session = create_import_session(&store).unwrap();
    fs::write(
        store
            .import_previews_dir()
            .join(&session.session_id)
            .join(".broken-stage.staging"),
        b"not a directory",
    )
    .unwrap();

    let batch = preview_folder_imports(&store, &session.session_id, &[selected_parent]).unwrap();

    assert_eq!(batch.previews.len(), 1);
    assert_eq!(batch.previews[0].summary.id, "user:working-stage");
    assert_eq!(batch.skipped, 0);
    assert_eq!(batch.errors.len(), 1);
    assert!(batch.errors[0].contains("broken-stage"));
    assert!(store
        .import_previews_dir()
        .join(&session.session_id)
        .join("working-stage")
        .join("pet.json")
        .exists());
}

#[test]
fn commit_import_previews_imports_only_selected_previews() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let selected_parent = temp.path().join("pet-packages");
    create_pet_package(&selected_parent, "alpha", "alpha", "Alpha");
    create_pet_package(&selected_parent, "beta", "beta", "Beta");

    let session = create_import_session(&store).unwrap();
    let batch = preview_folder_imports(&store, &session.session_id, &[selected_parent]).unwrap();
    let alpha_preview_id = batch
        .previews
        .iter()
        .find(|preview| preview.summary.id == "user:alpha")
        .unwrap()
        .preview_id
        .clone();

    let result = commit_import_previews(&store, &session.session_id, &[alpha_preview_id]).unwrap();

    assert_eq!(result.imported.len(), 1);
    assert_eq!(result.imported[0].id, "user:alpha");
    assert!(result.failed.is_empty());
    assert!(store.root().join("pets/alpha/pet.json").exists());
    assert!(!store.root().join("pets/beta/pet.json").exists());
}

#[test]
fn commit_import_previews_allows_system_id_collision() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let source_dir = temp.path().join("copet-neo");
    create_pet_package(temp.path(), "copet-neo", "copet-neo", "Local CoPet Neo");

    let session = create_import_session(&store).unwrap();
    let batch = preview_folder_imports(&store, &session.session_id, &[source_dir]).unwrap();

    let result = commit_import_previews(
        &store,
        &session.session_id,
        &[batch.previews[0].preview_id.clone()],
    )
    .unwrap();

    assert_eq!(result.imported.len(), 1);
    assert!(result
        .state
        .pets
        .iter()
        .any(|pet| pet.id == "system:copet-neo"));
    assert!(result
        .state
        .pets
        .iter()
        .any(|pet| pet.id == "user:copet-neo"));
    assert!(store.root().join("pets/copet-neo/pet.json").exists());
}

#[test]
fn commit_import_previews_preserves_source_storage_id_without_rewriting_manifest() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let source_dir = temp.path().join("desk-cat-2");
    create_pet_package(temp.path(), "desk-cat-2", "desk-cat", "Desk Cat");

    let session = create_import_session(&store).unwrap();
    let batch = preview_folder_imports(&store, &session.session_id, &[source_dir]).unwrap();

    let result = commit_import_previews(
        &store,
        &session.session_id,
        &[batch.previews[0].preview_id.clone()],
    )
    .unwrap();

    assert_eq!(result.imported.len(), 1);
    assert_eq!(result.imported[0].id, "user:desk-cat-2");
    assert!(result
        .state
        .pets
        .iter()
        .any(|pet| pet.id == "user:desk-cat-2"));
    assert!(store.root().join("pets/desk-cat-2/pet.json").exists());
    assert!(!store.root().join("pets/desk-cat/pet.json").exists());
    let raw_manifest = fs::read_to_string(store.root().join("pets/desk-cat-2/pet.json")).unwrap();
    assert!(raw_manifest.contains(r#""id": "desk-cat""#));
    assert!(!raw_manifest.contains("user:"));
    assert!(!store
        .root()
        .join("pets/desk-cat-2/.copet-import-preview.json")
        .exists());
}

#[test]
fn commit_import_previews_falls_back_to_manifest_id_for_older_previews_without_metadata() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let source_dir = temp.path().join("legacy-storage");
    create_pet_package(temp.path(), "legacy-storage", "legacy-pet", "Legacy Pet");

    let session = create_import_session(&store).unwrap();
    let batch = preview_folder_imports(&store, &session.session_id, &[source_dir]).unwrap();
    fs::remove_file(
        store
            .import_previews_dir()
            .join(&session.session_id)
            .join(&batch.previews[0].preview_id)
            .join(".copet-import-preview.json"),
    )
    .unwrap();

    let result = commit_import_previews(
        &store,
        &session.session_id,
        &[batch.previews[0].preview_id.clone()],
    )
    .unwrap();

    assert_eq!(result.imported.len(), 1);
    assert_eq!(result.imported[0].id, "user:legacy-pet");
    assert!(store.root().join("pets/legacy-pet/pet.json").exists());
    assert!(!store.root().join("pets/legacy-storage/pet.json").exists());
}

#[test]
fn commit_import_previews_replaces_user_id_collisions_without_rewriting_manifest() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    create_pet_package(
        &store.root().join("pets"),
        "local-fox",
        "local-fox",
        "Local Fox",
    );
    fs::write(store.root().join("pets/local-fox/obsolete.txt"), "old").unwrap();
    let source_dir = temp.path().join("local-fox");
    create_pet_package(temp.path(), "local-fox", "desk-cat", "Desk Cat");

    let session = create_import_session(&store).unwrap();
    let batch = preview_folder_imports(&store, &session.session_id, &[source_dir]).unwrap();

    let result = commit_import_previews(
        &store,
        &session.session_id,
        &[batch.previews[0].preview_id.clone()],
    )
    .unwrap();

    assert_eq!(result.imported.len(), 1);
    assert_eq!(result.imported[0].id, "user:local-fox");
    assert!(result
        .state
        .pets
        .iter()
        .any(|pet| pet.id == "user:local-fox"));
    assert!(!store.root().join("pets/local-fox-2").exists());
    assert!(!store.root().join("pets/local-fox/obsolete.txt").exists());
    let raw_manifest = fs::read_to_string(store.root().join("pets/local-fox/pet.json")).unwrap();
    assert!(raw_manifest.contains(r#""id": "desk-cat""#));
    assert!(raw_manifest.contains(r#""displayName": "Desk Cat""#));
    assert!(!raw_manifest.contains("user:"));
}

#[test]
fn commit_import_previews_replaces_base_id_even_when_suffix_directory_exists() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    create_pet_package(
        &store.root().join("pets"),
        "local-fox",
        "local-fox",
        "Local Fox",
    );
    create_pet_package(
        &store.root().join("pets"),
        "local-fox-2",
        "local-fox",
        "Local Fox Copy",
    );
    let source_dir = temp.path().join("local-fox");
    create_pet_package(temp.path(), "local-fox", "desk-cat", "Desk Cat");

    let session = create_import_session(&store).unwrap();
    let batch = preview_folder_imports(&store, &session.session_id, &[source_dir]).unwrap();

    let result = commit_import_previews(
        &store,
        &session.session_id,
        &[batch.previews[0].preview_id.clone()],
    )
    .unwrap();

    assert_eq!(result.imported.len(), 1);
    assert_eq!(result.imported[0].id, "user:local-fox");
    assert!(result
        .state
        .pets
        .iter()
        .any(|pet| pet.id == "user:local-fox"));
    let raw_manifest = fs::read_to_string(store.root().join("pets/local-fox/pet.json")).unwrap();
    assert!(raw_manifest.contains(r#""id": "desk-cat""#));
    assert!(raw_manifest.contains(r#""displayName": "Desk Cat""#));
    assert!(!raw_manifest.contains("user:"));
    assert!(!store.root().join("pets/local-fox-3").exists());
    let existing_manifest =
        fs::read_to_string(store.root().join("pets/local-fox-2/pet.json")).unwrap();
    assert!(existing_manifest.contains(r#""id": "local-fox""#));
    assert!(existing_manifest.contains(r#""displayName": "Local Fox Copy""#));
}

#[test]
fn commit_import_previews_rejects_malformed_or_unknown_session_without_installing() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);

    assert!(commit_import_previews(&store, "../bad-session", &["alpha".to_string()]).is_err());
    assert!(commit_import_previews(&store, "session-unknown", &["alpha".to_string()]).is_err());
    assert!(!store.root().join("pets/alpha").exists());
    assert!(!store.import_previews_dir().join("bad-session").exists());
    assert!(!store.import_previews_dir().join("session-unknown").exists());
}

#[test]
fn commit_import_previews_reports_missing_selected_preview_and_continues() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let source_dir = temp.path().join("alpha");
    create_pet_package(temp.path(), "alpha", "alpha", "Alpha");

    let session = create_import_session(&store).unwrap();
    let batch = preview_folder_imports(&store, &session.session_id, &[source_dir]).unwrap();

    let result = commit_import_previews(
        &store,
        &session.session_id,
        &["missing".to_string(), batch.previews[0].preview_id.clone()],
    )
    .unwrap();

    assert_eq!(result.imported.len(), 1);
    assert_eq!(result.imported[0].id, "user:alpha");
    assert_eq!(result.failed.len(), 1);
    assert_eq!(result.failed[0].preview_id, "missing");
    assert!(result.failed[0]
        .error_message
        .contains("preview package is no longer available"));
    assert!(store.root().join("pets/alpha/pet.json").exists());
}

#[test]
fn localizes_commit_partial_failures_for_chinese_locale() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let source_dir = temp.path().join("alpha");
    create_pet_package(temp.path(), "alpha", "alpha", "Alpha");

    let session = create_import_session(&store).unwrap();
    let batch = preview_folder_imports(&store, &session.session_id, &[source_dir]).unwrap();

    let result = commit_import_previews(
        &store,
        &session.session_id,
        &["missing".to_string(), batch.previews[0].preview_id.clone()],
    )
    .unwrap();
    let localized = localize_commit_result_partial_errors(result, Locale::ZhCn);

    assert_eq!(localized.imported.len(), 1);
    assert_eq!(localized.failed.len(), 1);
    assert_eq!(localized.failed[0].preview_id, "missing");
    assert_eq!(localized.failed[0].error_message, "预览宠物包已不可用");
}

#[test]
fn commit_import_previews_reports_unsafe_preview_id_without_installing() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let source_dir = temp.path().join("alpha");
    create_pet_package(temp.path(), "alpha", "alpha", "Alpha");

    let session = create_import_session(&store).unwrap();
    preview_folder_imports(&store, &session.session_id, &[source_dir]).unwrap();

    let result =
        commit_import_previews(&store, &session.session_id, &["../alpha".to_string()]).unwrap();

    assert!(result.imported.is_empty());
    assert_eq!(result.failed.len(), 1);
    assert_eq!(result.failed[0].preview_id, "../alpha");
    assert!(result.failed[0].error_message.contains("preview id"));
    assert!(!store.root().join("pets/alpha").exists());
}

#[test]
fn commit_import_previews_rejects_unsafe_metadata_storage_id_without_installing() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let source_dir = temp.path().join("desk-cat");
    create_pet_package(temp.path(), "desk-cat", "desk-cat", "Desk Cat");

    let session = create_import_session(&store).unwrap();
    let batch = preview_folder_imports(&store, &session.session_id, &[source_dir]).unwrap();
    let preview = &batch.previews[0];
    fs::write(
        store
            .import_previews_dir()
            .join(&session.session_id)
            .join(&preview.preview_id)
            .join(".copet-import-preview.json"),
        format!(
            r#"{{
  "previewId": "{}",
  "intendedStorageId": "bad:id",
  "intendedPetId": "user:bad:id",
  "sourceLabel": "desk-cat"
}}"#,
            preview.preview_id
        ),
    )
    .unwrap();

    let result =
        commit_import_previews(&store, &session.session_id, &[preview.preview_id.clone()]).unwrap();

    assert!(result.imported.is_empty());
    assert_eq!(result.failed.len(), 1);
    assert!(result.failed[0].error_message.contains("invalid pet id"));
    assert!(!store.root().join("pets/desk-cat").exists());
    assert!(!store.root().join("pets/bad:id").exists());
}

#[test]
fn commit_import_previews_rejects_mismatched_preview_metadata_without_installing() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let source_dir = temp.path().join("desk-cat");
    create_pet_package(temp.path(), "desk-cat", "desk-cat", "Desk Cat");

    let session = create_import_session(&store).unwrap();
    let batch = preview_folder_imports(&store, &session.session_id, &[source_dir]).unwrap();
    let preview = &batch.previews[0];
    fs::write(
        store
            .import_previews_dir()
            .join(&session.session_id)
            .join(&preview.preview_id)
            .join(".copet-import-preview.json"),
        r#"{
  "previewId": "other-preview",
  "intendedStorageId": "desk-cat",
  "intendedPetId": "user:desk-cat",
  "sourceLabel": "desk-cat"
}"#,
    )
    .unwrap();

    let result =
        commit_import_previews(&store, &session.session_id, &[preview.preview_id.clone()]).unwrap();

    assert!(result.imported.is_empty());
    assert_eq!(result.failed.len(), 1);
    assert!(result.failed[0].error_message.contains("preview metadata"));
    assert!(!store.root().join("pets/desk-cat").exists());
}

#[test]
fn commit_import_previews_rejects_mismatched_intended_pet_id_metadata_without_installing() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let source_dir = temp.path().join("desk-cat");
    create_pet_package(temp.path(), "desk-cat", "desk-cat", "Desk Cat");

    let session = create_import_session(&store).unwrap();
    let batch = preview_folder_imports(&store, &session.session_id, &[source_dir]).unwrap();
    let preview = &batch.previews[0];
    fs::write(
        store
            .import_previews_dir()
            .join(&session.session_id)
            .join(&preview.preview_id)
            .join(".copet-import-preview.json"),
        format!(
            r#"{{
  "previewId": "{}",
  "intendedStorageId": "desk-cat",
  "intendedPetId": "user:other",
  "sourceLabel": "desk-cat"
}}"#,
            preview.preview_id
        ),
    )
    .unwrap();

    let result =
        commit_import_previews(&store, &session.session_id, &[preview.preview_id.clone()]).unwrap();

    assert!(result.imported.is_empty());
    assert_eq!(result.failed.len(), 1);
    assert!(result.failed[0].error_message.contains("preview metadata"));
    assert!(!store.root().join("pets/desk-cat").exists());
}

#[test]
fn commit_import_previews_keeps_distinct_source_ids_for_duplicate_manifest_ids() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let selected_parent = temp.path().join("pet-packages");
    create_pet_package(&selected_parent, "first-fox", "shared-fox", "First Fox");
    create_pet_package(&selected_parent, "second-fox", "shared-fox", "Second Fox");

    let session = create_import_session(&store).unwrap();
    let batch = preview_folder_imports(&store, &session.session_id, &[selected_parent]).unwrap();
    let preview_ids = batch
        .previews
        .iter()
        .map(|preview| preview.preview_id.clone())
        .collect::<Vec<_>>();

    let result = commit_import_previews(&store, &session.session_id, &preview_ids).unwrap();

    assert_eq!(
        result
            .imported
            .iter()
            .map(|summary| summary.id.as_str())
            .collect::<Vec<_>>(),
        vec!["user:first-fox", "user:second-fox"]
    );
    assert!(result.failed.is_empty());
    assert!(store.root().join("pets/first-fox/pet.json").exists());
    assert!(store.root().join("pets/second-fox/pet.json").exists());
    assert!(!store.root().join("pets/shared-fox/pet.json").exists());
}
