use pethover_lib::i18n::{detect_locale_from_env, t, Locale, MessageKey};

#[test]
fn detects_chinese_locale_from_environment() {
    let locale = detect_locale_from_env([
        ("LANGUAGE", ""),
        ("LC_ALL", ""),
        ("LC_MESSAGES", ""),
        ("LANG", "zh_CN.UTF-8"),
    ]);

    assert_eq!(locale, Locale::ZhCn);
}

#[test]
fn defaults_to_english_for_unknown_environment() {
    let locale = detect_locale_from_env([
        ("LANGUAGE", ""),
        ("LC_ALL", ""),
        ("LC_MESSAGES", ""),
        ("LANG", "fr_FR.UTF-8"),
    ]);

    assert_eq!(locale, Locale::EnUs);
}

#[test]
fn localizes_tray_menu_labels() {
    assert_eq!(t(Locale::EnUs, MessageKey::TrayBrand), "PetHover");
    assert_eq!(t(Locale::EnUs, MessageKey::TraySettings), "Settings");
    assert_eq!(t(Locale::EnUs, MessageKey::TrayQuit), "Quit");
    assert_eq!(t(Locale::ZhCn, MessageKey::TrayBrand), "PetHover");
    assert_eq!(t(Locale::ZhCn, MessageKey::TraySettings), "设置中心");
    assert_eq!(t(Locale::ZhCn, MessageKey::TrayQuit), "退出应用");
}
