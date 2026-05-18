use serde::{Deserialize, Serialize};

use crate::i18n::{Locale, LocalePreference};
use crate::pet_package::PetSummary;

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
        Self::Latest
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    pub current_pet_id: String,
    pub locale: Locale,
    pub locale_preference: LocalePreference,
    pub pets: Vec<PetSummary>,
    pub onboarding_complete: bool,
    pub pet_window_size: PetWindowSize,
    pub agent_message_display: AgentMessageDisplay,
}
