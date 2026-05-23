import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Info, PawPrint, Plug, Settings2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";

import copetLogoUrl from "./assets/logo-transparent.png";
import { ErrorView, LoadingView } from "./components/AppShell";
import { SettingsAboutSection } from "./components/SettingsAboutSection";
import { SettingsAgentsSection } from "./components/SettingsAgentsSection";
import { SettingsNav } from "./components/SettingsNav";
import { SettingsTipBox } from "./components/SettingsTipBox";
import { SettingsPetsSection } from "./components/SettingsPetsSection";
import { SettingsPreferencesSection } from "./components/SettingsPreferencesSection";
import { SettingsSectionHost } from "./components/SettingsSectionHost";
import type {
  SettingsNavItem,
  SettingsSectionId,
} from "./lib/settingsTypes";
import { Toaster } from "./components/ui/sonner";
import {
  useAdapters,
  useAppState,
  useCodexPets,
  useIsSelecting,
  useLoadState,
  usePetVisible,
} from "./hooks/useAppStore";
import * as commands from "./lib/appCommands";
import { createTranslator } from "./lib/i18n";
import type {
  AdapterSummary,
  PetSummary,
} from "./lib/appTypes";
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
  const loadState = useLoadState();
  const appState = useAppState();
  const { adapters, busyId: adapterBusyId } = useAdapters();
  const { codexPets, busyId: petBusyId } = useCodexPets();
  const isSelecting = useIsSelecting();
  const petVisible = usePetVisible();
  const reportedLoadErrorRef = useRef<string | null>(null);

  const reportErr = (errorMessage: string | null) => {
    if (errorMessage) toast.error(errorMessage);
  };
  const reportLoadError = (errorMessage: string) => {
    reportedLoadErrorRef.current = errorMessage;
    toast.error(errorMessage, { id: "settings-load-error" });
  };

  const selectPet = async (pet: PetSummary) => {
    const r = await commands.selectPet(pet);
    reportErr(r.errorMessage);
  };
  const setPetWindowSize = async (size: number) => {
    const r = await commands.setPetWindowSize(size);
    reportErr(r.errorMessage);
  };
  const setLocalePreference = async (
    pref: Parameters<typeof commands.setLocalePreference>[0],
  ) => {
    const r = await commands.setLocalePreference(pref);
    reportErr(r.errorMessage);
  };
  const setAgentMessageDisplay = async (
    display: Parameters<typeof commands.setAgentMessageDisplay>[0],
  ) => {
    const r = await commands.setAgentMessageDisplay(display);
    reportErr(r.errorMessage);
  };
  const setAgentMessageVisible = async (visible: boolean) => {
    const r = await commands.setAgentMessageVisible(visible);
    reportErr(r.errorMessage);
  };
  const setPetInteractions = async (
    prefs: Parameters<typeof commands.setPetInteractions>[0],
  ) => {
    const r = await commands.setPetInteractions(prefs);
    reportErr(r.errorMessage);
  };
  const selectAudioPack = async (audioPackId: string) => {
    const r = await commands.selectAudioPack(audioPackId);
    reportErr(r.errorMessage);
  };
  const setPetVisible = async (visible: boolean) => {
    const r = await commands.setPetVisible(visible);
    reportErr(r.errorMessage);
  };
  const runAdapterAction = (
    adapter: AdapterSummary,
    action:
      | "install_agent_adapter"
      | "repair_agent_adapter"
      | "uninstall_agent_adapter",
  ) => commands.runAdapterAction(adapter, action);
  const refreshPetLists = async () => {
    const r = await commands.refreshPetLists();
    reportErr(r.errorMessage);
    return { errorMessage: r.errorMessage };
  };
  const removePet = async (pet: PetSummary) => {
    const r = await commands.removePet(pet);
    reportErr(r.errorMessage);
  };
  const resetPetWindowPosition = async () => {
    const r = await commands.resetPetWindowPosition();
    return r.errorMessage ? { errorMessage: r.errorMessage } : {};
  };

  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>("pets");

  useEffect(() => {
    let dispose: (() => void) | undefined;
    void listen<SettingsSectionId>("copet-navigate-to-section", (event) => {
      setActiveSection(event.payload);
    }).then((cleanup) => {
      dispose = cleanup;
    });
    return () => {
      dispose?.();
    };
  }, []);

  const t = useMemo(
    () => createTranslator(appState?.locale),
    [appState?.locale],
  );

  useEffect(() => {
    if (loadState.status !== "error") {
      reportedLoadErrorRef.current = null;
      return;
    }
    if (
      loadState.error &&
      reportedLoadErrorRef.current !== loadState.error
    ) {
      reportLoadError(loadState.error);
    }
  }, [loadState.error, loadState.status]);

  const retryLoad = async () => {
    const result = await commands.reloadAppStore();
    if (result.errorMessage) {
      reportLoadError(result.errorMessage);
    }
  };

  if (loadState.status === "loading") {
    return <LoadingView />;
  }

  if (loadState.status === "error") {
    return (
      <>
        <ErrorView onRetry={() => void retryLoad()} retryLabel={t("retry")} />
        <Toaster />
      </>
    );
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
              src={copetLogoUrl}
            />
            <span className="settings-brand-name">CoPet</span>
          </div>
          <SettingsNav
            active={activeSection}
            items={NAV_ITEMS}
            onChange={setActiveSection}
            panelId={SETTINGS_PANEL_ID}
            t={t}
          />
          <SettingsTipBox t={t} />
        </aside>

        <header
          aria-hidden="true"
          className="settings-titlebar"
          data-tauri-drag-region
          onPointerDown={startSettingsDrag}
        >
          <span
            aria-hidden="true"
            className="settings-titlebar-traffic-lights"
            data-settings-no-drag
          />
        </header>

        <SettingsSectionHost
          activeSection={activeSection}
          id={SETTINGS_PANEL_ID}
        >
          {activeSection === "pets" && (
            <SettingsPetsSection
              currentPetId={currentPetId}
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
              audioPacks={appState.audioPacks ?? []}
              currentAudioPackId={appState.currentAudioPackId ?? ""}
              locale={appState.localePreference === "zh-CN" ? "zh-CN" : "en-US"}
              agentMessageVisible={appState.agentMessageVisible}
              petInteractions={appState.petInteractions ?? defaultPetInteractionPrefs}
              petVisible={petVisible}
              petWindowSize={petWindowSize}
              resetPetWindowPosition={resetPetWindowPosition}
              setAgentMessageDisplay={setAgentMessageDisplay}
              setAgentMessageVisible={setAgentMessageVisible}
              setLocalePreference={setLocalePreference}
              setPetInteractions={setPetInteractions}
              setPetVisible={setPetVisible}
              setPetWindowSize={setPetWindowSize}
              selectAudioPack={selectAudioPack}
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
