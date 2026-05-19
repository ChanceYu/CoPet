import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Info, PawPrint, Plug, Settings2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import pethoverLogoUrl from "./assets/logo-transparent.png";
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
import { Toaster } from "./components/ui/sonner";
import { useAppData } from "./hooks/useAppData";
import { createTranslator } from "./lib/i18n";
import type { PetSummary } from "./lib/appTypes";
import { defaultPetInteractionPrefs } from "./lib/appTypes";
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
    setAgentMessageDisplay,
    setLocalePreference,
    setPetInteractions,
    setPetWindowSize,
    setResponsePaused,
  } = data;

  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>("pets");

  useEffect(() => {
    let dispose: (() => void) | undefined;
    void listen<SettingsSectionId>("pethover-navigate-to-section", (event) => {
      setActiveSection(event.payload);
    }).then((cleanup) => {
      dispose = cleanup;
    });
    return () => {
      dispose?.();
    };
  }, []);

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
        <aside className="settings-sidebar">
          <div className="settings-sidebar-brand">
            <img
              alt=""
              aria-hidden="true"
              className="settings-logo-image"
              draggable={false}
              src={pethoverLogoUrl}
            />
            <span className="settings-brand-name">PetHover</span>
          </div>
          <SettingsNav
            active={activeSection}
            items={NAV_ITEMS}
            onChange={setActiveSection}
            panelId={SETTINGS_PANEL_ID}
            t={t}
          />
        </aside>

        <header
          aria-hidden="true"
          className="settings-titlebar"
          data-tauri-drag-region
          onPointerDown={startSettingsDrag}
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
              agentMessageDisplay={appState.agentMessageDisplay}
              locale={appState.localePreference === "zh-CN" ? "zh-CN" : "en-US"}
              petInteractions={appState.petInteractions ?? defaultPetInteractionPrefs}
              petWindowSize={petWindowSize}
              resetPetWindowPosition={resetPetWindowPosition}
              responsePaused={appState.responsePaused}
              setAgentMessageDisplay={setAgentMessageDisplay}
              setLocalePreference={setLocalePreference}
              setPetInteractions={setPetInteractions}
              setPetWindowSize={setPetWindowSize}
              setResponsePaused={setResponsePaused}
              t={t}
            />
          )}
          {activeSection === "about" && <SettingsAboutSection t={t} />}
        </SettingsSectionHost>
      </div>
      <Toaster />
    </main>
  );
}
