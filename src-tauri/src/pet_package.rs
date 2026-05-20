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
pub const MAX_PET_SOUND_BYTES: u64 = 16 * 1024 * 1024;

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
    #[serde(default = "default_grid_rows")]
    pub grid_rows: u32,
    #[serde(default)]
    pub built_in: bool,
    #[serde(default)]
    pub pethover: Option<PetHoverMetadata>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PetHoverMetadata {
    #[serde(default)]
    pub audio: Option<PetSounds>,
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
    pub fn summary(self) -> PetSummary {
        let slug = if self.manifest.slug.is_empty() {
            self.manifest.id.clone()
        } else {
            self.manifest.slug
        };

        PetSummary {
            id: self.manifest.id,
            slug,
            display_name: self.manifest.display_name,
            description: self.manifest.description,
            frame_width: self.manifest.frame_width,
            frame_height: self.manifest.frame_height,
            grid_columns: self.manifest.grid_columns,
            grid_rows: self.manifest.grid_rows,
            built_in: self.manifest.built_in,
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
    let raw_sounds = manifest.pethover.as_ref()?.audio.as_ref()?;
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
        || !relative_path.starts_with(Path::new("pethover/audio"))
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
    if !canonical_sound_path.starts_with(package_root.join("pethover/audio")) {
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

fn default_grid_rows() -> u32 {
    DEFAULT_GRID_ROWS
}
