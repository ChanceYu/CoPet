use crate::sound_pack::collect_valid_sound_pack_sounds;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    env, fs,
    path::{Component, Path, PathBuf},
};

pub const DEFAULT_FRAME_WIDTH: u32 = 192;
pub const DEFAULT_FRAME_HEIGHT: u32 = 208;
pub const DEFAULT_GRID_COLUMNS: u32 = 8;
pub const DEFAULT_GRID_ROWS: u32 = 9;
const SPRITE_V2_GRID_ROWS: u32 = 11;
pub const MAX_PET_SOUND_BYTES: u64 = 16 * 1024 * 1024;
pub const SYSTEM_PET_PREFIX: &str = "system:";
pub const USER_PET_PREFIX: &str = "user:";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PetNamespace {
    System,
    User,
}

impl PetNamespace {
    pub fn prefix(self) -> &'static str {
        match self {
            PetNamespace::System => SYSTEM_PET_PREFIX,
            PetNamespace::User => USER_PET_PREFIX,
        }
    }
}

pub fn runtime_pet_id(namespace: PetNamespace, storage_id: &str) -> String {
    format!("{}{}", namespace.prefix(), storage_id)
}

pub fn system_pet_id(storage_id: &str) -> String {
    runtime_pet_id(PetNamespace::System, storage_id)
}

pub fn user_pet_id(storage_id: &str) -> String {
    runtime_pet_id(PetNamespace::User, storage_id)
}

pub fn parse_runtime_pet_id(runtime_id: &str) -> Option<(PetNamespace, &str)> {
    if let Some(raw) = runtime_id.strip_prefix(SYSTEM_PET_PREFIX) {
        return Some((PetNamespace::System, raw));
    }
    if let Some(raw) = runtime_id.strip_prefix(USER_PET_PREFIX) {
        return Some((PetNamespace::User, raw));
    }
    None
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PetManifest {
    pub id: String,
    #[serde(default)]
    pub slug: String,
    pub display_name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_frame_width")]
    pub frame_width: u32,
    #[serde(default = "default_frame_height")]
    pub frame_height: u32,
    #[serde(default = "default_grid_columns")]
    pub grid_columns: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grid_rows: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sprite_version_number: Option<u32>,
    #[serde(default)]
    pub built_in: bool,
    #[serde(default)]
    pub copet: Option<CoPetMetadata>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, serde_json::Value>,
}

impl PetManifest {
    fn resolved_grid_rows(&self) -> u32 {
        self.grid_rows.unwrap_or_else(|| {
            if self.sprite_version_number == Some(2) {
                SPRITE_V2_GRID_ROWS
            } else {
                DEFAULT_GRID_ROWS
            }
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoPetMetadata {
    #[serde(default)]
    pub sound: Option<PetSounds>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PetSounds {
    #[serde(default)]
    pub interaction_sounds: PetInteractionSounds,
    #[serde(default)]
    pub agent_sounds: PetAgentSounds,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PetInteractionSounds {
    #[serde(default)]
    pub click: Option<String>,
    #[serde(default)]
    pub double_click: Option<String>,
    #[serde(default)]
    pub petted: Option<String>,
    #[serde(default)]
    pub petted_slow: Option<String>,
    #[serde(default)]
    pub drag_land: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PetAgentSounds {
    #[serde(default)]
    pub thinking: Option<String>,
    #[serde(default)]
    pub editing: Option<String>,
    #[serde(default)]
    pub inspecting: Option<String>,
    #[serde(default)]
    pub awaiting_approval: Option<String>,
    #[serde(default)]
    pub celebrating: Option<String>,
    #[serde(default)]
    pub failed: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PetSummary {
    pub id: String,
    pub slug: String,
    pub display_name: String,
    pub description: String,
    pub frame_width: u32,
    pub frame_height: u32,
    pub grid_columns: u32,
    pub grid_rows: u32,
    pub built_in: bool,
    pub sprite_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sounds: Option<PetSounds>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PetPackage {
    pub manifest: PetManifest,
    pub sprite_path: PathBuf,
    pub sounds: Option<PetSounds>,
}

impl PetPackage {
    pub fn summary(self, namespace: PetNamespace, storage_id: &str) -> PetSummary {
        let grid_rows = self.manifest.resolved_grid_rows();
        let slug = if self.manifest.slug.is_empty() {
            storage_id.to_string()
        } else {
            self.manifest.slug
        };

        PetSummary {
            id: runtime_pet_id(namespace, storage_id),
            slug,
            display_name: self.manifest.display_name,
            description: self.manifest.description,
            frame_width: self.manifest.frame_width,
            frame_height: self.manifest.frame_height,
            grid_columns: self.manifest.grid_columns,
            grid_rows,
            built_in: matches!(namespace, PetNamespace::System),
            sprite_path: self.sprite_path.to_string_lossy().into_owned(),
            sounds: self.sounds,
        }
    }

    pub fn sound_file_paths(&self) -> Vec<PathBuf> {
        let Some(sounds) = self.sounds.as_ref() else {
            return Vec::new();
        };

        [
            sounds.interaction_sounds.click.as_ref(),
            sounds.interaction_sounds.double_click.as_ref(),
            sounds.interaction_sounds.petted.as_ref(),
            sounds.interaction_sounds.petted_slow.as_ref(),
            sounds.interaction_sounds.drag_land.as_ref(),
            sounds.agent_sounds.thinking.as_ref(),
            sounds.agent_sounds.editing.as_ref(),
            sounds.agent_sounds.inspecting.as_ref(),
            sounds.agent_sounds.awaiting_approval.as_ref(),
            sounds.agent_sounds.celebrating.as_ref(),
            sounds.agent_sounds.failed.as_ref(),
        ]
        .into_iter()
        .flatten()
        .map(PathBuf::from)
        .collect()
    }
}

pub fn find_sprite_path(dir: &Path) -> Option<PathBuf> {
    let webp = dir.join("spritesheet.webp");
    if webp.is_file() {
        return Some(webp);
    }

    let png = dir.join("spritesheet.png");
    if png.is_file() {
        return Some(png);
    }

    None
}

pub fn collect_pet_sounds(manifest: &PetManifest, package_dir: &Path) -> Option<PetSounds> {
    collect_embedded_pet_sounds(manifest, package_dir)
        .or_else(|| collect_sound_pack_sounds(manifest, package_dir))
}

fn collect_embedded_pet_sounds(manifest: &PetManifest, package_dir: &Path) -> Option<PetSounds> {
    let raw_sounds = manifest.copet.as_ref()?.sound.as_ref()?;
    let sounds = PetSounds {
        interaction_sounds: PetInteractionSounds {
            click: valid_sound_path(raw_sounds.interaction_sounds.click.as_deref(), package_dir),
            double_click: valid_sound_path(
                raw_sounds.interaction_sounds.double_click.as_deref(),
                package_dir,
            ),
            petted: valid_sound_path(raw_sounds.interaction_sounds.petted.as_deref(), package_dir),
            petted_slow: valid_sound_path(
                raw_sounds.interaction_sounds.petted_slow.as_deref(),
                package_dir,
            ),
            drag_land: valid_sound_path(
                raw_sounds.interaction_sounds.drag_land.as_deref(),
                package_dir,
            ),
        },
        agent_sounds: PetAgentSounds {
            thinking: valid_sound_path(raw_sounds.agent_sounds.thinking.as_deref(), package_dir),
            editing: valid_sound_path(raw_sounds.agent_sounds.editing.as_deref(), package_dir),
            inspecting: valid_sound_path(
                raw_sounds.agent_sounds.inspecting.as_deref(),
                package_dir,
            ),
            awaiting_approval: valid_sound_path(
                raw_sounds.agent_sounds.awaiting_approval.as_deref(),
                package_dir,
            ),
            celebrating: valid_sound_path(
                raw_sounds.agent_sounds.celebrating.as_deref(),
                package_dir,
            ),
            failed: valid_sound_path(raw_sounds.agent_sounds.failed.as_deref(), package_dir),
        },
    };

    if has_any_sound(&sounds) {
        Some(sounds)
    } else {
        None
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SoundPackManifest {
    id: String,
    #[serde(flatten)]
    sounds: PetSounds,
}

fn collect_sound_pack_sounds(manifest: &PetManifest, package_dir: &Path) -> Option<PetSounds> {
    let pack_dir = sound_pack_dir(manifest, package_dir)?;
    let pack: SoundPackManifest =
        serde_json::from_slice(&fs::read(pack_dir.join("sound.json")).ok()?).ok()?;
    if pack.id != manifest.id {
        return None;
    }

    collect_valid_sound_pack_sounds(&pack.sounds, &pack_dir)
}

fn sound_pack_dir(manifest: &PetManifest, package_dir: &Path) -> Option<PathBuf> {
    let pets_dir = package_dir.parent()?;
    let root = pets_dir.parent()?;
    Some(root.join("sounds").join(&manifest.id))
}

fn valid_sound_path(raw: Option<&str>, package_dir: &Path) -> Option<String> {
    let raw = raw?;
    if raw.contains('\\') {
        return None;
    }

    let relative_path = Path::new(raw);
    if relative_path.is_absolute()
        || relative_path
            .extension()
            .and_then(|extension| extension.to_str())
            != Some("mp3")
        || !relative_path.starts_with(Path::new("copet/sound"))
        || relative_path.components().any(|component| {
            matches!(
                component,
                Component::Prefix(_)
                    | Component::RootDir
                    | Component::ParentDir
                    | Component::CurDir
            )
        })
    {
        return None;
    }

    let package_root = canonical_package_root(package_dir)?;
    let sound_path = package_root.join(relative_path);
    if has_symlink_component(&package_root, relative_path) {
        return None;
    }

    let canonical_sound_path = fs::canonicalize(&sound_path).ok()?;
    if !canonical_sound_path.starts_with(package_root.join("copet/sound")) {
        return None;
    }

    let metadata = fs::symlink_metadata(&sound_path).ok()?;
    let file_type = metadata.file_type();
    if !file_type.is_file() || file_type.is_symlink() || metadata.len() > MAX_PET_SOUND_BYTES {
        return None;
    }

    Some(canonical_sound_path.to_string_lossy().into_owned())
}

fn canonical_package_root(package_dir: &Path) -> Option<PathBuf> {
    if package_dir.is_absolute() {
        fs::canonicalize(package_dir).ok()
    } else {
        fs::canonicalize(env::current_dir().ok()?.join(package_dir)).ok()
    }
}

fn has_symlink_component(root: &Path, relative_path: &Path) -> bool {
    let mut current = root.to_path_buf();
    for component in relative_path.components() {
        let Component::Normal(part) = component else {
            return true;
        };
        current.push(part);
        let Ok(metadata) = fs::symlink_metadata(&current) else {
            return true;
        };
        if metadata.file_type().is_symlink() {
            return true;
        }
    }

    false
}

fn has_any_sound(sounds: &PetSounds) -> bool {
    sounds.interaction_sounds.click.is_some()
        || sounds.interaction_sounds.double_click.is_some()
        || sounds.interaction_sounds.petted.is_some()
        || sounds.interaction_sounds.petted_slow.is_some()
        || sounds.interaction_sounds.drag_land.is_some()
        || sounds.agent_sounds.thinking.is_some()
        || sounds.agent_sounds.editing.is_some()
        || sounds.agent_sounds.inspecting.is_some()
        || sounds.agent_sounds.awaiting_approval.is_some()
        || sounds.agent_sounds.celebrating.is_some()
        || sounds.agent_sounds.failed.is_some()
}

fn default_frame_width() -> u32 {
    DEFAULT_FRAME_WIDTH
}

fn default_frame_height() -> u32 {
    DEFAULT_FRAME_HEIGHT
}

fn default_grid_columns() -> u32 {
    DEFAULT_GRID_COLUMNS
}
