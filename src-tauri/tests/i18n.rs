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
    // Unchanged keys
    assert_eq!(t(Locale::EnUs, MessageKey::TrayBrand), "PetHover");
    assert_eq!(t(Locale::EnUs, MessageKey::TrayQuit), "Quit");
    assert_eq!(t(Locale::ZhCn, MessageKey::TrayBrand), "PetHover");
    assert_eq!(t(Locale::ZhCn, MessageKey::TrayQuit), "退出应用");

    // Settings sub-tab labels (each opens the settings window on that tab)
    assert_eq!(t(Locale::EnUs, MessageKey::TrayPets), "Pets…");
    assert_eq!(t(Locale::ZhCn, MessageKey::TrayPets), "宠物…");
    assert_eq!(t(Locale::EnUs, MessageKey::TrayAgents), "Agents…");
    assert_eq!(t(Locale::ZhCn, MessageKey::TrayAgents), "Agent…");
    assert_eq!(t(Locale::EnUs, MessageKey::TrayPreferences), "General…");
    assert_eq!(t(Locale::ZhCn, MessageKey::TrayPreferences), "通用…");

    // New menu keys
    assert_eq!(t(Locale::EnUs, MessageKey::TrayShowPet), "Show Pet");
    assert_eq!(t(Locale::ZhCn, MessageKey::TrayShowPet), "显示宠物");
    assert_eq!(t(Locale::EnUs, MessageKey::TrayHidePet), "Hide Pet");
    assert_eq!(t(Locale::ZhCn, MessageKey::TrayHidePet), "隐藏宠物");
    assert_eq!(
        t(Locale::EnUs, MessageKey::TrayPauseResponse),
        "Pause Messages"
    );
    assert_eq!(t(Locale::ZhCn, MessageKey::TrayPauseResponse), "暂停消息");
    assert_eq!(
        t(Locale::EnUs, MessageKey::TrayResumeResponse),
        "Resume Messages"
    );
    assert_eq!(t(Locale::ZhCn, MessageKey::TrayResumeResponse), "恢复消息");
    assert_eq!(
        t(Locale::EnUs, MessageKey::TrayResetPosition),
        "Reset Pet Position"
    );
    assert_eq!(
        t(Locale::ZhCn, MessageKey::TrayResetPosition),
        "重置宠物位置"
    );
    assert_eq!(t(Locale::EnUs, MessageKey::TrayLanguageMenu), "Language");
    assert_eq!(t(Locale::ZhCn, MessageKey::TrayLanguageMenu), "语言");
    assert_eq!(
        t(Locale::EnUs, MessageKey::TrayLanguageSystem),
        "System Default"
    );
    assert_eq!(t(Locale::ZhCn, MessageKey::TrayLanguageSystem), "跟随系统");
    assert_eq!(t(Locale::EnUs, MessageKey::TrayLanguageEnglish), "English");
    assert_eq!(t(Locale::ZhCn, MessageKey::TrayLanguageEnglish), "English");
    assert_eq!(t(Locale::EnUs, MessageKey::TrayLanguageChinese), "中文");
    assert_eq!(t(Locale::ZhCn, MessageKey::TrayLanguageChinese), "中文");
    assert_eq!(t(Locale::EnUs, MessageKey::TrayAbout), "About…");
    assert_eq!(t(Locale::ZhCn, MessageKey::TrayAbout), "关于…");
}
