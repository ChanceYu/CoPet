import { invoke } from "@tauri-apps/api/core";

import { agentMessageKey, appStore } from "./appStore";
import type {
  AdapterSummary,
  AgentMessageDisplay,
  AppState,
  LocalePreference,
  PetImportCommitResult,
  PetInteractionPrefs,
  PetImportPreviewBatch,
  PetImportSession,
  PetSummary,
  PetWindowSize,
  RuntimeStatus,
} from "./appTypes";

export type CommandResult = { errorMessage: string | null };

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function patchAppState(next: AppState): void {
  appStore.patch({ appState: next });
}

export async function reloadAppStore(): Promise<CommandResult> {
  appStore.patch({ loadStatus: "loading", loadError: null });
  try {
    const [app, runtime, adapters, codex, visible] = await Promise.all([
      invoke<AppState>("get_app_state"),
      invoke<RuntimeStatus>("get_runtime_status"),
      invoke<AdapterSummary[]>("list_agent_adapters"),
      invoke<PetSummary[]>("list_codex_pets"),
      invoke<boolean>("get_pet_window_visible"),
    ]);
    appStore.patch({
      loadStatus: "ready",
      loadError: null,
      appState: app,
      petState: runtime.currentState.state,
      agentMessages: runtime.messages,
      adapters,
      codexPets: codex,
      petVisible: visible,
    });
    return { errorMessage: null };
  } catch (error) {
    const message = toMessage(error);
    appStore.patch({ loadStatus: "error", loadError: message });
    return { errorMessage: message };
  }
}

export async function selectPet(pet: PetSummary): Promise<CommandResult> {
  appStore.patch({ isSelecting: true });
  try {
    const next = await invoke<AppState>("select_pet", { petId: pet.id });
    patchAppState(next);
    return { errorMessage: null };
  } catch (error) {
    return { errorMessage: toMessage(error) };
  } finally {
    appStore.patch({ isSelecting: false });
  }
}

export async function setPetWindowSize(
  size: PetWindowSize,
): Promise<CommandResult> {
  try {
    const next = await invoke<AppState>("set_pet_window_size", { size });
    patchAppState(next);
    return { errorMessage: null };
  } catch (error) {
    return { errorMessage: toMessage(error) };
  }
}

export async function setLocalePreference(
  localePreference: LocalePreference,
): Promise<CommandResult> {
  try {
    const next = await invoke<AppState>("set_locale_preference", {
      localePreference,
    });
    patchAppState(next);
    return { errorMessage: null };
  } catch (error) {
    return { errorMessage: toMessage(error) };
  }
}

export async function setAgentMessageDisplay(
  agentMessageDisplay: AgentMessageDisplay,
): Promise<CommandResult> {
  try {
    const next = await invoke<AppState>("set_agent_message_display", {
      agentMessageDisplay,
    });
    patchAppState(next);
    return { errorMessage: null };
  } catch (error) {
    return { errorMessage: toMessage(error) };
  }
}

export async function setResponsePaused(
  paused: boolean,
): Promise<CommandResult> {
  try {
    const next = await invoke<AppState>("set_response_paused", { paused });
    patchAppState(next);
    return { errorMessage: null };
  } catch (error) {
    return { errorMessage: toMessage(error) };
  }
}

export async function setPetInteractions(
  prefs: PetInteractionPrefs,
): Promise<CommandResult> {
  try {
    const next = await invoke<AppState>("set_pet_interactions", { prefs });
    patchAppState(next);
    return { errorMessage: null };
  } catch (error) {
    return { errorMessage: toMessage(error) };
  }
}

export async function setPetVisible(visible: boolean): Promise<CommandResult> {
  if (visible === appStore.get().petVisible) {
    return { errorMessage: null };
  }
  try {
    const next = await invoke<boolean>("toggle_pet_window_visibility");
    appStore.patch({ petVisible: next });
    return { errorMessage: null };
  } catch (error) {
    return { errorMessage: toMessage(error) };
  }
}

export async function runAdapterAction(
  adapter: AdapterSummary,
  action:
    | "install_agent_adapter"
    | "repair_agent_adapter"
    | "uninstall_agent_adapter",
): Promise<CommandResult> {
  appStore.patch({ adapterBusyId: adapter.id });
  try {
    await invoke(action, { adapterId: adapter.id });
    const [agentAdapters, runtime] = await Promise.all([
      invoke<AdapterSummary[]>("list_agent_adapters"),
      invoke<RuntimeStatus>("get_runtime_status"),
    ]);
    appStore.patch({
      adapters: agentAdapters,
      agentMessages: runtime.messages,
    });
    return { errorMessage: null };
  } catch (error) {
    try {
      const [agentAdapters, runtime] = await Promise.all([
        invoke<AdapterSummary[]>("list_agent_adapters"),
        invoke<RuntimeStatus>("get_runtime_status"),
      ]);
      appStore.patch({
        adapters: agentAdapters,
        agentMessages: runtime.messages,
      });
    } catch {
      // best-effort refresh on failure path
    }
    return { errorMessage: toMessage(error) };
  } finally {
    appStore.patch({ adapterBusyId: null });
  }
}

async function refreshPetListsInternal(): Promise<CommandResult> {
  try {
    const [next, codexPets] = await Promise.all([
      invoke<AppState>("get_app_state"),
      invoke<PetSummary[]>("list_codex_pets"),
    ]);
    appStore.patch({ appState: next, codexPets });
    return { errorMessage: null };
  } catch (error) {
    return { errorMessage: toMessage(error) };
  }
}

export const refreshPetLists = refreshPetListsInternal;

export async function createPetImportSession(): Promise<
  CommandResult & { session: PetImportSession | null }
> {
  try {
    const session = await invoke<PetImportSession>("create_pet_import_session");
    return { errorMessage: null, session };
  } catch (error) {
    return { errorMessage: toMessage(error), session: null };
  }
}

async function previewPetImports(
  command:
    | "preview_codex_pet_imports"
    | "preview_pet_import_folders",
  args: Record<string, unknown>,
): Promise<CommandResult & { batch: PetImportPreviewBatch | null }> {
  appStore.patch({ petBusyId: "import-preview" });
  try {
    const batch = await invoke<PetImportPreviewBatch>(command, args);
    return { errorMessage: null, batch };
  } catch (error) {
    return { errorMessage: toMessage(error), batch: null };
  } finally {
    appStore.patch({ petBusyId: null });
  }
}

export async function previewCodexPetImports(
  sessionId: string,
): Promise<CommandResult & { batch: PetImportPreviewBatch | null }> {
  return previewPetImports("preview_codex_pet_imports", { sessionId });
}

export async function previewPetImportFolders(
  sessionId: string,
  folderPaths: string[],
): Promise<CommandResult & { batch: PetImportPreviewBatch | null }> {
  return previewPetImports("preview_pet_import_folders", {
    sessionId,
    folderPaths,
  });
}

export async function commitPetImportPreviews(
  sessionId: string,
  previewIds: string[],
): Promise<CommandResult & { result: PetImportCommitResult | null }> {
  appStore.patch({ petBusyId: "import-commit" });
  try {
    const result = await invoke<PetImportCommitResult>(
      "commit_pet_import_previews",
      { sessionId, previewIds },
    );
    appStore.patch({ appState: result.state });
    await refreshPetListsInternal();
    return { errorMessage: null, result };
  } catch (error) {
    return { errorMessage: toMessage(error), result: null };
  } finally {
    appStore.patch({ petBusyId: null });
  }
}

export async function discardPetImportPreviews(
  sessionId: string,
): Promise<CommandResult> {
  try {
    await invoke("discard_pet_import_previews", { sessionId });
    return { errorMessage: null };
  } catch (error) {
    return { errorMessage: toMessage(error) };
  }
}

export async function getDownloadsDir(): Promise<string | null> {
  try {
    return await invoke<string | null>("get_downloads_dir");
  } catch {
    return null;
  }
}

export async function resetPetWindowPosition(): Promise<CommandResult> {
  try {
    await invoke("reset_pet_window_position");
    return { errorMessage: null };
  } catch (error) {
    return { errorMessage: toMessage(error) };
  }
}

export async function removePet(pet: PetSummary): Promise<CommandResult> {
  appStore.patch({ petBusyId: pet.id });
  try {
    await invoke<AppState>("remove_pet", { petId: pet.id });
    return await refreshPetListsInternal();
  } catch (error) {
    return { errorMessage: toMessage(error) };
  } finally {
    appStore.patch({ petBusyId: null });
  }
}

export function dismissAgentMessage(agentId: string): void {
  const { agentMessages, dismissedAgentMessageKeys } = appStore.get();
  const message = agentMessages.find((m) => m.agent === agentId);
  if (!message) return;
  const next = new Set(dismissedAgentMessageKeys);
  next.add(agentMessageKey(message));
  appStore.patch({ dismissedAgentMessageKeys: next });
}
