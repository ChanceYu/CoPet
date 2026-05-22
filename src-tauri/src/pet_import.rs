use crate::{
    config_store::{
        copy_pet_package_for_import, read_pet_package_for_import, ConfigStore, StoreError,
    },
    pet_package::{user_pet_id, PetNamespace, PetPackage, PetSummary},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeSet,
    fs, io,
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use zip::ZipArchive;

const STALE_SESSION_AGE: Duration = Duration::from_secs(24 * 60 * 60);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PetImportSession {
    pub session_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PetImportPreview {
    pub preview_id: String,
    pub summary: PetSummary,
    pub source_label: String,
    pub intended_pet_id: String,
    pub selected_by_default: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warning: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PetImportPreviewBatch {
    pub previews: Vec<PetImportPreview>,
    pub skipped: usize,
    pub errors: Vec<String>,
}

pub fn create_import_session(store: &ConfigStore) -> Result<PetImportSession, StoreError> {
    store.ensure_ready()?;
    let previews_dir = store.import_previews_dir();
    fs::create_dir_all(&previews_dir)?;
    cleanup_stale_sessions(&previews_dir)?;

    for _ in 0..100 {
        let session_id = new_session_id();
        let dir = session_dir(store, &session_id);
        if !dir.exists() {
            fs::create_dir_all(dir)?;
            return Ok(PetImportSession { session_id });
        }
    }

    Err(StoreError::InvalidPetPackage(
        "could not create a unique import preview session".to_string(),
    ))
}

pub fn preview_codex_imports(
    store: &ConfigStore,
    session_id: &str,
    codex_pets_dir: &Path,
) -> Result<PetImportPreviewBatch, StoreError> {
    preview_folder_imports(store, session_id, &[codex_pets_dir.to_path_buf()])
}

pub fn preview_folder_imports(
    store: &ConfigStore,
    session_id: &str,
    folders: &[PathBuf],
) -> Result<PetImportPreviewBatch, StoreError> {
    store.ensure_ready()?;
    let target_session_dir = existing_session_dir(store, session_id)?;

    let mut previews = Vec::new();
    let mut skipped = 0;
    let mut errors = Vec::new();
    let mut used_preview_ids = existing_preview_ids(&target_session_dir)?;

    for folder in folders {
        match folder_candidates(folder) {
            Ok(candidates) => {
                if candidates.is_empty() {
                    errors.push(format!("no pet packages found in {}", folder.display()));
                }

                for source_dir in candidates {
                    let Some(package) = read_pet_package_for_import(&source_dir) else {
                        skipped += 1;
                        continue;
                    };
                    if !safe_storage_id(&package.manifest.id) {
                        skipped += 1;
                        continue;
                    }

                    let Some(storage_id) =
                        source_dir_label(&source_dir).filter(|label| safe_storage_id(label))
                    else {
                        skipped += 1;
                        continue;
                    };
                    let preview_id = preview_id_for(storage_id, &mut used_preview_ids);
                    let target_dir = target_session_dir.join(&preview_id);
                    if let Err(error) =
                        copy_pet_package_for_import(&source_dir, &target_dir, &package)
                    {
                        errors.push(format!("could not stage {}: {error}", source_dir.display()));
                        continue;
                    }

                    previews.push(build_preview(
                        &preview_id,
                        storage_id,
                        &source_dir,
                        &target_dir,
                        package,
                    ));
                }
            }
            Err(message) => errors.push(message),
        }
    }

    previews.sort_by(|left, right| {
        left.summary
            .display_name
            .cmp(&right.summary.display_name)
            .then_with(|| left.summary.id.cmp(&right.summary.id))
    });

    Ok(PetImportPreviewBatch {
        previews,
        skipped,
        errors,
    })
}

pub fn preview_zip_imports(
    store: &ConfigStore,
    session_id: &str,
    zip_paths: &[PathBuf],
) -> Result<PetImportPreviewBatch, StoreError> {
    store.ensure_ready()?;
    let target_session_dir = existing_session_dir(store, session_id)?;

    let mut previews = Vec::new();
    let mut skipped = 0;
    let mut errors = Vec::new();

    for zip_path in zip_paths {
        let scratch_dir = match unique_scratch_dir(&target_session_dir, zip_path) {
            Ok(dir) => dir,
            Err(error) => {
                errors.push(format!("could not stage {}: {error}", zip_path.display()));
                continue;
            }
        };
        match extract_zip_for_preview(zip_path, &scratch_dir) {
            Ok(preview_root) => {
                match preview_folder_imports(store, session_id, &[preview_root]) {
                    Ok(mut batch) => {
                        previews.append(&mut batch.previews);
                        skipped += batch.skipped;
                        errors.append(&mut batch.errors);
                    }
                    Err(error) => {
                        errors.push(format!("could not preview {}: {error}", zip_path.display()))
                    }
                }
                let _ = fs::remove_dir_all(&scratch_dir);
            }
            Err(message) => {
                errors.push(message);
                let _ = fs::remove_dir_all(&scratch_dir);
            }
        }
    }

    previews.sort_by(|left, right| {
        left.summary
            .display_name
            .cmp(&right.summary.display_name)
            .then_with(|| left.summary.id.cmp(&right.summary.id))
    });

    Ok(PetImportPreviewBatch {
        previews,
        skipped,
        errors,
    })
}

pub fn discard_import_session(store: &ConfigStore, session_id: &str) -> Result<(), StoreError> {
    let dir = existing_session_dir(store, session_id)?;
    fs::remove_dir_all(dir)?;
    Ok(())
}

fn build_preview(
    preview_id: &str,
    storage_id: &str,
    source_dir: &Path,
    target_dir: &Path,
    package: PetPackage,
) -> PetImportPreview {
    let staged_sprite_path = package
        .sprite_path
        .file_name()
        .map(|name| target_dir.join(name))
        .unwrap_or_else(|| package.sprite_path.clone());
    let summary = PetPackage {
        sprite_path: staged_sprite_path,
        ..package
    }
    .summary(PetNamespace::User, storage_id);

    PetImportPreview {
        preview_id: preview_id.to_string(),
        summary,
        source_label: source_dir
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| source_dir.to_string_lossy().into_owned()),
        intended_pet_id: user_pet_id(storage_id),
        selected_by_default: true,
        warning: None,
    }
}

fn session_dir(store: &ConfigStore, session_id: &str) -> PathBuf {
    store.import_previews_dir().join(session_id)
}

fn existing_session_dir(store: &ConfigStore, session_id: &str) -> Result<PathBuf, StoreError> {
    if !safe_session_id(session_id) {
        return Err(StoreError::InvalidPetPackage(
            "import preview session id is invalid".to_string(),
        ));
    }

    let dir = session_dir(store, session_id);
    if !dir.is_dir() {
        return Err(StoreError::InvalidPetPackage(
            "import preview session was not found".to_string(),
        ));
    }
    Ok(dir)
}

fn existing_preview_ids(session_dir: &Path) -> Result<BTreeSet<String>, StoreError> {
    let mut ids = BTreeSet::new();
    for entry in fs::read_dir(session_dir)? {
        let path = entry?.path();
        if let Some(name) = path.file_name().and_then(|name| name.to_str()) {
            ids.insert(name.to_string());
        }
    }
    Ok(ids)
}

fn folder_candidates(folder: &Path) -> Result<Vec<PathBuf>, String> {
    if !folder.is_dir() {
        return Err(format!(
            "selected path is not a folder: {}",
            folder.display()
        ));
    }

    if is_pet_package_dir(folder) {
        return Ok(vec![folder.to_path_buf()]);
    }
    if is_pet_package_candidate_dir(folder) {
        return Ok(vec![folder.to_path_buf()]);
    }

    let mut candidates = Vec::new();
    let entries = fs::read_dir(folder)
        .map_err(|error| format!("could not read {}: {error}", folder.display()))?;
    for entry in entries {
        let path = entry
            .map_err(|error| format!("could not read {}: {error}", folder.display()))?
            .path();
        if path.is_dir() && is_pet_package_candidate_dir(&path) {
            candidates.push(path);
        }
    }
    candidates.sort();
    Ok(candidates)
}

fn unique_scratch_dir(session_dir: &Path, zip_path: &Path) -> Result<PathBuf, StoreError> {
    let stem = zip_path
        .file_stem()
        .and_then(|name| name.to_str())
        .map(sanitize_preview_segment)
        .unwrap_or_else(|| "archive".to_string());
    let base = format!(".zip-{stem}");

    for suffix in 1.. {
        let candidate = if suffix == 1 {
            session_dir.join(&base)
        } else {
            session_dir.join(format!("{base}-{suffix}"))
        };
        match fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.into()),
        }
    }
    unreachable!()
}

fn extract_zip_for_preview(zip_path: &Path, scratch_dir: &Path) -> Result<PathBuf, String> {
    let file = fs::File::open(zip_path)
        .map_err(|error| format!("could not open {}: {error}", zip_path.display()))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|error| format!("could not read {}: {error}", zip_path.display()))?;
    let raw_dir = scratch_dir.join("contents");
    fs::create_dir(&raw_dir)
        .map_err(|error| format!("could not stage {}: {error}", zip_path.display()))?;

    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("could not read {}: {error}", zip_path.display()))?;
        let Some(enclosed_name) = file.enclosed_name() else {
            return Err(format!(
                "unsafe zip path in {}: {}",
                zip_path.display(),
                file.name()
            ));
        };
        let target_path = raw_dir.join(enclosed_name);

        if file.is_dir() {
            fs::create_dir_all(&target_path)
                .map_err(|error| format!("could not stage {}: {error}", zip_path.display()))?;
            continue;
        }

        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("could not stage {}: {error}", zip_path.display()))?;
        }
        let mut target_file = fs::File::create(&target_path)
            .map_err(|error| format!("could not stage {}: {error}", zip_path.display()))?;
        io::copy(&mut file, &mut target_file)
            .map_err(|error| format!("could not stage {}: {error}", zip_path.display()))?;
    }

    Ok(normalize_zip_preview_root(&raw_dir))
}

fn normalize_zip_preview_root(raw_dir: &Path) -> PathBuf {
    let Some(package) = read_pet_package_for_import(raw_dir) else {
        return raw_dir.to_path_buf();
    };
    if !safe_storage_id(&package.manifest.id) {
        return raw_dir.to_path_buf();
    }

    let normalized_dir = raw_dir
        .parent()
        .map(|parent| parent.join(&package.manifest.id))
        .unwrap_or_else(|| raw_dir.to_path_buf());
    if fs::rename(raw_dir, &normalized_dir).is_ok() {
        normalized_dir
    } else {
        raw_dir.to_path_buf()
    }
}

fn is_pet_package_dir(dir: &Path) -> bool {
    read_pet_package_for_import(dir).is_some()
}

fn is_pet_package_candidate_dir(dir: &Path) -> bool {
    dir.join("pet.json").is_file()
        || dir.join("spritesheet.webp").is_file()
        || dir.join("spritesheet.png").is_file()
}

fn source_dir_label(dir: &Path) -> Option<&str> {
    dir.file_name().and_then(|name| name.to_str())
}

fn safe_storage_id(value: &str) -> bool {
    !value.is_empty()
        && value != "."
        && value != ".."
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
}

fn safe_session_id(value: &str) -> bool {
    value.starts_with("session-")
        && !value.is_empty()
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_'))
}

fn preview_id_for(storage_id: &str, used_preview_ids: &mut BTreeSet<String>) -> String {
    let base = sanitize_preview_segment(storage_id);
    if used_preview_ids.insert(base.clone()) {
        return base;
    }

    for suffix in 2.. {
        let candidate = format!("{base}-{suffix}");
        if used_preview_ids.insert(candidate.clone()) {
            return candidate;
        }
    }
    unreachable!()
}

fn sanitize_preview_segment(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>();
    if sanitized.is_empty() || sanitized == "." || sanitized == ".." {
        "session".to_string()
    } else {
        sanitized
    }
}

fn new_session_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!("session-{nanos}-{}", std::process::id())
}

fn cleanup_stale_sessions(previews_dir: &Path) -> Result<(), StoreError> {
    let now = SystemTime::now();
    for entry in fs::read_dir(previews_dir)? {
        let path = entry?.path();
        if !path.is_dir() {
            continue;
        }

        let Ok(modified) = fs::metadata(&path).and_then(|metadata| metadata.modified()) else {
            continue;
        };
        if now
            .duration_since(modified)
            .is_ok_and(|age| age > STALE_SESSION_AGE)
        {
            let _ = fs::remove_dir_all(path);
        }
    }
    Ok(())
}
