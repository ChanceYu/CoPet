import { appStore } from "../lib/appStore";
import * as commands from "../lib/appCommands";
import type { AdapterSummary, PetSummary } from "../lib/appTypes";
import {
  useAdapters,
  useAgentMessages,
  useAppState,
  useCodexPets,
  useIsSelecting,
  useLoadState,
  usePetState,
  usePetVisible,
  useSelectedPet,
} from "./useAppStore";
import type { AppState } from "../lib/appTypes";

export type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: AppState }
  | { status: "error"; message: string };

function escalate(result: { errorMessage: string | null }) {
  if (result.errorMessage) {
    appStore.patch({ loadStatus: "error", loadError: result.errorMessage });
  }
}

export function useAppData() {
  const load = useLoadState();
  const appState = useAppState();
  const petState = usePetState();
  const agentMessages = useAgentMessages();
  const selectedPet = useSelectedPet();
  const { adapters, busyId: adapterBusyId } = useAdapters();
  const { codexPets, busyId: petBusyId } = useCodexPets();
  const isSelecting = useIsSelecting();
  const petVisible = usePetVisible();

  const loadState: LoadState =
    load.status === "ready" && appState
      ? { status: "ready", data: appState }
      : load.status === "error"
        ? { status: "error", message: load.error ?? "Unknown error" }
        : { status: "loading" };

  return {
    adapterBusyId,
    agentMessages,
    adapters,
    codexPets,
    dismissAgentMessage: (agentId: String) =>
      commands.dismissAgentMessage(String(agentId)),
    importLocalPet: async (manifestJson: string, spriteFile: File) => {
      const result = await commands.importLocalPet(manifestJson, spriteFile);
      escalate(result);
      return result;
    },
    importLocalPetFolder: async (folderPath: string) => {
      const result = await commands.importLocalPetFolder(folderPath);
      return result;
    },
    isSelecting,
    load: async () => {
      const result = await commands.reloadAppStore();
      escalate(result);
    },
    loadState,
    installCodexPet: async (pet: PetSummary) => {
      const result = await commands.installCodexPet(pet);
      escalate(result);
    },
    petBusyId,
    petVisible,
    petState,
    refreshPetLists: async () => {
      const result = await commands.refreshPetLists();
      escalate(result);
      return appStore.get().appState;
    },
    removePet: async (pet: PetSummary) => {
      const result = await commands.removePet(pet);
      escalate(result);
    },
    resetPetWindowPosition: async () => {
      const result = await commands.resetPetWindowPosition();
      return result.errorMessage
        ? { errorMessage: result.errorMessage }
        : ({} as { errorMessage?: string });
    },
    runAdapterAction: async (
      adapter: AdapterSummary,
      action:
        | "install_agent_adapter"
        | "repair_agent_adapter"
        | "uninstall_agent_adapter",
    ) => {
      const result = await commands.runAdapterAction(adapter, action);
      return result;
    },
    runtimeStatus: null,
    selectPet: async (pet: PetSummary) => {
      const result = await commands.selectPet(pet);
      escalate(result);
    },
    selectedPet,
    setAgentMessageDisplay: async (display: Parameters<typeof commands.setAgentMessageDisplay>[0]) => {
      const result = await commands.setAgentMessageDisplay(display);
      escalate(result);
    },
    setLocalePreference: async (pref: Parameters<typeof commands.setLocalePreference>[0]) => {
      const result = await commands.setLocalePreference(pref);
      escalate(result);
    },
    setPetInteractions: async (prefs: Parameters<typeof commands.setPetInteractions>[0]) => {
      const result = await commands.setPetInteractions(prefs);
      escalate(result);
    },
    setPetVisible: async (visible: boolean) => {
      const result = await commands.setPetVisible(visible);
      escalate(result);
    },
    setPetWindowSize: async (size: Parameters<typeof commands.setPetWindowSize>[0]) => {
      const result = await commands.setPetWindowSize(size);
      escalate(result);
    },
    setResponsePaused: async (paused: boolean) => {
      const result = await commands.setResponsePaused(paused);
      escalate(result);
    },
  };
}
