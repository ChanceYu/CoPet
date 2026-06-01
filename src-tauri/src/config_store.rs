use crate::{
    app_state::{
        default_pet_window_size, normalize_pet_window_size, AgentMessageDisplay, AppState,
        PetInteractionPrefs, PetWindowSize, DEFAULT_PET_WINDOW_SIZE, MAX_PET_WINDOW_SIZE,
        MIN_PET_WINDOW_SIZE,
    },
    i18n::{default_locale, Locale, LocalePreference},
    pet_package::{
        collect_pet_sounds, find_sprite_path, parse_runtime_pet_id, system_pet_id, user_pet_id,
        PetManifest, PetNamespace, PetPackage, PetSummary,
    },
    pet_registry::{BUILTIN_PET_ID, BUILTIN_SOUND_PACK_ID, PRIORITY_BUILTIN_PET_IDS},
    sound_pack::{
        parse_runtime_sound_pack_id, scan_sound_packs_with_storage_ids, system_sound_pack_id,
        SoundPack, SoundPackNamespace, SoundPackSummary,
    },
};
use serde::{
    de::{self, Visitor},
    Deserialize, Deserializer, Serialize,
};
use std::{
    collections::BTreeMap,
    fs, io,
    path::{Path, PathBuf},
    sync::OnceLock,
};

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("home directory was not found")]
    MissingHome,
    #[error("pet '{0}' was not found")]
    PetNotFound(String),
    #[error("sound pack '{0}' was not found")]
    SoundPackNotFound(String),
    #[error("built-in pet '{0}' cannot be removed")]
    BuiltInPetCannotBeRemoved(String),
    #[error("pet package is invalid: {0}")]
    InvalidPetPackage(String),
    #[error("I/O error: {0}")]
    Io(#[from] io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Clone)]
pub struct ConfigStore {
    root: PathBuf,
    builtin_pets_dir: Option<PathBuf>,
    builtin_sounds_dir: Option<PathBuf>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PetImportResult {
    pub imported: usize,
    pub skipped: usize,
    pub pets: Vec<PetSummary>,
}

static BUILTIN_PETS_DIR: OnceLock<PathBuf> = OnceLock::new();
static BUILTIN_SOUNDS_DIR: OnceLock<PathBuf> = OnceLock::new();

/// Set the process-wide built-in pets directory. Called once at startup from `main.rs`
/// with the Tauri resource path. Subsequent calls are silently ignored.
pub fn set_builtin_pets_dir(path: PathBuf) {
    let _ = BUILTIN_PETS_DIR.set(path);
}

pub fn builtin_pets_dir() -> Option<PathBuf> {
    BUILTIN_PETS_DIR.get().cloned()
}

/// Set the process-wide built-in sound packs directory. Called once at startup from `main.rs`
/// with the Tauri resource path. Subsequent calls are silently ignored.
pub fn set_builtin_sounds_dir(path: PathBuf) {
    let _ = BUILTIN_SOUNDS_DIR.set(path);
}

pub fn builtin_sounds_dir() -> Option<PathBuf> {
    BUILTIN_SOUNDS_DIR.get().cloned()
}

impl ConfigStore {
    pub fn from_home() -> Result<Self, StoreError> {
        let home = dirs::home_dir().ok_or(StoreError::MissingHome)?;
        Ok(Self {
            root: home.join(".copet"),
            builtin_pets_dir: builtin_pets_dir(),
            builtin_sounds_dir: builtin_sounds_dir(),
        })
    }

    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            builtin_pets_dir: None,
            builtin_sounds_dir: None,
        }
    }

    pub fn with_builtin_dir(root: impl Into<PathBuf>, builtin_dir: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            builtin_pets_dir: Some(builtin_dir.into()),
            builtin_sounds_dir: None,
        }
    }

    pub fn with_builtin_dirs(
        root: impl Into<PathBuf>,
        builtin_pets_dir: impl Into<PathBuf>,
        builtin_sounds_dir: impl Into<PathBuf>,
    ) -> Self {
        Self {
            root: root.into(),
            builtin_pets_dir: Some(builtin_pets_dir.into()),
            builtin_sounds_dir: Some(builtin_sounds_dir.into()),
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn agent_auto_install_complete(&self) -> Result<bool, StoreError> {
        Ok(self.load_or_create_config()?.agent_auto_install_complete)
    }

    pub fn set_agent_auto_install_complete(&self, complete: bool) -> Result<(), StoreError> {
        let mut config = self.load_or_create_config()?;
        config.agent_auto_install_complete = complete;
        self.save_config(&config)
    }

    pub fn effective_locale(&self) -> Result<Locale, StoreError> {
        let config = self.load_or_create_config()?;
        Ok(config.locale_preference.effective_locale())
    }

    pub fn ensure_ready(&self) -> Result<AppState, StoreError> {
        self.ensure_dirs()?;
        self.load_or_create_config()?;
        self.remove_legacy_pet_index()?;
        self.app_state()
    }

    pub fn app_state(&self) -> Result<AppState, StoreError> {
        self.ensure_dirs()?;
        let mut config = self.load_or_create_config()?;
        let pets = self.list_pets()?;
        let sound_packs = self.list_sound_packs()?;
        let normalized_pet_window_size = normalize_pet_window_size(config.pet_window_size);

        if let Some(resolved_pet_id) = resolve_current_pet_id(&config.current_pet_id, &pets) {
            if resolved_pet_id != config.current_pet_id {
                config.current_pet_id = resolved_pet_id;
                self.save_config(&config)?;
            }
        } else {
            config.current_pet_id = system_pet_id(BUILTIN_PET_ID);
            self.save_config(&config)?;
        }
        if let Some(resolved_sound_pack_id) =
            resolve_current_sound_pack_id(&config.current_sound_pack_id, &sound_packs)
        {
            if resolved_sound_pack_id != config.current_sound_pack_id {
                config.current_sound_pack_id = resolved_sound_pack_id;
                self.save_config(&config)?;
            }
        }
        if config.pet_window_size != normalized_pet_window_size {
            config.pet_window_size = normalized_pet_window_size;
            self.save_config(&config)?;
        }

        Ok(AppState {
            current_pet_id: config.current_pet_id,
            current_sound_pack_id: config.current_sound_pack_id,
            locale: config.locale_preference.effective_locale(),
            locale_preference: config.locale_preference,
            pets,
            sound_packs,
            onboarding_complete: config.onboarding_complete,
            pet_window_size: normalized_pet_window_size,
            agent_message_display: config.agent_message_display,
            agent_message_visible: config.agent_message_visible,
            pet_interactions: config.pet_interactions.clone(),
        })
    }

    pub fn list_pets(&self) -> Result<Vec<PetSummary>, StoreError> {
        let mut pets_by_id: BTreeMap<String, PetSummary> = BTreeMap::new();

        for (storage_id, package) in self.scan_user_pets()? {
            let summary = package.summary(PetNamespace::User, &storage_id);
            pets_by_id.insert(summary.id.clone(), summary);
        }

        for (storage_id, package) in self.scan_builtin_pets()? {
            let summary = package.summary(PetNamespace::System, &storage_id);
            pets_by_id.insert(summary.id.clone(), summary);
        }

        let mut pets: Vec<PetSummary> = pets_by_id.into_values().collect();
        sort_pet_summaries(&mut pets);
        Ok(pets)
    }

    pub fn list_sound_packs(&self) -> Result<Vec<SoundPackSummary>, StoreError> {
        let mut packs_by_id: BTreeMap<String, SoundPackSummary> = BTreeMap::new();

        for (storage_id, pack) in self.scan_user_sound_packs()? {
            let summary = pack.summary(SoundPackNamespace::User, &storage_id);
            packs_by_id.insert(summary.id.clone(), summary);
        }

        for (storage_id, pack) in self.scan_builtin_sound_packs()? {
            let summary = pack.summary(SoundPackNamespace::System, &storage_id);
            packs_by_id.insert(summary.id.clone(), summary);
        }

        let mut packs: Vec<SoundPackSummary> = packs_by_id.into_values().collect();
        sort_sound_pack_summaries(&mut packs);
        Ok(packs)
    }

    fn scan_user_pets(&self) -> Result<Vec<(String, PetPackage)>, StoreError> {
        scan_packages_with_storage_ids(&self.pets_dir())
    }

    fn scan_builtin_pets(&self) -> Result<Vec<(String, PetPackage)>, StoreError> {
        let Some(dir) = self.builtin_pets_dir.as_ref() else {
            return Ok(Vec::new());
        };
        scan_packages_with_storage_ids(dir)
    }

    fn scan_user_sound_packs(&self) -> Result<Vec<(String, SoundPack)>, StoreError> {
        Ok(scan_sound_packs_with_storage_ids(&self.sounds_dir())?)
    }

    fn scan_builtin_sound_packs(&self) -> Result<Vec<(String, SoundPack)>, StoreError> {
        let Some(dir) = self.builtin_sounds_dir.as_ref() else {
            return Ok(Vec::new());
        };
        Ok(scan_sound_packs_with_storage_ids(dir)?)
    }

    fn remove_legacy_pet_index(&self) -> Result<(), StoreError> {
        let pets_dir = self.pets_dir();
        if !pets_dir.exists() {
            return Ok(());
        }

        // Legacy cache file from the old sync-based architecture.
        let legacy_index = pets_dir.join("index.json");
        if legacy_index.is_file() {
            fs::remove_file(legacy_index)?;
        }
        Ok(())
    }

    pub fn select_pet(&self, pet_id: &str) -> Result<AppState, StoreError> {
        self.app_state()?;
        let pets = self.list_pets()?;
        if !pets.iter().any(|pet| pet.id == pet_id) {
            return Err(StoreError::PetNotFound(pet_id.to_string()));
        }

        let mut config = self.load_or_create_config()?;
        config.current_pet_id = pet_id.to_string();
        self.save_config(&config)?;
        self.app_state()
    }

    pub fn select_sound_pack(&self, sound_pack_id: &str) -> Result<AppState, StoreError> {
        self.app_state()?;
        if parse_runtime_sound_pack_id(sound_pack_id).is_none() {
            return Err(StoreError::SoundPackNotFound(sound_pack_id.to_string()));
        }
        let sound_packs = self.list_sound_packs()?;
        if !sound_packs.iter().any(|pack| pack.id == sound_pack_id) {
            return Err(StoreError::SoundPackNotFound(sound_pack_id.to_string()));
        }

        let mut config = self.load_or_create_config()?;
        config.current_sound_pack_id = sound_pack_id.to_string();
        self.save_config(&config)?;
        self.app_state()
    }

    pub fn set_onboarding_complete(&self, complete: bool) -> Result<AppState, StoreError> {
        self.app_state()?;
        let mut config = self.load_or_create_config()?;
        config.onboarding_complete = complete;
        self.save_config(&config)?;
        self.app_state()
    }

    pub fn set_pet_window_size(&self, size: PetWindowSize) -> Result<AppState, StoreError> {
        self.app_state()?;
        let mut config = self.load_or_create_config()?;
        config.pet_window_size = normalize_pet_window_size(size);
        self.save_config(&config)?;
        self.app_state()
    }

    pub fn set_locale_preference(
        &self,
        locale_preference: LocalePreference,
    ) -> Result<AppState, StoreError> {
        self.app_state()?;
        let mut config = self.load_or_create_config()?;
        config.locale_preference = locale_preference;
        self.save_config(&config)?;
        self.app_state()
    }

    pub fn set_agent_message_display(
        &self,
        agent_message_display: AgentMessageDisplay,
    ) -> Result<AppState, StoreError> {
        self.app_state()?;
        let mut config = self.load_or_create_config()?;
        config.agent_message_display = agent_message_display;
        self.save_config(&config)?;
        self.app_state()
    }

    pub fn set_agent_message_visible(&self, visible: bool) -> Result<AppState, StoreError> {
        self.app_state()?;
        let mut config = self.load_or_create_config()?;
        config.agent_message_visible = visible;
        self.save_config(&config)?;
        self.app_state()
    }

    pub fn set_pet_interactions(&self, prefs: PetInteractionPrefs) -> Result<AppState, StoreError> {
        self.app_state()?;
        let mut config = self.load_or_create_config()?;
        config.pet_interactions = prefs;
        self.save_config(&config)?;
        self.app_state()
    }

    pub fn import_codex_pets_from_home(&self) -> Result<PetImportResult, StoreError> {
        let home = dirs::home_dir().ok_or(StoreError::MissingHome)?;
        self.import_codex_pets(&home.join(".codex").join("pets"))
    }

    pub fn list_codex_pets_from_home(&self) -> Result<Vec<PetSummary>, StoreError> {
        let home = dirs::home_dir().ok_or(StoreError::MissingHome)?;
        self.list_codex_pets(&home.join(".codex").join("pets"))
    }

    pub fn install_codex_pet_from_home(&self, pet_id: &str) -> Result<AppState, StoreError> {
        let home = dirs::home_dir().ok_or(StoreError::MissingHome)?;
        self.install_codex_pet(&home.join(".codex").join("pets"), pet_id)
    }

    pub fn list_codex_pets(&self, codex_pets_dir: &Path) -> Result<Vec<PetSummary>, StoreError> {
        let mut pets = scan_packages_with_storage_ids(codex_pets_dir)?
            .into_iter()
            .map(|(storage_id, package)| package.summary(PetNamespace::User, &storage_id))
            .collect::<Vec<_>>();

        pets.sort_by(|left, right| left.display_name.cmp(&right.display_name));
        Ok(pets)
    }

    pub fn install_codex_pet(
        &self,
        codex_pets_dir: &Path,
        pet_id: &str,
    ) -> Result<AppState, StoreError> {
        self.app_state()?;
        let (source_dir, storage_id, package) = self
            .find_pet_package_by_id(codex_pets_dir, pet_id)?
            .ok_or_else(|| StoreError::PetNotFound(pet_id.to_string()))?;
        validate_pet_storage_id(&storage_id)?;
        validate_pet_storage_id(&package.manifest.id)?;
        copy_pet_package(&source_dir, &self.pets_dir().join(&storage_id), &package)?;
        self.select_pet(&user_pet_id(&storage_id))
    }

    pub fn import_codex_pets(&self, codex_pets_dir: &Path) -> Result<PetImportResult, StoreError> {
        self.app_state()?;
        if !codex_pets_dir.exists() {
            return Ok(PetImportResult {
                imported: 0,
                skipped: 0,
                pets: self.list_pets()?,
            });
        }

        let mut imported = 0;
        let mut skipped = 0;
        for entry in fs::read_dir(codex_pets_dir)? {
            let source_dir = entry?.path();
            if !source_dir.is_dir() {
                continue;
            }

            let Some(storage_id) = source_dir.file_name().and_then(|name| name.to_str()) else {
                skipped += 1;
                continue;
            };
            if !safe_pet_storage_id(storage_id) {
                skipped += 1;
                continue;
            }
            let Some(package) = read_pet_package(&source_dir) else {
                skipped += 1;
                continue;
            };
            if !safe_pet_storage_id(&package.manifest.id) {
                skipped += 1;
                continue;
            }
            copy_pet_package(&source_dir, &self.pets_dir().join(storage_id), &package)?;
            imported += 1;
        }

        Ok(PetImportResult {
            imported,
            skipped,
            pets: self.list_pets()?,
        })
    }

    pub fn import_pet_files(
        &self,
        manifest_json: &str,
        sprite_file_name: &str,
        sprite_bytes: Vec<u8>,
    ) -> Result<AppState, StoreError> {
        self.app_state()?;
        let manifest: PetManifest = serde_json::from_str(manifest_json)?;
        if manifest.id.trim().is_empty() {
            return Err(StoreError::InvalidPetPackage(
                "pet id cannot be empty".to_string(),
            ));
        }
        validate_pet_storage_id(&manifest.id)?;
        if sprite_bytes.is_empty() {
            return Err(StoreError::InvalidPetPackage(
                "sprite file cannot be empty".to_string(),
            ));
        }
        let sprite_name = Path::new(sprite_file_name)
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| {
                StoreError::InvalidPetPackage("sprite filename is invalid".to_string())
            })?;
        if sprite_name != "spritesheet.png" && sprite_name != "spritesheet.webp" {
            return Err(StoreError::InvalidPetPackage(
                "sprite file must be spritesheet.png or spritesheet.webp".to_string(),
            ));
        }

        let target_dir = self.pets_dir().join(&manifest.id);
        if target_dir.exists() {
            fs::remove_dir_all(&target_dir)?;
        }
        fs::create_dir_all(&target_dir)?;
        fs::write(
            target_dir.join("pet.json"),
            serde_json::to_vec_pretty(&manifest)?,
        )?;
        fs::write(target_dir.join(sprite_name), sprite_bytes)?;

        self.select_pet(&user_pet_id(&manifest.id))
    }

    pub fn import_pet_folder(&self, source_dir: &Path) -> Result<AppState, StoreError> {
        if !source_dir.is_dir() {
            return Err(StoreError::InvalidPetPackage(
                "selected path must be a folder".to_string(),
            ));
        }

        let package = read_pet_package(source_dir).ok_or_else(|| {
            StoreError::InvalidPetPackage(
                "folder must contain pet.json and spritesheet.webp or spritesheet.png".to_string(),
            )
        })?;
        if package.manifest.id.trim().is_empty() {
            return Err(StoreError::InvalidPetPackage(
                "pet id cannot be empty".to_string(),
            ));
        }
        validate_pet_storage_id(&package.manifest.id)?;
        if fs::metadata(&package.sprite_path)?.len() == 0 {
            return Err(StoreError::InvalidPetPackage(
                "sprite file cannot be empty".to_string(),
            ));
        }

        let target_dir = self.pets_dir().join(&package.manifest.id);
        copy_pet_package(source_dir, &target_dir, &package)?;

        self.select_pet(&user_pet_id(&package.manifest.id))
    }

    pub fn remove_pet(&self, pet_id: &str) -> Result<AppState, StoreError> {
        self.app_state()?;
        let Some((namespace, raw_id)) = parse_runtime_pet_id(pet_id) else {
            return Err(StoreError::PetNotFound(pet_id.to_string()));
        };
        if namespace == PetNamespace::System {
            return Err(StoreError::BuiltInPetCannotBeRemoved(raw_id.to_string()));
        }

        let target_dir = self.pets_dir().join(raw_id);
        if !target_dir.is_dir() || read_pet_package(&target_dir).is_none() {
            return Err(StoreError::PetNotFound(pet_id.to_string()));
        }

        fs::remove_dir_all(&target_dir)?;

        let mut config = self.load_or_create_config()?;
        if config.current_pet_id == pet_id {
            config.current_pet_id = system_pet_id(BUILTIN_PET_ID);
            self.save_config(&config)?;
        }

        self.app_state()
    }

    fn find_pet_package_by_id(
        &self,
        pets_dir: &Path,
        pet_id: &str,
    ) -> Result<Option<(PathBuf, String, PetPackage)>, StoreError> {
        let lookup_id = match parse_runtime_pet_id(pet_id) {
            Some((PetNamespace::User, raw_id)) => raw_id,
            Some((PetNamespace::System, _raw_id)) => return Ok(None),
            None => pet_id,
        };
        let mut packages = scan_packages_with_storage_ids(pets_dir)?;
        packages.sort_by(|(left_id, _), (right_id, _)| left_id.cmp(right_id));

        for (storage_id, package) in packages.iter() {
            if storage_id == lookup_id {
                return Ok(Some((
                    pets_dir.join(storage_id),
                    storage_id.clone(),
                    package.clone(),
                )));
            }
        }
        if parse_runtime_pet_id(pet_id).is_none() {
            for (storage_id, package) in packages {
                if package.manifest.id == lookup_id {
                    return Ok(Some((pets_dir.join(&storage_id), storage_id, package)));
                }
            }
        }

        Ok(None)
    }

    fn ensure_dirs(&self) -> Result<(), StoreError> {
        fs::create_dir_all(self.runtime_dir())?;
        fs::create_dir_all(self.pets_dir())?;
        fs::create_dir_all(self.sounds_dir())?;
        fs::create_dir_all(self.root.join("backups"))?;
        fs::create_dir_all(self.root.join("adapters"))?;
        Ok(())
    }

    fn load_or_create_config(&self) -> Result<StoredConfig, StoreError> {
        let path = self.config_path();
        if path.exists() {
            let bytes = fs::read(&path)?;
            let mut value: serde_json::Value = serde_json::from_slice(&bytes)?;
            let migrated_interactions = lift_legacy_pet_interactions(&mut value);
            let migrated_locale = migrate_legacy_system_locale_preference(&mut value);
            let config: StoredConfig = serde_json::from_value(value)?;
            if migrated_interactions || migrated_locale {
                // Rewrite immediately so the on-disk file matches the new
                // schema; otherwise the legacy values would only be dropped
                // on the next setting change.
                self.save_config(&config)?;
            }
            return Ok(config);
        }

        let config = StoredConfig::default();
        self.save_config(&config)?;
        Ok(config)
    }

    fn save_config(&self, config: &StoredConfig) -> Result<(), StoreError> {
        fs::create_dir_all(&self.root)?;
        let bytes = serde_json::to_vec_pretty(config)?;
        fs::write(self.config_path(), bytes)?;
        Ok(())
    }

    fn config_path(&self) -> PathBuf {
        self.root.join("config.json")
    }

    pub fn runtime_dir(&self) -> PathBuf {
        self.root.join("runtime")
    }

    pub fn import_previews_dir(&self) -> PathBuf {
        self.root.join("import-previews")
    }

    pub fn pets_dir(&self) -> PathBuf {
        self.root.join("pets")
    }

    pub fn sounds_dir(&self) -> PathBuf {
        self.root.join("sounds")
    }
}

impl StoreError {
    pub fn localized_message(&self, locale: Locale) -> String {
        match locale {
            Locale::EnUs => self.to_string(),
            Locale::ZhCn => match self {
                StoreError::MissingHome => "未找到用户主目录".to_string(),
                StoreError::PetNotFound(pet_id) => format!("未找到宠物 '{pet_id}'"),
                StoreError::SoundPackNotFound(sound_pack_id) => {
                    format!("未找到音效包 '{sound_pack_id}'")
                }
                StoreError::BuiltInPetCannotBeRemoved(pet_id) => {
                    format!("内置宠物 '{pet_id}' 不能被移除")
                }
                StoreError::InvalidPetPackage(message) => format!("宠物包无效：{message}"),
                StoreError::Io(error) => format!("I/O 错误：{error}"),
                StoreError::Json(error) => format!("JSON 错误：{error}"),
            },
        }
    }
}

/// Replace a legacy `localePreference: "system"` value with the locale
/// resolved from the current environment. The `system` variant was removed
/// from `LocalePreference`; existing configs would otherwise fail to
/// deserialize. Returns `true` when the JSON was changed, signalling the
/// caller to rewrite the file.
fn migrate_legacy_system_locale_preference(value: &mut serde_json::Value) -> bool {
    let Some(object) = value.as_object_mut() else {
        return false;
    };
    let is_legacy_system = object
        .get("localePreference")
        .and_then(|v| v.as_str())
        .is_some_and(|s| s == "system");
    if !is_legacy_system {
        return false;
    }
    let resolved = match default_locale() {
        Locale::EnUs => "en-US",
        Locale::ZhCn => "zh-CN",
    };
    object.insert(
        "localePreference".to_string(),
        serde_json::Value::String(resolved.to_string()),
    );
    true
}

/// Move legacy nested `petInteractions` keys up to the top level so the rest
/// of the loader can read a flat config. Returns `true` when the JSON was
/// changed, signalling the caller to rewrite the file.
fn lift_legacy_pet_interactions(value: &mut serde_json::Value) -> bool {
    let Some(object) = value.as_object_mut() else {
        return false;
    };
    let Some(legacy) = object.remove("petInteractions") else {
        return false;
    };
    if let Some(legacy_obj) = legacy.as_object() {
        for (key, val) in legacy_obj {
            // Flat keys already at the top level win — they reflect the
            // newer schema and we should not stomp on them.
            object.entry(key.clone()).or_insert_with(|| val.clone());
        }
    }
    true
}

fn scan_packages_with_storage_ids(dir: &Path) -> Result<Vec<(String, PetPackage)>, StoreError> {
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut packages = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(storage_id) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if let Some(package) = read_pet_package(&path) {
            packages.push((storage_id.to_string(), package));
        }
    }
    Ok(packages)
}

fn sort_pet_summaries(pets: &mut [PetSummary]) {
    pets.sort_by(|left, right| {
        sort_group(left)
            .cmp(&sort_group(right))
            .then_with(|| left.display_name.cmp(&right.display_name))
            .then_with(|| left.id.cmp(&right.id))
    });
}

fn sort_sound_pack_summaries(packs: &mut [SoundPackSummary]) {
    packs.sort_by(|left, right| {
        sound_pack_sort_group(left)
            .cmp(&sound_pack_sort_group(right))
            .then_with(|| left.display_name.cmp(&right.display_name))
            .then_with(|| left.id.cmp(&right.id))
    });
}

fn sound_pack_sort_group(pack: &SoundPackSummary) -> u8 {
    if pack.id == system_sound_pack_id(BUILTIN_SOUND_PACK_ID) {
        0
    } else if pack.built_in {
        1
    } else {
        2
    }
}

fn sort_group(pet: &PetSummary) -> u8 {
    if let Some(rank) = priority_builtin_pet_rank(pet) {
        rank as u8
    } else if !pet.built_in {
        2
    } else {
        3
    }
}

fn priority_builtin_pet_rank(pet: &PetSummary) -> Option<usize> {
    if !pet.built_in {
        return None;
    }

    let (namespace, raw_id) = parse_runtime_pet_id(&pet.id)?;
    if namespace != PetNamespace::System {
        return None;
    }

    PRIORITY_BUILTIN_PET_IDS
        .iter()
        .position(|priority_id| *priority_id == raw_id)
}

fn resolve_current_pet_id(current_pet_id: &str, pets: &[PetSummary]) -> Option<String> {
    if pets.iter().any(|pet| pet.id == current_pet_id) {
        return Some(current_pet_id.to_string());
    }
    if parse_runtime_pet_id(current_pet_id).is_some() {
        return None;
    }

    let system_id = system_pet_id(current_pet_id);
    if pets.iter().any(|pet| pet.id == system_id) {
        return Some(system_id);
    }

    let user_id = user_pet_id(current_pet_id);
    pets.iter().any(|pet| pet.id == user_id).then_some(user_id)
}

fn resolve_current_sound_pack_id(
    current_sound_pack_id: &str,
    sound_packs: &[SoundPackSummary],
) -> Option<String> {
    if sound_packs.is_empty() {
        return None;
    }
    if sound_packs
        .iter()
        .any(|pack| pack.id == current_sound_pack_id)
    {
        return Some(current_sound_pack_id.to_string());
    }

    let default_id = system_sound_pack_id(BUILTIN_SOUND_PACK_ID);
    if sound_packs.iter().any(|pack| pack.id == default_id) {
        return Some(default_id);
    }

    sound_packs.first().map(|pack| pack.id.clone())
}

pub(crate) fn safe_pet_storage_id(raw: &str) -> bool {
    !raw.is_empty()
        && raw != "."
        && raw != ".."
        && raw
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
}

fn validate_pet_storage_id(raw: &str) -> Result<(), StoreError> {
    if !safe_pet_storage_id(raw) {
        return Err(StoreError::InvalidPetPackage(
            "pet id must be a safe storage id".to_string(),
        ));
    }
    Ok(())
}

fn copy_pet_package(
    source_dir: &Path,
    target_dir: &Path,
    package: &PetPackage,
) -> Result<(), StoreError> {
    let source_root = fs::canonicalize(source_dir)?;
    let staging_dir = sibling_work_dir(target_dir, "staging")?;
    let backup_dir = sibling_work_dir(target_dir, "backup")?;

    let stage_result = (|| -> Result<(), StoreError> {
        if staging_dir.exists() {
            fs::remove_dir_all(&staging_dir)?;
        }
        fs::create_dir_all(&staging_dir)?;
        fs::copy(source_root.join("pet.json"), staging_dir.join("pet.json"))?;
        if let Some(sprite_name) = package.sprite_path.file_name() {
            fs::copy(&package.sprite_path, staging_dir.join(sprite_name))?;
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
            let staged_path = staging_dir.join(relative_path);
            if let Some(parent) = staged_path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(canonical_sound_path, staged_path)?;
        }
        Ok(())
    })();

    if let Err(error) = stage_result {
        let _ = fs::remove_dir_all(&staging_dir);
        return Err(error);
    }

    let replace_result = (|| -> Result<(), StoreError> {
        if backup_dir.exists() {
            fs::remove_dir_all(&backup_dir)?;
        }
        if target_dir.exists() {
            fs::rename(target_dir, &backup_dir)?;
        }
        if let Err(error) = fs::rename(&staging_dir, target_dir) {
            if backup_dir.exists() {
                let _ = fs::rename(&backup_dir, target_dir);
            }
            return Err(StoreError::Io(error));
        }
        if backup_dir.exists() {
            let _ = fs::remove_dir_all(&backup_dir);
        }
        Ok(())
    })();

    if let Err(error) = replace_result {
        let _ = fs::remove_dir_all(&staging_dir);
        return Err(error);
    }

    Ok(())
}

pub(crate) fn copy_pet_package_for_import(
    source_dir: &Path,
    target_dir: &Path,
    package: &PetPackage,
) -> Result<(), StoreError> {
    copy_pet_package(source_dir, target_dir, package)
}

fn sibling_work_dir(target_dir: &Path, suffix: &str) -> Result<PathBuf, StoreError> {
    let parent = target_dir.parent().ok_or_else(|| {
        StoreError::InvalidPetPackage("pet target directory is invalid".to_string())
    })?;
    let target_name = target_dir
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| {
            StoreError::InvalidPetPackage("pet target directory is invalid".to_string())
        })?;

    Ok(parent.join(format!(".{target_name}.{suffix}")))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredConfig {
    current_pet_id: String,
    #[serde(default = "default_current_sound_pack_id")]
    current_sound_pack_id: String,
    onboarding_complete: bool,
    #[serde(default)]
    agent_auto_install_complete: bool,
    #[serde(default)]
    locale_preference: LocalePreference,
    #[serde(
        default = "default_pet_window_size",
        deserialize_with = "deserialize_stored_pet_window_size"
    )]
    pet_window_size: PetWindowSize,
    #[serde(default)]
    agent_message_display: AgentMessageDisplay,
    #[serde(default = "default_agent_message_visible")]
    agent_message_visible: bool,
    // Flatten so the on-disk schema stays flat: `enableClickSounds` and
    // `cooldownStyle` sit alongside `currentPetId` rather than nested under
    // `petInteractions`. Legacy nested configs are migrated in
    // `load_or_create_config` on first read.
    #[serde(flatten)]
    pet_interactions: PetInteractionPrefs,
}

impl Default for StoredConfig {
    fn default() -> Self {
        Self {
            current_pet_id: system_pet_id(BUILTIN_PET_ID),
            current_sound_pack_id: default_current_sound_pack_id(),
            onboarding_complete: false,
            agent_auto_install_complete: false,
            locale_preference: LocalePreference::default(),
            pet_window_size: DEFAULT_PET_WINDOW_SIZE,
            agent_message_display: AgentMessageDisplay::All,
            agent_message_visible: true,
            pet_interactions: PetInteractionPrefs::default(),
        }
    }
}

fn default_current_sound_pack_id() -> String {
    system_sound_pack_id(BUILTIN_SOUND_PACK_ID)
}

fn default_agent_message_visible() -> bool {
    true
}

fn deserialize_stored_pet_window_size<'de, D>(deserializer: D) -> Result<PetWindowSize, D::Error>
where
    D: Deserializer<'de>,
{
    struct PetWindowSizeVisitor;

    impl<'de> Visitor<'de> for PetWindowSizeVisitor {
        type Value = PetWindowSize;

        fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            formatter.write_str("a slider value from 1 to 100 or a legacy size name")
        }

        fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(normalize_pet_window_size(
                value.min(u64::from(MAX_PET_WINDOW_SIZE)) as PetWindowSize,
            ))
        }

        fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            if value <= 0 {
                return Ok(MIN_PET_WINDOW_SIZE);
            }
            self.visit_u64(value as u64)
        }

        fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            if let Ok(parsed) = value.parse::<u64>() {
                return self.visit_u64(parsed);
            }

            Ok(match value {
                "extra-small" => 40,
                "small" => 55,
                "medium" => 70,
                "large" => 90,
                "extra-large" => 100,
                _ => DEFAULT_PET_WINDOW_SIZE,
            })
        }
    }

    deserializer.deserialize_any(PetWindowSizeVisitor)
}

fn read_pet_package(dir: &Path) -> Option<PetPackage> {
    let manifest_bytes = fs::read(dir.join("pet.json")).ok()?;
    let mut manifest: PetManifest = serde_json::from_slice(&manifest_bytes).ok()?;
    if manifest.slug.is_empty() {
        manifest.slug = manifest.id.clone();
    }
    let sprite_path = find_sprite_path(dir)?;
    let sounds = collect_pet_sounds(&manifest, dir);

    Some(PetPackage {
        manifest,
        sprite_path,
        sounds,
    })
}

pub(crate) fn read_pet_package_for_import(dir: &Path) -> Option<PetPackage> {
    read_pet_package(dir)
}
