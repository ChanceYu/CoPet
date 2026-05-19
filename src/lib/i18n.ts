export type Locale = "en-US" | "zh-CN";

const messages = {
  "en-US": {
    aboutBuiltWith: "Built with Tauri, Rust, and React.",
    aboutLicenseNotice: "© PetHover contributors. All rights reserved.",
    aboutRepoLink: "View source on GitHub",
    aboutTitle: "About",
    aboutVersion: "Version",
    agentIntegrations: "Agent integrations",
    backToTop: "Back to top",
    close: "Close",
    currentPet: "Current pet",
    customBadge: "Custom",
    english: "English",
    importLocalFolder: "Import folder",
    interactionQuipChill1: "…",
    interactionQuipChill2: "Mmm",
    interactionQuipHi1: "Hi!",
    interactionQuipHi2: "Hey there",
    interactionQuipHi3: "Yo",
    interactionQuipSurprised1: "Yes?",
    interactionQuipSurprised2: "Hm?",
    interactionQuipSurprised3: "Huh?",
    interactionQuipTickled1: "Tickled!",
    interactionQuipTickled2: "Hehe",
    interactionQuipTickled3: "Stop it!",
    interactionQuipWheee1: "Wheee!",
    interactionQuipWheee2: "Whoa!",
    contextMenuPet: "Pet",
    contextMenuPauseOn: "Pause messages",
    contextMenuPauseOff: "Resume messages",
    contextMenuOpenSettings: "Open Settings",
    contextMenuHidePet: "Hide pet",
    locateCurrent: "Find current pet",
    invalidLocalPetFolder: "The folder must contain pet.json and either spritesheet.webp or spritesheet.png.",
    language: "Language",
    messageDisplay: "Message display",
    messageDisplayAll: "All agents",
    messageDisplayLatest: "Most recent only",
    navAbout: "About",
    navAgents: "Agents",
    navPets: "Pets",
    navPreferences: "Preferences",
    noInstalledPets: "No pets installed.",
    pauseResponse: "Pause messages",
    pauseResponseDescription: "Stop receiving new agent messages until resumed.",
    pauseStateOn: "On",
    pauseStateOff: "Off",
    petInteractionsHeading: "Pet interactions",
    enableInteractionQuips: "Enable interaction quips",
    enableInteractionQuipsDescription: "Show small bubbles when you pet or poke your pet.",
    enableClickSounds: "Enable click sounds",
    enableClickSoundsBadge: "Coming soon",
    interactionCooldown: "Interaction cooldown",
    interactionCooldownShort: "Short",
    interactionCooldownNormal: "Normal",
    interactionCooldownLazy: "Lazy",
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
    settingsDescription: "Toggle each agent CLI integration on or off.",
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
    agentIntegrations: "Agent 集成",
    backToTop: "返回顶部",
    close: "关闭",
    currentPet: "当前宠物",
    customBadge: "自定义",
    english: "English",
    importLocalFolder: "导入文件夹",
    interactionQuipChill1: "……",
    interactionQuipChill2: "嗯～",
    interactionQuipHi1: "嗨！",
    interactionQuipHi2: "你好呀",
    interactionQuipHi3: "唷",
    interactionQuipSurprised1: "嗯？",
    interactionQuipSurprised2: "怎么了？",
    interactionQuipSurprised3: "哎？",
    interactionQuipTickled1: "好痒！",
    interactionQuipTickled2: "嘿嘿",
    interactionQuipTickled3: "别挠了！",
    interactionQuipWheee1: "哇！",
    interactionQuipWheee2: "嗖～",
    contextMenuPet: "摸摸",
    contextMenuPauseOn: "暂停消息",
    contextMenuPauseOff: "恢复消息",
    contextMenuOpenSettings: "打开设置",
    contextMenuHidePet: "隐藏宠物",
    locateCurrent: "定位当前宠物",
    invalidLocalPetFolder: "所选文件夹需要同时包含 pet.json 和 spritesheet.webp 或 spritesheet.png 之一。",
    language: "语言",
    messageDisplay: "消息显示",
    messageDisplayAll: "全部 Agent",
    messageDisplayLatest: "仅最新一条",
    navAbout: "关于",
    navAgents: "Agent",
    navPets: "宠物",
    navPreferences: "偏好设置",
    noInstalledPets: "尚未安装任何宠物。",
    pauseResponse: "暂停消息",
    pauseResponseDescription: "暂停接收新的 Agent 消息，直到恢复。",
    pauseStateOn: "已开启",
    pauseStateOff: "已关闭",
    petInteractionsHeading: "互动设置",
    enableInteractionQuips: "启用互动气泡",
    enableInteractionQuipsDescription: "摸宠物时显示小气泡。",
    enableClickSounds: "启用点击音效",
    enableClickSoundsBadge: "即将推出",
    interactionCooldown: "互动冷却",
    interactionCooldownShort: "短",
    interactionCooldownNormal: "标准",
    interactionCooldownLazy: "懒",
    pets: "宠物",
    petsDescription: "选择一个宠物，或导入兼容 Codex 的宠物包。",
    petWindowHeading: "宠物窗口",
    preferencesTitle: "偏好设置",
    remove: "移除",
    refreshList: "刷新列表",
    resetPosition: "重置位置",
    resetPositionDescription: "把桌面宠物拉回屏幕右下方的默认位置。",
    resetPositionFailed: "无法重置宠物位置。",
    resetPositionSuccess: "桌面宠物已回到屏幕右下方。",
    settingsDescription: "为每个 Agent CLI 开启或关闭集成。",
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

export type InteractionQuipPool = "hi" | "surprised" | "tickled" | "chill" | "wheee";

export function interactionQuipPool(locale: Locale, pool: InteractionQuipPool): string[] {
  const m = messages[locale];
  switch (pool) {
    case "hi":
      return [m.interactionQuipHi1, m.interactionQuipHi2, m.interactionQuipHi3];
    case "surprised":
      return [m.interactionQuipSurprised1, m.interactionQuipSurprised2, m.interactionQuipSurprised3];
    case "tickled":
      return [m.interactionQuipTickled1, m.interactionQuipTickled2, m.interactionQuipTickled3];
    case "chill":
      return [m.interactionQuipChill1, m.interactionQuipChill2];
    case "wheee":
      return [m.interactionQuipWheee1, m.interactionQuipWheee2];
  }
}
