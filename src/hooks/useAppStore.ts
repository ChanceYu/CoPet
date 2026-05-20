import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import {
  agentMessageKey,
  appStore,
  type AppStoreSnapshot,
} from "../lib/appStore";
import type {
  AdapterSummary,
  AgentMessage,
  AppState,
  PetInteractionPrefs,
  PetStateId,
  PetSummary,
  PetWindowSize,
  RuntimeStatus,
  RuntimeUpdate,
} from "../lib/appTypes";
import { defaultPetInteractionPrefs } from "../lib/appTypes";
import { defaultPetWindowSize } from "../lib/petWindowUi";
import { pethoverDevLog } from "../lib/devLogger";

const APP_STATE_CHANGED_EVENT = "pethover-app-state-changed";
const PET_WINDOW_VISIBILITY_CHANGED_EVENT = "pethover-pet-window-visibility-changed";

export function useAppSlice<T>(selector: (s: AppStoreSnapshot) => T): T {
  return useSyncExternalStore(
    appStore.subscribe,
    () => selector(appStore.get()),
    () => selector(appStore.get()),
  );
}

export function useBootstrapAppStore(): void {
  useEffect(() => {
    let cancelled = false;
    const unlistens: Array<() => void> = [];

    void (async () => {
      try {
        const [app, runtime, adapters, codex, visible] = await Promise.all([
          invoke<AppState>("get_app_state"),
          invoke<RuntimeStatus>("get_runtime_status"),
          invoke<AdapterSummary[]>("list_agent_adapters"),
          invoke<PetSummary[]>("list_codex_pets"),
          invoke<boolean>("get_pet_window_visible"),
        ]);
        if (cancelled) return;
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
        pethoverDevLog("frontend.snapshot.loaded", {
          currentState: runtime.currentState,
          messages: runtime.messages,
        });
      } catch (error) {
        if (cancelled) return;
        appStore.patch({
          loadStatus: "error",
          loadError: error instanceof Error ? error.message : String(error),
        });
      }
    })();

    const win = getCurrentWebviewWindow();

    const subscribe = <T,>(
      event: string,
      handler: (payload: T) => void,
    ): void => {
      let unlistenFn: (() => void) | null = null;
      let unlistened = false;
      void win.listen<T>(event, (e) => handler(e.payload)).then((fn) => {
        if (unlistened) {
          fn();
        } else {
          unlistenFn = fn;
        }
      });
      unlistens.push(() => {
        unlistened = true;
        unlistenFn?.();
      });
    };

    subscribe<RuntimeUpdate>("pet-state-changed", (payload) => {
      pethoverDevLog("frontend.event.pet-state-changed", {
        currentState: payload.currentState,
        messages: payload.messages,
        paused: appStore.get().appState?.responsePaused ?? false,
      });
      if (appStore.get().appState?.responsePaused) {
        return;
      }
      appStore.patch({
        petState: payload.currentState.state,
        agentMessages: payload.messages,
      });
    });

    subscribe<AppState>(APP_STATE_CHANGED_EVENT, (payload) => {
      appStore.patch({ appState: payload });
    });

    subscribe<boolean>(PET_WINDOW_VISIBILITY_CHANGED_EVENT, (payload) => {
      appStore.patch({ petVisible: payload });
    });

    return () => {
      cancelled = true;
      unlistens.forEach((fn) => fn());
    };
  }, []);
}

export function useLoadState(): {
  status: AppStoreSnapshot["loadStatus"];
  error: string | null;
} {
  const status = useAppSlice((s) => s.loadStatus);
  const error = useAppSlice((s) => s.loadError);
  return useMemo(() => ({ status, error }), [status, error]);
}

export function usePetState(): PetStateId {
  return useAppSlice((s) => s.petState);
}

export function useRawAgentMessages(): AgentMessage[] {
  return useAppSlice((s) => s.agentMessages);
}

export function useAgentMessages(): AgentMessage[] {
  const messages = useAppSlice((s) => s.agentMessages);
  const dismissed = useAppSlice((s) => s.dismissedAgentMessageKeys);
  const display = useAppSlice((s) => s.appState?.agentMessageDisplay ?? "all");
  const paused = useAppSlice((s) => s.appState?.responsePaused ?? false);

  return useMemo(() => {
    if (paused) return [];
    const visible = messages.filter(
      (m) => !dismissed.has(agentMessageKey(m)),
    );
    if (display !== "latest" || visible.length === 0) return visible;
    return [
      visible.reduce((latest, m) =>
        m.updatedAtMs > latest.updatedAtMs ? m : latest,
      ),
    ];
  }, [messages, dismissed, display, paused]);
}

export function useSelectedPet(): PetSummary | null {
  return useAppSlice((s) => {
    const app = s.appState;
    if (!app) return null;
    return app.pets.find((p) => p.id === app.currentPetId) ?? app.pets[0] ?? null;
  });
}

export function usePetWindowSize(): PetWindowSize {
  return useAppSlice((s) => s.appState?.petWindowSize ?? defaultPetWindowSize);
}

export function useLocale(): "en-US" | "zh-CN" {
  return useAppSlice((s) => s.appState?.locale ?? "en-US");
}

export function useResponsePaused(): boolean {
  return useAppSlice((s) => s.appState?.responsePaused ?? false);
}

export function usePetInteractions(): PetInteractionPrefs {
  return useAppSlice(
    (s) => s.appState?.petInteractions ?? defaultPetInteractionPrefs,
  );
}

export function usePetVisible(): boolean {
  return useAppSlice((s) => s.petVisible);
}

export function useAdapters(): {
  adapters: AdapterSummary[];
  busyId: string | null;
} {
  const adapters = useAppSlice((s) => s.adapters);
  const busyId = useAppSlice((s) => s.adapterBusyId);
  return useMemo(() => ({ adapters, busyId }), [adapters, busyId]);
}

export function useCodexPets(): {
  codexPets: PetSummary[];
  busyId: string | null;
} {
  const codexPets = useAppSlice((s) => s.codexPets);
  const busyId = useAppSlice((s) => s.petBusyId);
  return useMemo(() => ({ codexPets, busyId }), [codexPets, busyId]);
}

export function useIsSelecting(): boolean {
  return useAppSlice((s) => s.isSelecting);
}

export function useAppState(): AppState | null {
  return useAppSlice((s) => s.appState);
}
