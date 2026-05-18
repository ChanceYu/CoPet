use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Locale {
    #[serde(rename = "en-US")]
    EnUs,
    #[serde(rename = "zh-CN")]
    ZhCn,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LocalePreference {
    #[serde(rename = "system")]
    System,
    #[serde(rename = "en-US")]
    EnUs,
    #[serde(rename = "zh-CN")]
    ZhCn,
}

impl Default for LocalePreference {
    fn default() -> Self {
        Self::System
    }
}

impl LocalePreference {
    pub fn effective_locale(self, system_locale: Locale) -> Locale {
        match self {
            Self::System => system_locale,
            Self::EnUs => Locale::EnUs,
            Self::ZhCn => Locale::ZhCn,
        }
    }
}

impl Default for Locale {
    fn default() -> Self {
        Self::EnUs
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MessageKey {
    TrayBrand,
    TraySettings,
    TrayQuit,
    SettingsWindowNotFound,
}

pub fn default_locale() -> Locale {
    detect_locale_from_env([
        ("LANGUAGE", env::var("LANGUAGE").unwrap_or_default()),
        ("LC_ALL", env::var("LC_ALL").unwrap_or_default()),
        ("LC_MESSAGES", env::var("LC_MESSAGES").unwrap_or_default()),
        ("LANG", env::var("LANG").unwrap_or_default()),
    ])
}

pub fn detect_locale_from_env<I, K, V>(vars: I) -> Locale
where
    I: IntoIterator<Item = (K, V)>,
    K: AsRef<str>,
    V: AsRef<str>,
{
    for (_key, value) in vars {
        for candidate in value.as_ref().split(':') {
            let normalized = candidate.trim().replace('_', "-").to_ascii_lowercase();
            if normalized.starts_with("zh") {
                return Locale::ZhCn;
            }
            if normalized.starts_with("en") {
                return Locale::EnUs;
            }
        }
    }

    Locale::EnUs
}

pub fn t(locale: Locale, key: MessageKey) -> &'static str {
    match (locale, key) {
        (Locale::EnUs, MessageKey::TrayBrand) => "PetHover",
        (Locale::EnUs, MessageKey::TraySettings) => "Settings",
        (Locale::EnUs, MessageKey::TrayQuit) => "Quit",
        (Locale::EnUs, MessageKey::SettingsWindowNotFound) => "settings window was not found",
        (Locale::ZhCn, MessageKey::TrayBrand) => "PetHover",
        (Locale::ZhCn, MessageKey::TraySettings) => "设置中心",
        (Locale::ZhCn, MessageKey::TrayQuit) => "退出应用",
        (Locale::ZhCn, MessageKey::SettingsWindowNotFound) => "未找到设置窗口",
    }
}
