use copet_lib::{
    config_store::ConfigStore,
    pet_import::{
        commit_import_previews, create_import_session, preview_codex_imports,
        preview_folder_imports, preview_zip_imports, ZIP_PREVIEW_MAX_FILE_BYTES,
    },
};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

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

fn manifest_bytes(id: &str, name: &str) -> Vec<u8> {
    format!(
        r#"{{
  "id": "{id}",
  "slug": "{id}",
  "displayName": "{name}",
  "description": "A test pet.",
  "frameWidth": 160,
  "frameHeight": 64,
  "gridColumns": 8,
  "gridRows": 9
}}"#
    )
    .into_bytes()
}

fn write_zip(path: &Path, entries: &[(&str, &[u8])]) {
    let file = fs::File::create(path).unwrap();
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default();
    for (name, contents) in entries {
        zip.start_file(name, options).unwrap();
        zip.write_all(contents).unwrap();
    }
    zip.finish().unwrap();
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
fn preview_zip_imports_accepts_root_package() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let zip_path = temp.path().join("root-pet.zip");
    write_zip(
        &zip_path,
        &[
            ("pet.json", &manifest_bytes("root-pet", "Root Pet")),
            ("spritesheet.png", b"sprite"),
        ],
    );

    let session = create_import_session(&store).unwrap();
    let batch = preview_zip_imports(&store, &session.session_id, &[zip_path]).unwrap();

    assert_eq!(batch.previews.len(), 1);
    assert_eq!(batch.skipped, 0);
    assert!(batch.errors.is_empty());
    let preview = &batch.previews[0];
    assert_eq!(preview.summary.id, "user:root-pet");
    assert!(preview.summary.sprite_path.contains("import-previews"));
    assert!(!store.root().join("pets/root-pet").exists());
}

#[test]
fn preview_zip_imports_accepts_multiple_child_packages() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let zip_path = temp.path().join("pets.zip");
    write_zip(
        &zip_path,
        &[
            ("alpha/pet.json", &manifest_bytes("alpha", "Alpha")),
            ("alpha/spritesheet.png", b"alpha"),
            ("beta/pet.json", &manifest_bytes("beta", "Beta")),
            ("beta/spritesheet.webp", b"beta"),
        ],
    );

    let session = create_import_session(&store).unwrap();
    let batch = preview_zip_imports(&store, &session.session_id, &[zip_path]).unwrap();

    assert_eq!(batch.skipped, 0);
    assert!(batch.errors.is_empty());
    assert_eq!(
        batch
            .previews
            .iter()
            .map(|preview| preview.summary.id.as_str())
            .collect::<Vec<_>>(),
        vec!["user:alpha", "user:beta"]
    );
    assert!(!store.root().join("pets/alpha").exists());
    assert!(!store.root().join("pets/beta").exists());
}

#[test]
fn preview_zip_imports_rejects_path_traversal() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let zip_path = temp.path().join("unsafe.zip");
    write_zip(
        &zip_path,
        &[
            ("pet.json", &manifest_bytes("root-pet", "Root Pet")),
            ("spritesheet.png", b"sprite"),
            ("../escape.txt", b"escape"),
        ],
    );

    let session = create_import_session(&store).unwrap();
    let batch = preview_zip_imports(&store, &session.session_id, &[zip_path]).unwrap();

    assert!(batch.previews.is_empty());
    assert!(!temp.path().join("escape.txt").exists());
    assert!(batch
        .errors
        .iter()
        .any(|error| error.contains("unsafe zip path")));
}

#[test]
fn preview_zip_imports_continues_after_bad_zip() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let bad_zip_path = temp.path().join("unsafe.zip");
    let good_zip_path = temp.path().join("good.zip");
    write_zip(
        &bad_zip_path,
        &[
            ("pet.json", &manifest_bytes("bad-pet", "Bad Pet")),
            ("spritesheet.png", b"bad"),
            ("../escape.txt", b"escape"),
        ],
    );
    write_zip(
        &good_zip_path,
        &[
            ("pet.json", &manifest_bytes("good-pet", "Good Pet")),
            ("spritesheet.png", b"good"),
        ],
    );

    let session = create_import_session(&store).unwrap();
    let batch =
        preview_zip_imports(&store, &session.session_id, &[bad_zip_path, good_zip_path]).unwrap();

    assert_eq!(batch.previews.len(), 1);
    assert_eq!(batch.previews[0].summary.id, "user:good-pet");
    assert!(batch
        .errors
        .iter()
        .any(|error| error.contains("unsafe zip path")));
    assert!(!temp.path().join("escape.txt").exists());
    assert!(!store.root().join("pets/good-pet").exists());
}

#[test]
fn preview_zip_imports_rejects_duplicate_output_paths() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let zip_path = temp.path().join("duplicate.zip");
    write_zip(
        &zip_path,
        &[
            ("pet.json", &manifest_bytes("first-pet", "First Pet")),
            ("./pet.json", &manifest_bytes("second-pet", "Second Pet")),
            ("spritesheet.png", b"sprite"),
        ],
    );

    let session = create_import_session(&store).unwrap();
    let batch = preview_zip_imports(&store, &session.session_id, &[zip_path]).unwrap();

    assert!(batch.previews.is_empty());
    assert!(batch
        .errors
        .iter()
        .any(|error| error.contains("duplicate zip path")));
    assert!(!store.root().join("pets/first-pet").exists());
    assert!(!store.root().join("pets/second-pet").exists());
}

#[test]
fn preview_zip_imports_rejects_entries_over_file_size_limit() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let zip_path = temp.path().join("large.zip");
    let oversized_sprite = vec![b'x'; ZIP_PREVIEW_MAX_FILE_BYTES as usize + 1];
    write_zip(
        &zip_path,
        &[
            ("pet.json", &manifest_bytes("large-pet", "Large Pet")),
            ("spritesheet.png", &oversized_sprite),
        ],
    );

    let session = create_import_session(&store).unwrap();
    let batch = preview_zip_imports(&store, &session.session_id, &[zip_path]).unwrap();

    assert!(batch.previews.is_empty());
    assert!(batch
        .errors
        .iter()
        .any(|error| error.contains("exceeds zip entry size limit")));
    assert!(!store.root().join("pets/large-pet").exists());
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
    let source_dir = temp.path().join("copet");
    create_pet_package(temp.path(), "copet", "copet", "Local CoPet");

    let session = create_import_session(&store).unwrap();
    let batch = preview_folder_imports(&store, &session.session_id, &[source_dir]).unwrap();

    let result = commit_import_previews(
        &store,
        &session.session_id,
        &[batch.previews[0].preview_id.clone()],
    )
    .unwrap();

    assert_eq!(result.imported.len(), 1);
    assert!(result.state.pets.iter().any(|pet| pet.id == "system:copet"));
    assert!(result.state.pets.iter().any(|pet| pet.id == "user:copet"));
    assert!(store.root().join("pets/copet/pet.json").exists());
}

#[test]
fn commit_import_previews_suffixes_user_id_collisions_without_rewriting_manifest() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    create_pet_package(
        &store.root().join("pets"),
        "local-fox",
        "local-fox",
        "Local Fox",
    );
    let source_dir = temp.path().join("local-fox");
    create_pet_package(temp.path(), "local-fox", "local-fox", "New Local Fox");

    let session = create_import_session(&store).unwrap();
    let batch = preview_folder_imports(&store, &session.session_id, &[source_dir]).unwrap();

    let result = commit_import_previews(
        &store,
        &session.session_id,
        &[batch.previews[0].preview_id.clone()],
    )
    .unwrap();

    assert_eq!(result.imported.len(), 1);
    assert_eq!(result.imported[0].id, "user:local-fox-2");
    assert!(result
        .state
        .pets
        .iter()
        .any(|pet| pet.id == "user:local-fox"));
    assert!(result
        .state
        .pets
        .iter()
        .any(|pet| pet.id == "user:local-fox-2"));
    let raw_manifest = fs::read_to_string(store.root().join("pets/local-fox-2/pet.json")).unwrap();
    assert!(raw_manifest.contains(r#""id": "local-fox""#));
    assert!(!raw_manifest.contains("user:"));
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
fn commit_import_previews_suffixes_duplicate_manifest_ids_in_one_request() {
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
        vec!["user:shared-fox", "user:shared-fox-2"]
    );
    assert!(result.failed.is_empty());
    assert!(store.root().join("pets/shared-fox/pet.json").exists());
    assert!(store.root().join("pets/shared-fox-2/pet.json").exists());
}
