import type { Browser, BrowserContext, Page } from "@playwright/test";

export type PetSummary = {
  id: string;
  slug: string;
  displayName: string;
  description: string;
  frameWidth: number;
  frameHeight: number;
  gridColumns: number;
  gridRows: number;
  builtIn: boolean;
  spritePath: string;
  sounds?: PetSounds;
};

export type PetInteractionSounds = {
  click?: string;
  doubleClick?: string;
  petted?: string;
  pettedSlow?: string;
  dragLand?: string;
};

export type PetAgentSounds = {
  thinking?: string;
  editing?: string;
  inspecting?: string;
  awaitingApproval?: string;
  celebrating?: string;
  failed?: string;
};

export type PetSounds = {
  interactionSounds?: PetInteractionSounds;
  agentSounds?: PetAgentSounds;
};

export type PetInteractionPrefs = {
  enableClickSounds: boolean;
  cooldownStyle: "short" | "normal" | "lazy";
};

export type AppState = {
  currentPetId: string;
  locale?: "en-US" | "zh-CN";
  localePreference?: "system" | "en-US" | "zh-CN";
  pets: PetSummary[];
  onboardingComplete: boolean;
  petWindowSize?: number;
  agentMessageDisplay?: "all" | "latest";
  responsePaused?: boolean;
  petInteractions?: PetInteractionPrefs;
};

export type AdapterSummary = {
  id: string;
  displayName: string;
  configPath: string;
  installed: boolean;
  healthy: boolean;
  message: string;
};

type RuntimeStatus = {
  port: number;
  endpoint: string;
  currentState: { state: string; sinceMs: number; idleAfterMs: number | null };
  messages: AgentMessage[];
  acceptedEvents: number;
  rejectedEvents: number;
};

type AgentMessage = {
  agent: string;
  displayName: string;
  text: string;
  updatedAtMs: number;
};

export type CommandCall = {
  command: string;
  args?: Record<string, unknown>;
};

type HarnessOptions = {
  adapters?: AdapterSummary[];
  codexPets?: PetSummary[];
  commandErrors?: Partial<Record<string, string>>;
  commandDelayMs?: Partial<Record<string, number>>;
  dialogOpenPath?: string | null;
  monitor?: HarnessMonitor;
  monitorFromPointReturnsNull?: boolean;
  nativePetContextMenuError?: string;
  petVisible?: boolean;
  runtimeStatus?: RuntimeStatus;
  scaleFactor?: number;
  state?: AppState;
  windowPositions?: Partial<Record<"pet" | "settings", { x: number; y: number }>>;
  windowSizes?: Partial<Record<"pet" | "settings", { height: number; width: number }>>;
};

type HarnessMonitor = {
  name: string;
  position: { x: number; y: number };
  scaleFactor: number;
  size: { height: number; width: number };
  workArea: {
    position: { x: number; y: number };
    size: { height: number; width: number };
  };
};

const appStateChangedEvent = "pethover-app-state-changed";

export const pethover: PetSummary = {
  id: "pethover",
  slug: "pethover",
  displayName: "PetHover",
  description: "Default PetHover pet",
  frameWidth: 192,
  frameHeight: 208,
  gridColumns: 8,
  gridRows: 9,
  builtIn: true,
  spritePath: "/pets/pethover/spritesheet.webp",
};

export const pethoverWithSounds: PetSummary = {
  ...pethover,
  sounds: {
    interactionSounds: {
      click: "/pets/pethover/pethover/audio/click.mp3",
      doubleClick: "/pets/pethover/pethover/audio/surprised.mp3",
      petted: "/pets/pethover/pethover/audio/purr.mp3",
      pettedSlow: "/pets/pethover/pethover/audio/sigh.mp3",
      dragLand: "/pets/pethover/pethover/audio/wheee.mp3",
    },
    agentSounds: {
      thinking: "/pets/pethover/pethover/audio/hmm.mp3",
      editing: "/pets/pethover/pethover/audio/tap.mp3",
      inspecting: "/pets/pethover/pethover/audio/peek.mp3",
      awaitingApproval: "/pets/pethover/pethover/audio/wait.mp3",
      celebrating: "/pets/pethover/pethover/audio/yay.mp3",
      failed: "/pets/pethover/pethover/audio/oof.mp3",
    },
  },
};

export const goku: PetSummary = {
  id: "goku",
  slug: "goku",
  displayName: "Goku",
  description: "Compact martial arts pet",
  frameWidth: 192,
  frameHeight: 208,
  gridColumns: 8,
  gridRows: 9,
  builtIn: false,
  spritePath: "/pets/goku/spritesheet.webp",
};

export const nebula: PetSummary = {
  id: "nebula",
  slug: "nebula",
  displayName: "Nebula",
  description: "A compact stellar companion.",
  frameWidth: 192,
  frameHeight: 208,
  gridColumns: 8,
  gridRows: 9,
  builtIn: false,
  spritePath: "/pets/nebula/spritesheet.webp",
};

export const codexAdapter: AdapterSummary = {
  id: "codex",
  displayName: "Codex",
  configPath: "/home/.codex/hooks.json",
  installed: false,
  healthy: false,
  message: "Configuration path not created yet",
};

export async function createAppHarness(browser: Browser, options: HarnessOptions = {}) {
  const context = await browser.newContext();
  const pages: Page[] = [];
  const calls: CommandCall[] = [];
  let state: AppState = options.state ?? {
    currentPetId: pethover.id,
    locale: "en-US",
    localePreference: "system",
    pets: [pethover],
    onboardingComplete: false,
    petWindowSize: 30,
    agentMessageDisplay: "latest",
    responsePaused: false,
  };
  if (state.agentMessageDisplay === undefined) {
    state = { ...state, agentMessageDisplay: "latest" };
  }
  if (state.responsePaused === undefined) {
    state = { ...state, responsePaused: false };
  }
  if (state.petInteractions === undefined) {
    state = {
      ...state,
      petInteractions: { enableClickSounds: false, cooldownStyle: "normal" },
    };
  }
  let adapters = options.adapters ?? [];
  let codexPets = options.codexPets ?? [];
  let petVisible = options.petVisible ?? true;
  const scaleFactor = options.scaleFactor ?? 1;
  const monitor =
    options.monitor ??
    ({
      name: "Test Monitor",
      position: { x: 0, y: 0 },
      scaleFactor,
      size: { width: 2560, height: 1440 },
      workArea: {
        position: { x: 0, y: 0 },
        size: { width: 2560, height: 1440 },
      },
    } satisfies HarnessMonitor);
  const windowPositions = new Map<string, { x: number; y: number }>();
  const runtimeStatus =
    options.runtimeStatus ??
    ({
      port: 8765,
      endpoint: "http://127.0.0.1:8765/v1/events",
      currentState: { state: "idle", sinceMs: 0, idleAfterMs: null },
      messages: [],
      acceptedEvents: 0,
      rejectedEvents: 0,
    } satisfies RuntimeStatus);

  async function emitAppState() {
    await Promise.all(
      pages.map((targetPage) =>
        targetPage.evaluate(
          ({ event, payload }) => window.__pethoverTestEmit(event, payload),
          { event: appStateChangedEvent, payload: state },
        ),
      ),
    );
  }

  async function openPage(label: "pet" | "settings") {
    const page = await context.newPage();
    if (options.windowSizes?.[label]) {
      await page.setViewportSize(options.windowSizes[label]);
    }
    pages.push(page);
    windowPositions.set(
      label,
      windowPositions.get(label) ?? options.windowPositions?.[label] ?? { x: 100, y: 80 },
    );

    await page.exposeBinding(
      "__pethoverInvoke",
      async (source, command: string, args: Record<string, unknown> = {}) => {
        calls.push({ command, args });
        const delayMs = options.commandDelayMs?.[command] ?? 0;
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        if (options.commandErrors?.[command]) {
          throw new Error(options.commandErrors[command]);
        }
        if (command === "open_pet_context_menu") {
          if (options.nativePetContextMenuError) {
            throw new Error(options.nativePetContextMenuError);
          }
          return null;
        }

        if (command === "get_app_state") {
          return state;
        }
        if (command === "get_runtime_status") {
          return runtimeStatus;
        }
        if (command === "list_agent_adapters") {
          return adapters;
        }
        if (command === "list_codex_pets") {
          return codexPets;
        }
        if (command === "get_pet_window_visible") {
          return petVisible;
        }
        if (command === "plugin:dialog|open") {
          return options.dialogOpenPath ?? null;
        }
        if (command === "plugin:event|emit" || command === "plugin:event|emit_to") {
          await Promise.all(
            pages.map((targetPage) =>
              targetPage.evaluate(
                ({ event, payload }) => window.__pethoverTestEmit(event, payload),
                { event: args.event as string, payload: args.payload },
              ),
            ),
          );
          return null;
        }
        if (command === "plugin:window|outer_position") {
          return windowPositions.get(label) ?? { x: 100, y: 80 };
        }
        if (command === "plugin:window|outer_size") {
          const viewport = source.page.viewportSize() ?? { width: 1280, height: 720 };
          return {
            width: Math.ceil(viewport.width * scaleFactor),
            height: Math.ceil(viewport.height * scaleFactor),
          };
        }
        if (command === "plugin:window|inner_size") {
          const viewport = source.page.viewportSize() ?? { width: 1280, height: 720 };
          return {
            width: Math.ceil(viewport.width * scaleFactor),
            height: Math.ceil(viewport.height * scaleFactor),
          };
        }
        if (command === "plugin:window|scale_factor") {
          return scaleFactor;
        }
        if (command === "plugin:window|monitor_from_point") {
          if (options.monitorFromPointReturnsNull) {
            return null;
          }
          return monitor;
        }
        if (command === "plugin:window|current_monitor") {
          return monitor;
        }
        if (command === "plugin:window|set_position") {
          const rawValue = args.value as
            | {
                Physical?: { x: number; y: number };
                position?: { type: string; x: number; y: number };
                toJSON?: () => unknown;
              }
            | undefined;
          const value = (rawValue?.position?.type === "Physical"
            ? { Physical: { x: rawValue.position.x, y: rawValue.position.y } }
            : typeof rawValue?.toJSON === "function"
              ? rawValue.toJSON()
              : rawValue) as { Physical?: { x: number; y: number } } | undefined;
          if (value?.Physical) {
            windowPositions.set(label, {
              x: value.Physical.x,
              y: value.Physical.y,
            });
          }
          return null;
        }
        if (command === "plugin:window|set_size") {
          const rawValue = args.value as
            | {
                Logical?: { width: number; height: number };
                size?: { type: string; width: number; height: number };
                toJSON?: () => unknown;
              }
            | undefined;
          const value = (rawValue?.size?.type === "Logical"
            ? { Logical: { width: rawValue.size.width, height: rawValue.size.height } }
            : typeof rawValue?.toJSON === "function"
              ? rawValue.toJSON()
              : rawValue
          ) as { Logical?: { width: number; height: number } } | undefined;
          if (value?.Logical) {
            await source.page.setViewportSize({
              width: Math.ceil(value.Logical.width),
              height: Math.ceil(value.Logical.height),
            });
          }
          return null;
        }
        if (command === "select_pet") {
          state = { ...state, currentPetId: args.petId as string };
          await emitAppState();
          return state;
        }
        if (command === "set_pet_window_size") {
          state = { ...state, petWindowSize: Number(args.size) };
          await emitAppState();
          return state;
        }
        if (command === "set_response_paused") {
          state = { ...state, responsePaused: Boolean(args.paused) };
          await emitAppState();
          return state;
        }
        if (command === "toggle_pet_window_visibility") {
          petVisible = !petVisible;
          await Promise.all(
            pages.map((targetPage) =>
              targetPage.evaluate(
                ({ event, payload }) => window.__pethoverTestEmit(event, payload),
                {
                  event: "pethover-pet-window-visibility-changed",
                  payload: petVisible,
                },
              ),
            ),
          );
          return petVisible;
        }
        if (command === "set_pet_interactions") {
          state = { ...state, petInteractions: args.prefs as PetInteractionPrefs };
          await emitAppState();
          return state;
        }
        if (command === "set_locale_preference") {
          const localePreference = args.localePreference as AppState["localePreference"];
          const locale = localePreference === "zh-CN" ? "zh-CN" : "en-US";
          state = { ...state, locale, localePreference };
          await emitAppState();
          return state;
        }
        if (command === "set_agent_message_display") {
          state = {
            ...state,
            agentMessageDisplay: args.agentMessageDisplay as AppState["agentMessageDisplay"],
          };
          await emitAppState();
          return state;
        }
        if (command === "install_codex_pet") {
          const pet = codexPets.find((item) => item.id === args.petId);
          if (pet && !state.pets.some((item) => item.id === pet.id)) {
            state = { ...state, pets: [...state.pets, pet], currentPetId: pet.id };
          } else if (pet) {
            state = { ...state, currentPetId: pet.id };
          }
          await emitAppState();
          return state;
        }
        if (command === "remove_pet") {
          state = {
            ...state,
            currentPetId: state.currentPetId === args.petId ? pethover.id : state.currentPetId,
            pets: state.pets.filter((pet) => pet.id !== args.petId),
          };
          await emitAppState();
          return state;
        }
        if (command === "import_pet_files") {
          const manifest = JSON.parse(args.manifestJson as string) as Partial<PetSummary>;
          const pet = {
            id: manifest.id ?? "local-pet",
            slug: manifest.slug ?? manifest.id ?? "local-pet",
            displayName: manifest.displayName ?? "Local Pet",
            description: manifest.description ?? "",
            frameWidth: manifest.frameWidth ?? 192,
            frameHeight: manifest.frameHeight ?? 208,
            gridColumns: manifest.gridColumns ?? 8,
            gridRows: manifest.gridRows ?? 9,
            builtIn: false,
            spritePath: `/imported/${manifest.id}/${args.spriteFileName as string}`,
          };
          state = {
            ...state,
            currentPetId: pet.id,
            pets: [...state.pets.filter((item) => item.id !== pet.id), pet],
          };
          await emitAppState();
          return state;
        }
        if (command === "import_pet_folder") {
          const pet = {
            ...goku,
            id: "dialog-pet",
            slug: "dialog-pet",
            displayName: "Dialog Pet",
            builtIn: false,
            spritePath: `${args.folderPath as string}/spritesheet.webp`,
          };
          state = {
            ...state,
            currentPetId: pet.id,
            pets: [...state.pets.filter((item) => item.id !== pet.id), pet],
          };
          await emitAppState();
          return state;
        }
        if (
          command === "install_agent_adapter" ||
          command === "repair_agent_adapter" ||
          command === "uninstall_agent_adapter"
        ) {
          const installed = command !== "uninstall_agent_adapter";
          adapters = adapters.map((adapter) =>
            adapter.id === args.adapterId
              ? {
                  ...adapter,
                  installed,
                  healthy: installed,
                  message: installed
                    ? "PetHover hook installed"
                    : "Configuration path not created yet",
                }
              : adapter,
          );
          return { adapter: adapters.find((adapter) => adapter.id === args.adapterId) };
        }
        return null;
      },
    );

    await page.addInitScript((currentLabel) => {
      type Listener = {
        event: string;
        handlerId: number;
        target: { kind: string; label?: string };
      };

      let nextCallbackId = 1;
      const callbacks = new Map<number, (payload: unknown) => void>();
      const listeners: Listener[] = [];

      window.__pethoverPlayedAudioUrls = [];
      HTMLMediaElement.prototype.play = function () {
        const rawSrc = (this as HTMLAudioElement).getAttribute("src");
        window.__pethoverPlayedAudioUrls.push(
          rawSrc || (this as HTMLAudioElement).currentSrc || (this as HTMLAudioElement).src,
        );
        return Promise.resolve();
      };
      HTMLMediaElement.prototype.pause = function () {
        return undefined;
      };

      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
        unregisterListener: (_event: string, eventId: number) => {
          const index = listeners.findIndex((listener) => listener.handlerId === eventId);
          if (index >= 0) {
            listeners.splice(index, 1);
          }
        },
      };
      window.__TAURI_INTERNALS__ = {
        metadata: {
          currentWindow: { label: currentLabel },
          currentWebview: { label: currentLabel },
        },
        transformCallback: (callback: (payload: unknown) => void) => {
          const id = nextCallbackId;
          nextCallbackId += 1;
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback: (id: number) => {
          callbacks.delete(id);
        },
        convertFileSrc: (filePath: string) => filePath,
        invoke: async (command: string, args: Record<string, unknown> = {}) => {
          if (command === "plugin:event|listen") {
            listeners.push({
              event: args.event as string,
              handlerId: args.handler as number,
              target: (args.target as Listener["target"]) ?? { kind: "Any" },
            });
            return args.handler;
          }
          if (command === "plugin:event|unlisten") {
            window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener(
              args.event as string,
              args.eventId as number,
            );
            return null;
          }
          if (command === "plugin:event|emit" || command === "plugin:event|emit_to") {
            return window.__pethoverInvoke(command, args);
          }
          if (command === "plugin:window|get_all_windows") {
            return ["pet", "settings"];
          }
          return window.__pethoverInvoke(command, args);
        },
      };
      window.__pethoverTestEmit = (event: string, payload: unknown) => {
        for (const listener of listeners) {
          if (listener.event !== event) {
            continue;
          }
          if (listener.target.kind !== "Any") {
            if (
              listener.target.kind !== "WebviewWindow" ||
              listener.target.label !== currentLabel
            ) {
              continue;
            }
          }
          callbacks.get(listener.handlerId)?.({
            event,
            id: listener.handlerId,
            payload,
          });
        }
      };
    }, label);

    await page.goto("/");
    return page;
  }

  async function emitRuntimeUpdate(
    page: Page,
    update: {
      currentState: { state: string; sinceMs?: number; idleAfterMs?: number | null };
      messages?: AgentMessage[];
    },
  ) {
    const payload = {
      currentState: {
        state: update.currentState.state,
        sinceMs: update.currentState.sinceMs ?? 0,
        idleAfterMs: update.currentState.idleAfterMs ?? null,
      },
      messages: update.messages ?? [],
    };
    await page.evaluate(
      ({ event, payload: data }) => window.__pethoverTestEmit(event, data),
      { event: "pet-state-changed", payload },
    );
  }

  async function playedAudioUrls(page: Page) {
    return page.evaluate(() => window.__pethoverPlayedAudioUrls);
  }

  async function clearPlayedAudioUrls(page: Page) {
    await page.evaluate(() => {
      window.__pethoverPlayedAudioUrls = [];
    });
  }

  return {
    calls,
    context,
    clearPlayedAudioUrls,
    emitPetContextMenuAction: async (
      action: "togglePause" | "openSettings" | "hidePet",
    ) => {
      await Promise.all(
        pages.map((targetPage) =>
          targetPage.evaluate(
            ({ event, payload }) => window.__pethoverTestEmit(event, payload),
            { event: "pethover-pet-context-menu-action", payload: action },
          ),
        ),
      );
    },
    emitRuntimeUpdate,
    invocations: (command: string) => calls.filter((call) => call.command === command),
    openPage,
    playedAudioUrls,
    state: () => state,
  };
}

declare global {
  interface Window {
    __TAURI_EVENT_PLUGIN_INTERNALS__: {
      unregisterListener: (event: string, eventId: number) => void;
    };
    __TAURI_INTERNALS__: {
      metadata: {
        currentWindow: { label: string };
        currentWebview: { label: string };
      };
      transformCallback: (callback: (payload: unknown) => void) => number;
      unregisterCallback: (id: number) => void;
      convertFileSrc: (filePath: string) => string;
      invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
    __pethoverInvoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    __pethoverPlayedAudioUrls: string[];
    __pethoverScrolledPetIds: string[];
    __pethoverTestEmit: (event: string, payload: unknown) => void;
  }
}
