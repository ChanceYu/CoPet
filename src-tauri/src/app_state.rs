use serde::{Deserialize, Serialize};

use crate::i18n::{Locale, LocalePreference};
use crate::pet_package::PetSummary;
use crate::sound_pack::SoundPackSummary;

pub type PetWindowSize = u8;

pub const MIN_PET_WINDOW_SIZE: PetWindowSize = 1;
pub const MAX_PET_WINDOW_SIZE: PetWindowSize = 100;
pub const DEFAULT_PET_WINDOW_SIZE: PetWindowSize = 30;

pub fn default_pet_window_size() -> PetWindowSize {
    DEFAULT_PET_WINDOW_SIZE
}

pub fn normalize_pet_window_size(size: PetWindowSize) -> PetWindowSize {
    size.clamp(MIN_PET_WINDOW_SIZE, MAX_PET_WINDOW_SIZE)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AgentMessageDisplay {
    All,
    Latest,
}

impl Default for AgentMessageDisplay {
    fn default() -> Self {
        Self::All
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CooldownStyle {
    Short,
    Normal,
    Lazy,
}

impl Default for CooldownStyle {
    fn default() -> Self {
        Self::Normal
    }
}

fn default_enable_click_sounds() -> bool {
    true
}

fn default_enable_startup_animation() -> bool {
    true
}

fn default_agent_message_visible() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PetInteractionPrefs {
    // Per-field defaults so this struct survives being flattened into a
    // parent config when individual keys are missing from disk.
    #[serde(default = "default_enable_click_sounds")]
    pub enable_click_sounds: bool,
    #[serde(default)]
    pub cooldown_style: CooldownStyle,
    #[serde(default = "default_enable_startup_animation")]
    pub enable_startup_animation: bool,
}

impl Default for PetInteractionPrefs {
    fn default() -> Self {
        Self {
            enable_click_sounds: true,
            cooldown_style: CooldownStyle::Normal,
            enable_startup_animation: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    pub current_pet_id: String,
    pub current_sound_pack_id: String,
    pub locale: Locale,
    pub locale_preference: LocalePreference,
    pub pets: Vec<PetSummary>,
    pub sound_packs: Vec<SoundPackSummary>,
    pub onboarding_complete: bool,
    pub pet_window_size: PetWindowSize,
    pub agent_message_display: AgentMessageDisplay,
    #[serde(default = "default_agent_message_visible")]
    pub agent_message_visible: bool,
    #[serde(default)]
    pub pet_interactions: PetInteractionPrefs,
}
