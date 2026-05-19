import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  AdapterSummary,
  AgentMessageDisplay,
  AppState,
  AgentMessage,
  LocalePreference,
  PetInteractionPrefs,
  PetStateId,
  PetSummary,
  PetWindowSize,
  RuntimeStatus,
  RuntimeUpdate,
} from "../lib/appTypes";
import { pethoverDevLog } from "../lib/devLogger";

export type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: AppState }
  | { status: "error"; message: string };

const APP_STATE_CHANGED_EVENT = "pethover-app-state-changed";
const PET_WINDOW_VISIBILITY_CHANGED_EVENT = "pethover-pet-window-visibility-changed";

function agentMessageKey(message: AgentMessage) {
  return `${message.agent}:${message.updatedAtMs}:${message.text}`;
}

export function useAppData() {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [isSelecting, setIsSelecting] = useState(false);
  const [adapterBusyId, setAdapterBusyId] = useState<string | null>(null);
  const [adapters, setAdapters] = useState<AdapterSummary[]>([]);
  const [codexPets, setCodexPets] = useState<PetSummary[]>([]);
  const [petBusyId, setPetBusyId] = useState<string | null>(null);
  const [petVisible, setPetVisibleState] = useState(true);
  const [petState, setPetState] = useState<PetStateId>("idle");
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [dismissedAgentMessageKeys, setDismissedAgentMessageKeys] = useState(
    () => new Set<string>(),
  );
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);

  const responsePausedRef = useRef(false);

  useEffect(() => {
    if (loadState.status === "ready") {
      responsePausedRef.current = loadState.data.responsePaused;
    }
  }, [loadState]);

  const load = async () => {
    setLoadState({ status: "loading" });
    try {
      const [data, runtime, agentAdapters, codexPetPackages, visible] = await Promise.all([
        invoke<AppState>("get_app_state"),
        invoke<RuntimeStatus>("get_runtime_status"),
        invoke<AdapterSummary[]>("list_agent_adapters"),
        invoke<PetSummary[]>("list_codex_pets"),
        invoke<boolean>("get_pet_window_visible"),
      ]);
      setLoadState({ status: "ready", data });
      setRuntimeStatus(runtime);
      setAdapters(agentAdapters);
      setCodexPets(codexPetPackages);
      setPetVisibleState(visible);
      setPetState(runtime.currentState.state);
      setAgentMessages(runtime.messages);
      pethoverDevLog("frontend.snapshot.loaded", {
        currentState: runtime.currentState,
        messages: runtime.messages,
      });
    } catch (error) {
      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    let unlistenPetState: (() => void) | undefined;
    let unlistenAppState: (() => void) | undefined;
    let unlistenPetVisibility: (() => void) | undefined;

    void getCurrentWebviewWindow().listen<RuntimeUpdate>("pet-state-changed", (event) => {
      pethoverDevLog("frontend.event.pet-state-changed", {
        currentState: event.payload.currentState,
        messages: event.payload.messages,
        paused: responsePausedRef.current,
      });
      if (responsePausedRef.current) {
        return;
      }
      setPetState(event.payload.currentState.state);
      setAgentMessages(event.payload.messages);
    }).then((cleanup) => {
      unlistenPetState = cleanup;
    });

    void getCurrentWebviewWindow().listen<AppState>(APP_STATE_CHANGED_EVENT, (event) => {
      setReadyData(event.payload);
    }).then((cleanup) => {
      unlistenAppState = cleanup;
    });

    void getCurrentWebviewWindow().listen<boolean>(
      PET_WINDOW_VISIBILITY_CHANGED_EVENT,
      (event) => {
        setPetVisibleState(event.payload);
      },
    ).then((cleanup) => {
      unlistenPetVisibility = cleanup;
    });

    return () => {
      unlistenPetState?.();
      unlistenAppState?.();
      unlistenPetVisibility?.();
    };
  }, []);

  const selectedPet = useMemo(() => {
    if (loadState.status !== "ready") {
      return null;
    }

    return (
      loadState.data.pets.find((pet) => pet.id === loadState.data.currentPetId) ??
      loadState.data.pets[0]
    );
  }, [loadState]);

  const agentMessageDisplay =
    loadState.status === "ready" ? loadState.data.agentMessageDisplay : "latest";
  const responsePaused =
    loadState.status === "ready" ? loadState.data.responsePaused : false;

  const visibleAgentMessages = useMemo(() => {
    if (responsePaused) {
      return [];
    }
    const visible = agentMessages.filter(
      (message) => !dismissedAgentMessageKeys.has(agentMessageKey(message)),
    );
    if (agentMessageDisplay !== "latest") {
      return visible;
    }
    if (visible.length === 0) {
      return visible;
    }
    return [
      visible.reduce((latest, message) =>
        message.updatedAtMs > latest.updatedAtMs ? message : latest,
      ),
    ];
  }, [agentMessages, agentMessageDisplay, dismissedAgentMessageKeys, responsePaused]);

  const selectPet = async (pet: PetSummary) => {
    setIsSelecting(true);
    try {
      const data = await invoke<AppState>("select_pet", { petId: pet.id });
      setReadyData(data);
    } catch (error) {
      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSelecting(false);
    }
  };

  const setPetWindowSize = async (size: PetWindowSize) => {
    try {
      const data = await invoke<AppState>("set_pet_window_size", { size });
      setReadyData(data);
    } catch (error) {
      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const setLocalePreference = async (localePreference: LocalePreference) => {
    try {
      const data = await invoke<AppState>("set_locale_preference", { localePreference });
      setReadyData(data);
    } catch (error) {
      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const setAgentMessageDisplay = async (agentMessageDisplay: AgentMessageDisplay) => {
    try {
      const data = await invoke<AppState>("set_agent_message_display", {
        agentMessageDisplay,
      });
      setReadyData(data);
    } catch (error) {
      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const setResponsePaused = async (paused: boolean) => {
    try {
      const data = await invoke<AppState>("set_response_paused", { paused });
      setReadyData(data);
    } catch (error) {
      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const setPetVisible = async (visible: boolean) => {
    if (visible === petVisible) {
      return;
    }
    try {
      const nextVisible = await invoke<boolean>("toggle_pet_window_visibility");
      setPetVisibleState(nextVisible);
    } catch (error) {
      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const setPetInteractions = async (prefs: PetInteractionPrefs) => {
    try {
      const data = await invoke<AppState>("set_pet_interactions", { prefs });
      setReadyData(data);
    } catch (error) {
      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const setReadyData = (data: AppState) => {
    setLoadState({ status: "ready", data });
  };

  const refreshPetLists = async () => {
    const [data, codexPetPackages] = await Promise.all([
      invoke<AppState>("get_app_state"),
      invoke<PetSummary[]>("list_codex_pets"),
    ]);
    setReadyData(data);
    setCodexPets(codexPetPackages);
    return data;
  };

  const dismissAgentMessage = (agentId: String) => {
    const message = agentMessages.find((item) => item.agent === agentId);
    if (!message) {
      return;
    }
    setDismissedAgentMessageKeys((current) => {
      const next = new Set(current);
      next.add(agentMessageKey(message));
      return next;
    });
  };

  const runAdapterAction = async (
    adapter: AdapterSummary,
    action: "install_agent_adapter" | "repair_agent_adapter" | "uninstall_agent_adapter",
  ) => {
    setAdapterBusyId(adapter.id);
    try {
      await invoke(action, { adapterId: adapter.id });
      const [agentAdapters, runtime] = await Promise.all([
        invoke<AdapterSummary[]>("list_agent_adapters"),
        invoke<RuntimeStatus>("get_runtime_status"),
      ]);
      setAdapters(agentAdapters);
      setRuntimeStatus(runtime);
      setAgentMessages(runtime.messages);
      return { errorMessage: null };
    } catch (error) {
      const [agentAdapters, runtime] = await Promise.all([
        invoke<AdapterSummary[]>("list_agent_adapters"),
        invoke<RuntimeStatus>("get_runtime_status"),
      ]);
      setAdapters(agentAdapters);
      setRuntimeStatus(runtime);
      setAgentMessages(runtime.messages);
      return { errorMessage: error instanceof Error ? error.message : String(error) };
    } finally {
      setAdapterBusyId(null);
    }
  };

  const installCodexPet = async (pet: PetSummary) => {
    setPetBusyId(pet.id);
    try {
      await invoke<AppState>("install_codex_pet", { petId: pet.id });
      await refreshPetLists();
    } catch (error) {
      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPetBusyId(null);
    }
  };

  const importLocalPet = async (manifestJson: string, spriteFile: File) => {
    setPetBusyId("local-import");
    try {
      const spriteBytes = Array.from(new Uint8Array(await spriteFile.arrayBuffer()));
      const importedState = await invoke<AppState>("import_pet_files", {
        manifestJson,
        spriteFileName: spriteFile.name,
        spriteBytes,
      });
      await refreshPetLists();
      return { errorMessage: null, state: importedState };
    } catch (error) {
      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
      return {
        errorMessage: error instanceof Error ? error.message : String(error),
        state: null,
      };
    } finally {
      setPetBusyId(null);
    }
  };

  const importLocalPetFolder = async (folderPath: string) => {
    setPetBusyId("local-import");
    try {
      const importedState = await invoke<AppState>("import_pet_folder", { folderPath });
      await refreshPetLists();
      return { errorMessage: null, state: importedState };
    } catch (error) {
      return {
        errorMessage: error instanceof Error ? error.message : String(error),
        state: null,
      };
    } finally {
      setPetBusyId(null);
    }
  };

  const resetPetWindowPosition = async (): Promise<{ errorMessage?: string }> => {
    try {
      await invoke("reset_pet_window_position");
      return {};
    } catch (error) {
      return {
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const removePet = async (pet: PetSummary) => {
    setPetBusyId(pet.id);
    try {
      await invoke<AppState>("remove_pet", { petId: pet.id });
      await refreshPetLists();
    } catch (error) {
      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPetBusyId(null);
    }
  };

  return {
    adapterBusyId,
    agentMessages: visibleAgentMessages,
    adapters,
    codexPets,
    dismissAgentMessage,
    importLocalPet,
    importLocalPetFolder,
    isSelecting,
    load,
    loadState,
    installCodexPet,
    petBusyId,
    petVisible,
    petState,
    refreshPetLists,
    removePet,
    resetPetWindowPosition,
    runAdapterAction,
    runtimeStatus,
    selectPet,
    selectedPet,
    setAgentMessageDisplay,
    setLocalePreference,
    setPetInteractions,
    setPetVisible,
    setPetWindowSize,
    setResponsePaused,
  };
}
