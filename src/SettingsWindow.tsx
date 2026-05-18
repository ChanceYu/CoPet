import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Info, PawPrint, Plug, Settings2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import pethoverLogoUrl from "./assets/logo.png";
import { ErrorView, LoadingView } from "./components/AppShell";
import { SettingsAboutSection } from "./components/SettingsAboutSection";
import { SettingsAgentsSection } from "./components/SettingsAgentsSection";
import { SettingsNav } from "./components/SettingsNav";
import { SettingsPetsSection } from "./components/SettingsPetsSection";
import { SettingsPreferencesSection } from "./components/SettingsPreferencesSection";
import { SettingsSectionHost } from "./components/SettingsSectionHost";
import type {
  SettingsNavItem,
  SettingsSectionId,
} from "./lib/settingsTypes";
import { Button } from "./components/ui/button";
import { Toaster } from "./components/ui/sonner";
import { useAppData } from "./hooks/useAppData";
import { createTranslator } from "./lib/i18n";
import type { PetSummary } from "./lib/appTypes";
import { defaultPetWindowSize } from "./lib/petWindowUi";

const emptyPetSummaries: PetSummary[] = [];

const SETTINGS_PANEL_ID = "settings-section-panel";

const NAV_ITEMS: SettingsNavItem[] = [
  { id: "pets", icon: PawPrint, labelKey: "navPets" },
  { id: "agents", icon: Plug, labelKey: "navAgents" },
  { id: "preferences", icon: Settings2, labelKey: "navPreferences" },
  { id: "about", icon: Info, labelKey: "navAbout" },
];

export function SettingsWindow() {
  const data = useAppData();
  const {
    adapterBusyId,
    adapters,
    importLocalPet,
    importLocalPetFolder,
    isSelecting,
    load,
    loadState,
    petBusyId,
    refreshPetLists,
    removePet,
    resetPetWindowPosition,
    runAdapterAction,
    selectPet,
    setLocalePreference,
    setPetWindowSize,
  } = data;

  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>("pets");

  const appState = loadState.status === "ready" ? loadState.data : null;
  const t = useMemo(
    () => createTranslator(appState?.locale),
    [appState?.locale],
  );

  if (loadState.status === "loading") {
    return <LoadingView />;
  }

  if (loadState.status === "error") {
    return <ErrorView message={loadState.message} onRetry={() => void load()} />;
  }

  if (!appState) {
    return <LoadingView />;
  }

  const installedPets = appState.pets ?? emptyPetSummaries;
  const currentPetId = appState.currentPetId ?? "";
  const petWindowSize = appState.petWindowSize ?? defaultPetWindowSize;

  const closeSettingsWindow = () => {
    void getCurrentWebviewWindow().hide();
  };

  const startSettingsDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(
        "button, input, select, textarea, a, [role='button'], [data-settings-no-drag]",
      )
    ) {
      return;
    }
    void getCurrentWebviewWindow().startDragging();
  };

  return (
    <main className="settings-window">
      <div className="settings-shell">
        <header
          className="settings-titlebar"
          data-tauri-drag-region
          onPointerDown={startSettingsDrag}
        >
          <div className="settings-brand" data-tauri-drag-region>
            <img
              alt=""
              aria-hidden="true"
              className="settings-logo-image"
              data-tauri-drag-region
              draggable={false}
              src={pethoverLogoUrl}
            />
            <span className="settings-brand-name" data-tauri-drag-region>
              PetHover
            </span>
          </div>
          <Button
            aria-label={t("close")}
            className="settings-close-button"
            onClick={closeSettingsWindow}
            size="icon"
            title={t("close")}
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </header>

        <div className="settings-body">
          <SettingsNav
            active={activeSection}
            items={NAV_ITEMS}
            onChange={setActiveSection}
            panelId={SETTINGS_PANEL_ID}
            t={t}
          />

          <SettingsSectionHost
            activeSection={activeSection}
            id={SETTINGS_PANEL_ID}
          >
            {activeSection === "pets" && (
              <SettingsPetsSection
                currentPetId={currentPetId}
                importLocalPet={importLocalPet}
                importLocalPetFolder={importLocalPetFolder}
                installedPets={installedPets}
                isSelecting={isSelecting}
                petBusyId={petBusyId}
                refreshPetLists={refreshPetLists}
                removePet={removePet}
                selectPet={selectPet}
                t={t}
              />
            )}
            {activeSection === "agents" && (
              <SettingsAgentsSection
                adapterBusyId={adapterBusyId}
                adapters={adapters}
                runAdapterAction={runAdapterAction}
                t={t}
              />
            )}
            {activeSection === "preferences" && (
              <SettingsPreferencesSection
                locale={appState.localePreference === "zh-CN" ? "zh-CN" : "en-US"}
                petWindowSize={petWindowSize}
                resetPetWindowPosition={resetPetWindowPosition}
                setLocalePreference={setLocalePreference}
                setPetWindowSize={setPetWindowSize}
                t={t}
              />
            )}
            {activeSection === "about" && <SettingsAboutSection t={t} />}
          </SettingsSectionHost>
        </div>
      </div>
      <Toaster />
    </main>
  );
}
