import type { LucideIcon } from "lucide-react";

import type { createTranslator } from "../lib/i18n";

export type SettingsSectionId = "pets" | "agents" | "preferences" | "about";

export interface SettingsNavItem {
  id: SettingsSectionId;
  icon: LucideIcon;
  labelKey: SettingsNavLabelKey;
}

export type SettingsNavLabelKey =
  | "navPets"
  | "navAgents"
  | "navPreferences"
  | "navAbout";

export type Translator = ReturnType<typeof createTranslator>;
