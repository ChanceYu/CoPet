import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import {
  agentMessageKey,
  appStore,
  type AppStoreSnapshot,
} from "../lib/appStore";
import { shouldApplyIncomingAppState } from "../lib/appStateGuards";
import type {
  AdapterSummary,
  AgentMessage,
  AppState,
  SoundPackSummary,
  PetInteractionPrefs,
  PetStateId,
  PetSummary,
  PetWindowSize,
  RuntimeStatus,
  RuntimeUpdate,
} from "../lib/appTypes";
import { defaultPetInteractionPrefs } from "../lib/appTypes";
import { defaultPetWindowSize } from "../lib/petWindowUi";
import { copetDevLog } from "../lib/devLogger";

const APP_STATE_CHANGED_EVENT = "copet-app-state-changed";
const PET_WINDOW_VISIBILITY_CHANGED_EVENT = "copet-pet-window-visibility-changed";

let adaptersLoadPromise: Promise<void> | null = null;
let petVisibleLoadPromise: Promise<void> | null = null;

type IdleCallback = (deadline: {
  didTimeout: boolean;
  timeRemaining: () => number;
}) => void;

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: IdleCallback,
    options?: { timeout?: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function scheduleAfterFirstPaint(callback: () => void): () => void {
  let cancelled = false;
  let firstFrameId: number | null = null;
  let secondFrameId: number | null = null;
  let timerId: number | null = null;
  let idleId: number | null = null;

  const run = () => {
    if (!cancelled) {
      callback();
    }
  };

  firstFrameId = window.requestAnimationFrame(() => {
    firstFrameId = null;
    secondFrameId = window.requestAnimationFrame(() => {
      secondFrameId = null;
      const idleWindow = window as IdleWindow;
      if (typeof idleWindow.requestIdleCallback === "function") {
        idleId = idleWindow.requestIdleCallback(run, { timeout: 500 });
      } else {
        timerId = window.setTimeout(run, 0);
      }
    });
  });

  return () => {
    cancelled = true;
    if (firstFrameId !== null) {
      window.cancelAnimationFrame(firstFrameId);
    }
    if (secondFrameId !== null) {
      window.cancelAnimationFrame(secondFrameId);
    }
    if (timerId !== null) {
      window.clearTimeout(timerId);
    }
    if (idleId !== null) {
      (window as IdleWindow).cancelIdleCallback?.(idleId);
    }
  };
}

function loadAdaptersOnce(): Promise<void> {
  if (appStore.get().adaptersLoaded) {
    return Promise.resolve();
  }
  if (adaptersLoadPromise) {
    return adaptersLoadPromise;
  }

  adaptersLoadPromise = invoke<AdapterSummary[]>("list_agent_adapters")
    .then((adapters) => {
      appStore.patch({ adapters, adaptersLoaded: true });
    })
    .catch(() => {
      // Retry the next time the Agents section is activated.
    })
    .finally(() => {
      adaptersLoadPromise = null;
    });

  return adaptersLoadPromise;
}

function loadPetVisibleOnce(): Promise<void> {
  if (appStore.get().petVisibleLoaded) {
    return Promise.resolve();
  }
  if (petVisibleLoadPromise) {
    return petVisibleLoadPromise;
  }

  petVisibleLoadPromise = invoke<boolean>("get_pet_window_visible")
    .then((petVisible) => {
      appStore.patch({ petVisible, petVisibleLoaded: true });
    })
    .catch(() => {
      // Retry the next time Preferences is activated.
    })
    .finally(() => {
      petVisibleLoadPromise = null;
    });

  return petVisibleLoadPromise;
}

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
        const [app, runtime] = await Promise.all([
          invoke<AppState>("get_app_state"),
          invoke<RuntimeStatus>("get_runtime_status"),
        ]);
        if (cancelled) return;
        appStore.patch({
          loadStatus: "ready",
          loadError: null,
          appState: app,
          petState: runtime.currentState.state,
          agentMessages: runtime.messages,
        });
        copetDevLog("frontend.snapshot.loaded", {
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
      copetDevLog("frontend.event.pet-state-changed", {
        currentState: payload.currentState,
        messages: payload.messages,
        agentMessageVisible: appStore.get().appState?.agentMessageVisible ?? true,
      });
      appStore.patch({
        petState: payload.currentState.state,
        agentMessages: payload.messages,
      });
    });

    subscribe<AppState>(APP_STATE_CHANGED_EVENT, (payload) => {
      if (!shouldApplyIncomingAppState(payload)) {
        return;
      }
      appStore.patch({ appState: payload });
    });

    subscribe<boolean>(PET_WINDOW_VISIBILITY_CHANGED_EVENT, (payload) => {
      appStore.patch({ petVisible: payload, petVisibleLoaded: true });
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

export function useAgentMessages(): AgentMessage[] {
  const messages = useAppSlice((s) => s.agentMessages);
  const dismissed = useAppSlice((s) => s.dismissedAgentMessageKeys);
  const display = useAppSlice((s) => s.appState?.agentMessageDisplay ?? "all");
  const agentMessageVisible = useAppSlice(
    (s) => s.appState?.agentMessageVisible ?? true,
  );

  return useMemo(() => {
    if (!agentMessageVisible) return [];
    const visible = messages.filter(
      (m) => !dismissed.has(agentMessageKey(m)),
    );
    if (display !== "latest" || visible.length === 0) return visible;
    return [
      visible.reduce((latest, m) =>
        m.updatedAtMs > latest.updatedAtMs ? m : latest,
      ),
    ];
  }, [messages, dismissed, display, agentMessageVisible]);
}

export function useSelectedPet(): PetSummary | null {
  return useAppSlice((s) => {
    const app = s.appState;
    if (!app) return null;
    return app.pets.find((p) => p.id === app.currentPetId) ?? app.pets[0] ?? null;
  });
}

export function useSelectedSoundPack(): SoundPackSummary | null {
  return useAppSlice((s) => {
    const app = s.appState;
    if (!app) return null;
    const soundPacks = app.soundPacks ?? [];
    const currentSoundPackId = app.currentSoundPackId ?? "";
    return (
      soundPacks.find((pack) => pack.id === currentSoundPackId) ??
      soundPacks[0] ??
      null
    );
  });
}

export function usePetWindowSize(): PetWindowSize {
  return useAppSlice((s) => s.appState?.petWindowSize ?? defaultPetWindowSize);
}

export function useLocale(): "en-US" | "zh-CN" {
  return useAppSlice((s) => s.appState?.locale ?? "en-US");
}

export function useAgentMessageVisible(): boolean {
  return useAppSlice((s) => s.appState?.agentMessageVisible ?? true);
}

export function usePetInteractions(): PetInteractionPrefs {
  return useAppSlice(
    (s) => s.appState?.petInteractions ?? defaultPetInteractionPrefs,
  );
}

export function usePetVisible(enabled = false): boolean {
  const petVisible = useAppSlice((s) => s.petVisible);
  const petVisibleLoaded = useAppSlice((s) => s.petVisibleLoaded);
  useEffect(() => {
    if (!enabled || petVisibleLoaded) return;
    void loadPetVisibleOnce();
  }, [enabled, petVisibleLoaded]);
  return petVisible;
}

export function useAdapters(enabled = false): {
  adapters: AdapterSummary[];
  busyId: string | null;
} {
  const adapters = useAppSlice((s) => s.adapters);
  const adaptersLoaded = useAppSlice((s) => s.adaptersLoaded);
  const busyId = useAppSlice((s) => s.adapterBusyId);
  useEffect(() => {
    if (!enabled || adaptersLoaded) return;
    void loadAdaptersOnce();
  }, [enabled, adaptersLoaded]);
  return useMemo(() => ({ adapters, busyId }), [adapters, busyId]);
}

export function useDeferredAdaptersWarmup(enabled = false): void {
  const adaptersLoaded = useAppSlice((s) => s.adaptersLoaded);
  useEffect(() => {
    if (!enabled || adaptersLoaded) return;
    return scheduleAfterFirstPaint(() => {
      void loadAdaptersOnce();
    });
  }, [enabled, adaptersLoaded]);
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
