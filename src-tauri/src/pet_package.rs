use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const DEFAULT_FRAME_WIDTH: u32 = 192;
pub const DEFAULT_FRAME_HEIGHT: u32 = 208;
pub const DEFAULT_GRID_COLUMNS: u32 = 8;
pub const DEFAULT_GRID_ROWS: u32 = 9;

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
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PetPackage {
    pub manifest: PetManifest,
    pub sprite_path: PathBuf,
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
        }
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
