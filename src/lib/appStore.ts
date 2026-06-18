import type {
  AdapterSummary,
  AgentMessage,
  AppState,
  PetStateId,
  PetSummary,
} from "./appTypes";

export type AppStoreSnapshot = {
  loadStatus: "loading" | "ready" | "error";
  loadError: string | null;

  appState: AppState | null;
  petState: PetStateId;
  agentMessages: AgentMessage[];
  petVisible: boolean;
  petVisibleLoaded: boolean;
  adapters: AdapterSummary[];
  adaptersLoaded: boolean;
  codexPets: PetSummary[];

  dismissedAgentMessageKeys: Set<string>;
  adapterBusyId: string | null;
  petBusyId: string | null;
  isSelecting: boolean;
};

const INITIAL_SNAPSHOT: AppStoreSnapshot = {
  loadStatus: "loading",
  loadError: null,
  appState: null,
  petState: "idle",
  agentMessages: [],
  petVisible: true,
  petVisibleLoaded: false,
  adapters: [],
  adaptersLoaded: false,
  codexPets: [],
  dismissedAgentMessageKeys: new Set<string>(),
  adapterBusyId: null,
  petBusyId: null,
  isSelecting: false,
};

let snapshot: AppStoreSnapshot = INITIAL_SNAPSHOT;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export const appStore = {
  get(): AppStoreSnapshot {
    return snapshot;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  patch(partial: Partial<AppStoreSnapshot>): void {
    snapshot = { ...snapshot, ...partial };
    notify();
  },
  reset(): void {
    snapshot = INITIAL_SNAPSHOT;
    notify();
  },
};

export function agentMessageKey(message: AgentMessage): string {
  return `${message.agent}:${message.updatedAtMs}:${message.text}`;
}
