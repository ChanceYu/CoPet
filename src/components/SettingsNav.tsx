import type { KeyboardEvent } from "react";

import type {
  SettingsNavItem,
  SettingsSectionId,
  Translator,
} from "../lib/settingsTypes";

interface SettingsNavProps {
  active: SettingsSectionId;
  items: SettingsNavItem[];
  onChange: (next: SettingsSectionId) => void;
  panelId: string;
  t: Translator;
}

export function SettingsNav({
  active,
  items,
  onChange,
  panelId,
  t,
}: SettingsNavProps) {
  const focusItemByOffset = (currentId: SettingsSectionId, offset: number) => {
    const currentIndex = items.findIndex((item) => item.id === currentId);
    if (currentIndex === -1) {
      return;
    }
    const nextIndex =
      (currentIndex + offset + items.length) % items.length;
    onChange(items[nextIndex].id);
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    id: SettingsSectionId,
  ) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusItemByOffset(id, 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusItemByOffset(id, -1);
        break;
      case "Home":
        event.preventDefault();
        onChange(items[0].id);
        break;
      case "End":
        event.preventDefault();
        onChange(items[items.length - 1].id);
        break;
    }
  };

  return (
    <nav
      aria-label={t("settingsNavLabel")}
      aria-orientation="vertical"
      className="settings-nav"
      role="tablist"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.id === active;
        const label = t(item.labelKey);
        return (
          <button
            aria-controls={panelId}
            aria-selected={isActive}
            className="settings-nav-item"
            data-active={isActive}
            data-section-id={item.id}
            key={item.id}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => handleKeyDown(event, item.id)}
            role="tab"
            tabIndex={isActive ? 0 : -1}
            title={label}
            type="button"
          >
            <Icon aria-hidden="true" />
            <span className="settings-nav-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
