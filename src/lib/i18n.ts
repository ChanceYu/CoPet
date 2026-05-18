export type Locale = "en-US" | "zh-CN";

const messages = {
  "en-US": {
    aboutBuiltWith: "Built with Tauri, Rust, and React.",
    aboutLicenseNotice: "© PetHover contributors. All rights reserved.",
    aboutRepoLink: "View source on GitHub",
    aboutTitle: "About",
    aboutVersion: "Version",
    agentIntegrations: "Settings",
    backToTop: "Back to top",
    close: "Close",
    currentPet: "Current pet",
    customBadge: "Custom",
    english: "English",
    importLocalFolder: "Import folder",
    locateCurrent: "Find current pet",
    invalidLocalPetFolder: "The folder must contain pet.json and either spritesheet.webp or spritesheet.png.",
    language: "Language",
    navAbout: "About",
    navAgents: "Agents",
    navPets: "Pets",
    navPreferences: "Preferences",
    noInstalledPets: "No pets installed.",
    pets: "Pets",
    petsDescription: "Pick a pet, or import a Codex-compatible pet package.",
    petWindowHeading: "Pet window",
    preferencesTitle: "Preferences",
    remove: "Remove",
    refreshList: "Refresh list",
    resetPosition: "Reset position",
    resetPositionDescription: "Bring the pet back to the bottom-right of your screen.",
    resetPositionFailed: "Couldn't reset the pet position.",
    resetPositionSuccess: "Pet returned to the bottom-right.",
    settingsDescription: "Set the interface language and agent CLI integrations.",
    settingsNavLabel: "Settings sections",
    size: "Size",
    zhCn: "中文",
  },
  "zh-CN": {
    aboutBuiltWith: "基于 Tauri、Rust 和 React 构建。",
    aboutLicenseNotice: "© PetHover 贡献者，保留所有权利。",
    aboutRepoLink: "在 GitHub 查看源码",
    aboutTitle: "关于",
    aboutVersion: "版本",
    agentIntegrations: "设置",
    backToTop: "返回顶部",
    close: "关闭",
    currentPet: "当前宠物",
    customBadge: "自定义",
    english: "English",
    importLocalFolder: "导入文件夹",
    locateCurrent: "定位当前宠物",
    invalidLocalPetFolder: "所选文件夹需要同时包含 pet.json 和 spritesheet.webp 或 spritesheet.png 之一。",
    language: "语言",
    navAbout: "关于",
    navAgents: "Agent",
    navPets: "宠物",
    navPreferences: "偏好",
    noInstalledPets: "尚未安装任何宠物。",
    pets: "宠物",
    petsDescription: "选择一个宠物，或导入兼容 Codex 的宠物包。",
    petWindowHeading: "宠物窗口",
    preferencesTitle: "偏好",
    remove: "移除",
    refreshList: "刷新列表",
    resetPosition: "回归屏幕",
    resetPositionDescription: "把桌面宠物拉回屏幕右下角。",
    resetPositionFailed: "无法回归屏幕位置。",
    resetPositionSuccess: "桌面宠物已回到右下角。",
    settingsDescription: "设置界面语言与 Agent CLI 集成。",
    settingsNavLabel: "设置分区",
    size: "尺寸",
    zhCn: "中文",
  },
} as const;

export type MessageKey = keyof (typeof messages)["en-US"];

export function normalizeLocale(locale: string | null | undefined): Locale {
  return locale?.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

export function detectBrowserLocale(): Locale {
  const preferred = navigator.languages?.[0] ?? navigator.language;
  return normalizeLocale(preferred);
}

export function createTranslator(locale: string | null | undefined) {
  const activeLocale = normalizeLocale(locale);
  return (key: MessageKey) => messages[activeLocale][key];
}
