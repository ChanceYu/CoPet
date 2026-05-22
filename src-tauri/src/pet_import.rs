use crate::{
    app_state::AppState,
    config_store::{
        copy_pet_package_for_import, read_pet_package_for_import, safe_pet_storage_id, ConfigStore,
        StoreError,
    },
    i18n::Locale,
    pet_package::{user_pet_id, PetNamespace, PetPackage, PetSummary},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeSet,
    fs, io,
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const STALE_SESSION_AGE: Duration = Duration::from_secs(24 * 60 * 60);
const PREVIEW_METADATA_FILE: &str = ".copet-import-preview.json";

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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PetImportFailure {
    pub preview_id: String,
    pub error_message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PetImportCommitResult {
    pub imported: Vec<PetSummary>,
    pub failed: Vec<PetImportFailure>,
    pub state: AppState,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetImportPreviewMetadata {
    preview_id: String,
    intended_storage_id: String,
    intended_pet_id: String,
    source_label: String,
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
                    if !safe_pet_storage_id(&package.manifest.id) {
                        skipped += 1;
                        continue;
                    }

                    let Some(storage_id) =
                        source_dir_label(&source_dir).filter(|label| safe_pet_storage_id(label))
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

                    let preview =
                        build_preview(&preview_id, storage_id, &source_dir, &target_dir, package);
                    if let Err(error) = write_preview_metadata(&target_dir, &preview, storage_id) {
                        let _ = fs::remove_dir_all(&target_dir);
                        errors.push(format!("could not stage {}: {error}", source_dir.display()));
                        continue;
                    }

                    previews.push(preview);
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

pub fn discard_import_session(store: &ConfigStore, session_id: &str) -> Result<(), StoreError> {
    let dir = existing_session_dir(store, session_id)?;
    fs::remove_dir_all(dir)?;
    Ok(())
}

pub fn commit_import_previews(
    store: &ConfigStore,
    session_id: &str,
    preview_ids: &[String],
) -> Result<PetImportCommitResult, StoreError> {
    store.ensure_ready()?;
    let target_session_dir = existing_session_dir(store, session_id)?;

    let mut imported = Vec::new();
    let mut failed = Vec::new();

    for preview_id in preview_ids {
        if !safe_pet_storage_id(preview_id) {
            failed.push(PetImportFailure {
                preview_id: preview_id.clone(),
                error_message: "preview id is invalid".to_string(),
            });
            continue;
        }

        let preview_dir = target_session_dir.join(preview_id);
        let Some(package) = read_pet_package_for_import(&preview_dir) else {
            failed.push(PetImportFailure {
                preview_id: preview_id.clone(),
                error_message: "preview package is no longer available".to_string(),
            });
            continue;
        };
        if !safe_pet_storage_id(&package.manifest.id) {
            failed.push(PetImportFailure {
                preview_id: preview_id.clone(),
                error_message: "preview package has an invalid pet id".to_string(),
            });
            continue;
        }

        let base_storage_id = match preview_intended_storage_id(preview_id, &preview_dir, &package)
        {
            Ok(storage_id) => storage_id,
            Err(error) => {
                failed.push(PetImportFailure {
                    preview_id: preview_id.clone(),
                    error_message: error.to_string(),
                });
                continue;
            }
        };

        let (storage_id, target_dir) = match reserve_user_pet_target(store, &base_storage_id) {
            Ok(reserved) => reserved,
            Err(error) => {
                failed.push(PetImportFailure {
                    preview_id: preview_id.clone(),
                    error_message: error.to_string(),
                });
                continue;
            }
        };
        if let Err(error) =
            copy_reserved_pet_package_for_import(&preview_dir, &target_dir, &package)
        {
            let _ = fs::remove_dir_all(&target_dir);
            failed.push(PetImportFailure {
                preview_id: preview_id.clone(),
                error_message: error.to_string(),
            });
            continue;
        }

        if let Err(error) = fs::remove_dir_all(&preview_dir) {
            failed.push(PetImportFailure {
                preview_id: preview_id.clone(),
                error_message: format!("imported pet but could not remove preview: {error}"),
            });
        }
        let sprite_path = package
            .sprite_path
            .file_name()
            .map(|name| target_dir.join(name))
            .unwrap_or_else(|| package.sprite_path.clone());
        imported.push(
            PetPackage {
                sprite_path,
                ..package
            }
            .summary(PetNamespace::User, &storage_id),
        );
    }

    Ok(PetImportCommitResult {
        imported,
        failed,
        state: store.app_state()?,
    })
}

pub fn localize_preview_batch_partial_errors(
    mut batch: PetImportPreviewBatch,
    locale: Locale,
) -> PetImportPreviewBatch {
    batch.errors = batch
        .errors
        .into_iter()
        .map(|error| localize_partial_error_message(&error, locale))
        .collect();
    batch
}

pub fn localize_commit_result_partial_errors(
    mut result: PetImportCommitResult,
    locale: Locale,
) -> PetImportCommitResult {
    for failure in &mut result.failed {
        failure.error_message = localize_partial_error_message(&failure.error_message, locale);
    }
    result
}

fn localize_partial_error_message(message: &str, locale: Locale) -> String {
    match locale {
        Locale::EnUs => message.to_string(),
        Locale::ZhCn => localize_partial_error_message_zh_cn(message),
    }
}

fn localize_partial_error_message_zh_cn(message: &str) -> String {
    if let Some(localized) = localize_known_exact_partial_error_zh_cn(message) {
        return localized.to_string();
    }

    if let Some(path) = message.strip_prefix("selected path is not a folder: ") {
        return format!("所选路径不是文件夹：{path}");
    }
    if let Some(path) = message.strip_prefix("no pet packages found in ") {
        return format!("未在 {path} 中找到宠物包");
    }
    if let Some((path, error)) = message
        .strip_prefix("could not read ")
        .and_then(|rest| rest.rsplit_once(": "))
    {
        return format!(
            "无法读取 {path}：{}",
            localize_partial_error_message_zh_cn(error)
        );
    }
    if let Some((path, error)) = message
        .strip_prefix("could not open ")
        .and_then(|rest| rest.rsplit_once(": "))
    {
        return format!(
            "无法打开 {path}：{}",
            localize_partial_error_message_zh_cn(error)
        );
    }
    if let Some((path, error)) = message
        .strip_prefix("could not stage ")
        .and_then(|rest| rest.rsplit_once(": "))
    {
        return format!(
            "无法暂存 {path}：{}",
            localize_partial_error_message_zh_cn(error)
        );
    }
    if let Some((path, error)) = message
        .strip_prefix("could not preview ")
        .and_then(|rest| rest.rsplit_once(": "))
    {
        return format!(
            "无法预览 {path}：{}",
            localize_partial_error_message_zh_cn(error)
        );
    }
    if let Some((path, error)) = message
        .strip_prefix("could not clean up preview scratch for ")
        .and_then(|rest| rest.rsplit_once(": "))
    {
        return format!(
            "无法清理 {path} 的预览临时文件：{}",
            localize_partial_error_message_zh_cn(error)
        );
    }
    if let Some(error) = message.strip_prefix("imported pet but could not remove preview: ") {
        return format!(
            "已导入宠物，但无法移除预览：{}",
            localize_partial_error_message_zh_cn(error)
        );
    }
    if let Some(message) = message.strip_prefix("pet package is invalid: ") {
        return format!(
            "宠物包无效：{}",
            localize_partial_error_message_zh_cn(message)
        );
    }
    if let Some(error) = message.strip_prefix("I/O error: ") {
        return format!("I/O 错误：{error}");
    }
    if let Some(error) = message.strip_prefix("JSON error: ") {
        return format!("JSON 错误：{error}");
    }

    message.to_string()
}

fn localize_known_exact_partial_error_zh_cn(message: &str) -> Option<&'static str> {
    match message {
        "preview id is invalid" => Some("预览 ID 无效"),
        "preview package is no longer available" => Some("预览宠物包已不可用"),
        "preview package has an invalid pet id" => Some("预览宠物包的宠物 ID 无效"),
        "preview metadata does not match selected preview" => Some("预览元数据与所选预览不匹配"),
        "preview metadata has an invalid pet id" => Some("预览元数据包含无效的宠物 ID"),
        "preview metadata does not match intended pet id" => Some("预览元数据与目标宠物 ID 不匹配"),
        "import preview session id is invalid" => Some("导入预览会话 ID 无效"),
        "import preview session was not found" => Some("未找到导入预览会话"),
        "could not create a unique import preview session" => Some("无法创建唯一的导入预览会话"),
        "pet id must be a safe storage id" => Some("宠物 ID 必须是安全的存储 ID"),
        _ => None,
    }
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

fn write_preview_metadata(
    preview_dir: &Path,
    preview: &PetImportPreview,
    intended_storage_id: &str,
) -> Result<(), StoreError> {
    let metadata = PetImportPreviewMetadata {
        preview_id: preview.preview_id.clone(),
        intended_storage_id: intended_storage_id.to_string(),
        intended_pet_id: preview.intended_pet_id.clone(),
        source_label: preview.source_label.clone(),
    };
    fs::write(
        preview_dir.join(PREVIEW_METADATA_FILE),
        serde_json::to_vec_pretty(&metadata)?,
    )?;
    Ok(())
}

fn reserve_user_pet_target(
    store: &ConfigStore,
    base_id: &str,
) -> Result<(String, PathBuf), StoreError> {
    if !safe_pet_storage_id(base_id) {
        return Err(StoreError::InvalidPetPackage(
            "pet id must be a safe storage id".to_string(),
        ));
    }

    let pets_dir = store.pets_dir();
    for suffix in 1.. {
        let storage_id = if suffix == 1 {
            base_id.to_string()
        } else {
            format!("{base_id}-{suffix}")
        };
        let target_dir = pets_dir.join(&storage_id);
        match fs::create_dir(&target_dir) {
            Ok(()) => return Ok((storage_id, target_dir)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.into()),
        }
    }

    unreachable!("exhausted numeric pet storage id suffixes")
}

fn copy_reserved_pet_package_for_import(
    source_dir: &Path,
    target_dir: &Path,
    package: &PetPackage,
) -> Result<(), StoreError> {
    let source_root = fs::canonicalize(source_dir)?;
    fs::copy(source_root.join("pet.json"), target_dir.join("pet.json"))?;
    if let Some(sprite_name) = package.sprite_path.file_name() {
        fs::copy(&package.sprite_path, target_dir.join(sprite_name))?;
    }
    for sound_path in package.sound_file_paths() {
        let canonical_sound_path = fs::canonicalize(&sound_path)?;
        let relative_path = canonical_sound_path
            .strip_prefix(&source_root)
            .map_err(|_| {
                StoreError::InvalidPetPackage(format!(
                    "sound file must be inside package: {}",
                    sound_path.display()
                ))
            })?;
        let target_path = target_dir.join(relative_path);
        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(canonical_sound_path, target_path)?;
    }
    Ok(())
}

fn preview_intended_storage_id(
    requested_preview_id: &str,
    preview_dir: &Path,
    package: &PetPackage,
) -> Result<String, StoreError> {
    let metadata_path = preview_dir.join(PREVIEW_METADATA_FILE);
    if !metadata_path.exists() {
        return Ok(package.manifest.id.clone());
    }

    let metadata: PetImportPreviewMetadata = serde_json::from_slice(&fs::read(metadata_path)?)?;
    if metadata.preview_id != requested_preview_id {
        return Err(StoreError::InvalidPetPackage(
            "preview metadata does not match selected preview".to_string(),
        ));
    }
    if !safe_pet_storage_id(&metadata.intended_storage_id) {
        return Err(StoreError::InvalidPetPackage(
            "preview metadata has an invalid pet id".to_string(),
        ));
    }
    if metadata.intended_pet_id != user_pet_id(&metadata.intended_storage_id) {
        return Err(StoreError::InvalidPetPackage(
            "preview metadata does not match intended pet id".to_string(),
        ));
    }
    Ok(metadata.intended_storage_id)
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
