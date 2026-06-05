import type { Browser, BrowserContext, Page } from "@playwright/test";
import type { PetImportPreview } from "../lib/appTypes";

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

export type SoundPackSummary = {
  id: string;
  slug: string;
  displayName: string;
  builtIn: boolean;
  sounds: PetSounds;
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
  currentSoundPackId?: string;
  locale?: "en-US" | "zh-CN";
  localePreference?: "en-US" | "zh-CN";
  pets: PetSummary[];
  soundPacks?: SoundPackSummary[];
  onboardingComplete: boolean;
  petWindowSize?: number;
  agentMessageDisplay?: "all" | "latest";
  agentMessageVisible?: boolean;
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

export type AppHarnessOptions = {
  adapters?: AdapterSummary[];
  codexPets?: PetSummary[];
  commandErrors?: Partial<Record<string, string>>;
  commandDelayMs?: Partial<Record<string, number | number[]>>;
  commandResults?: Partial<Record<string, unknown>>;
  dialogOpenPaths?: Array<string | string[] | null>;
  dialogOpenPath?: string | null;
  downloadsDir?: string | null;
  eventListenDelayMs?: number;
  importPreviews?: PetImportPreview[];
  monitor?: HarnessMonitor;
  monitorFromPointReturnsNull?: boolean;
  nativePetContextMenuError?: string;
  petVisible?: boolean;
  reducedMotion?: "reduce" | "no-preference";
  runtimeStatus?: RuntimeStatus;
  scaleFactor?: number;
  state?: AppState;
  userAgent?: string;
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

const appStateChangedEvent = "copet-app-state-changed";
const defaultHarnessUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

export const copet: PetSummary = {
  id: "copet",
  slug: "copet",
  displayName: "CoPet",
  description: "Default CoPet pet",
  frameWidth: 192,
  frameHeight: 208,
  gridColumns: 8,
  gridRows: 9,
  builtIn: true,
  spritePath: "/pets/copet/spritesheet.webp",
};

export const copetWithSounds: PetSummary = {
  ...copet,
  sounds: {
    interactionSounds: {
      click: "/pets/copet/copet/sound/click.mp3",
      doubleClick: "/pets/copet/copet/sound/surprised.mp3",
      petted: "/pets/copet/copet/sound/purr.mp3",
      pettedSlow: "/pets/copet/copet/sound/sigh.mp3",
      dragLand: "/pets/copet/copet/sound/wheee.mp3",
    },
    agentSounds: {
      thinking: "/pets/copet/copet/sound/hmm.mp3",
      editing: "/pets/copet/copet/sound/tap.mp3",
      inspecting: "/pets/copet/copet/sound/peek.mp3",
      awaitingApproval: "/pets/copet/copet/sound/wait.mp3",
      celebrating: "/pets/copet/copet/sound/yay.mp3",
      failed: "/pets/copet/copet/sound/oof.mp3",
    },
  },
};

export const copetSoundPack: SoundPackSummary = {
  id: "system:copet",
  slug: "copet",
  displayName: "CoPet",
  builtIn: true,
  sounds: {
    interactionSounds: {
      click: "/sounds/copet/click.mp3",
      doubleClick: "/sounds/copet/surprised.mp3",
      petted: "/sounds/copet/purr.mp3",
      pettedSlow: "/sounds/copet/sigh.mp3",
      dragLand: "/sounds/copet/wheee.mp3",
    },
    agentSounds: {
      thinking: "/sounds/copet/hmm.mp3",
      editing: "/sounds/copet/tap.mp3",
      inspecting: "/sounds/copet/peek.mp3",
      awaitingApproval: "/sounds/copet/wait.mp3",
      celebrating: "/sounds/copet/yay.mp3",
      failed: "/sounds/copet/oof.mp3",
    },
  },
};

export const retroSoundPack: SoundPackSummary = {
  id: "system:retro",
  slug: "retro",
  displayName: "Retro",
  builtIn: true,
  sounds: {
    interactionSounds: {
      click: "/sounds/retro/click.mp3",
      doubleClick: "/sounds/retro/powerup.mp3",
      petted: "/sounds/retro/chime.mp3",
    },
    agentSounds: {
      thinking: "/sounds/retro/think.mp3",
      editing: "/sounds/retro/edit.mp3",
      celebrating: "/sounds/retro/win.mp3",
      failed: "/sounds/retro/fail.mp3",
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

export const cursorAdapter: AdapterSummary = {
  id: "cursor",
  displayName: "Cursor",
  configPath: "/home/.cursor/hooks.json",
  installed: false,
  healthy: false,
  message: "Configuration path not created yet",
};

export const antigravityAdapter: AdapterSummary = {
  id: "antigravity",
  displayName: "Antigravity",
  configPath: "/home/.gemini/config/hooks.json",
  installed: false,
  healthy: false,
  message: "Configuration path not created yet",
};

export const copilotAdapter: AdapterSummary = {
  id: "copilot",
  displayName: "Copilot CLI",
  configPath: "/home/.copilot/hooks/copet.json",
  installed: false,
  healthy: false,
  message: "Configuration path not created yet",
};

export const piAdapter: AdapterSummary = {
  id: "pi",
  displayName: "Pi",
  configPath: "/home/.pi/agent/extensions/copet/index.ts",
  installed: false,
  healthy: false,
  message: "Configuration path not created yet",
};

export async function createAppHarness(browser: Browser, options: AppHarnessOptions = {}) {
  const context = await browser.newContext({
    reducedMotion: options.reducedMotion ?? "reduce",
    userAgent: options.userAgent ?? defaultHarnessUserAgent,
  });
  const pages: Page[] = [];
  const calls: CommandCall[] = [];
  let importSessionCounter = 0;
  let importPreviews = options.importPreviews ?? [];
  const dialogOpenPaths = [...(options.dialogOpenPaths ?? [])];
  let state: AppState = options.state ?? {
    currentPetId: copet.id,
    currentSoundPackId: copetSoundPack.id,
    locale: "en-US",
    localePreference: "en-US",
    pets: [copet],
    soundPacks: [copetSoundPack],
    onboardingComplete: false,
    petWindowSize: 40,
    agentMessageDisplay: "all",
    agentMessageVisible: true,
  };
  if (state.soundPacks === undefined) {
    state = { ...state, soundPacks: [copetSoundPack] };
  }
  if (state.currentSoundPackId === undefined) {
    state = {
      ...state,
      currentSoundPackId: state.soundPacks[0]?.id ?? "",
    };
  }
  if (state.agentMessageDisplay === undefined) {
    state = { ...state, agentMessageDisplay: "all" };
  }
  if (state.agentMessageVisible === undefined) {
    state = { ...state, agentMessageVisible: true };
  }
  if (state.petInteractions === undefined) {
    state = {
      ...state,
      petInteractions: {
        enableClickSounds: true,
        cooldownStyle: "normal",
        enableStartupAnimation: true,
      },
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
          ({ event, payload }) => window.__copetTestEmit(event, payload),
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
      "__copetInvoke",
      async (source, command: string, args: Record<string, unknown> = {}) => {
        calls.push({ command, args });
        const configuredDelayMs = options.commandDelayMs?.[command] ?? 0;
        const delayMs = Array.isArray(configuredDelayMs)
          ? (configuredDelayMs.shift() ?? 0)
          : configuredDelayMs;
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        if (options.commandErrors?.[command]) {
          throw new Error(options.commandErrors[command]);
        }
        if (
          options.commandResults &&
          Object.prototype.hasOwnProperty.call(options.commandResults, command)
        ) {
          return options.commandResults[command];
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
        if (command === "list_sound_packs") {
          return state.soundPacks ?? [];
        }
        if (command === "get_pet_window_visible") {
          return petVisible;
        }
        if (command === "run_pet_startup_window_animation") {
          return true;
        }
        if (command === "plugin:dialog|open") {
          if (dialogOpenPaths.length > 0) {
            return dialogOpenPaths.shift() ?? null;
          }
          return options.dialogOpenPath ?? null;
        }
        if (command === "get_downloads_dir") {
          return "downloadsDir" in options ? options.downloadsDir : "/Users/test/Downloads";
        }
        if (command === "create_pet_import_session") {
          return { sessionId: `session-${++importSessionCounter}` };
        }
        if (
          command === "preview_codex_pet_imports" ||
          command === "preview_pet_import_folders"
        ) {
          return { previews: importPreviews, skipped: 0, errors: [] };
        }
        if (command === "commit_pet_import_previews") {
          const previewIds = (args.previewIds as string[] | undefined) ?? [];
          const consumedPreviewIds = new Set<string>();
          const imported: PetSummary[] = [];
          const failed: Array<{ previewId: string; errorMessage: string }> = [];
          const safePreviewId = (previewId: string) =>
            previewId.length > 0 &&
            previewId !== "." &&
            previewId !== ".." &&
            /^[A-Za-z0-9_.-]+$/.test(previewId);

          for (const previewId of previewIds) {
            if (!safePreviewId(previewId)) {
              failed.push({
                previewId,
                errorMessage: "preview id is invalid",
              });
              continue;
            }

            const preview = importPreviews.find(
              (candidate) =>
                candidate.previewId === previewId && !consumedPreviewIds.has(previewId),
            );
            if (!preview) {
              failed.push({
                previewId,
                errorMessage: "preview package is no longer available",
              });
              continue;
            }

            consumedPreviewIds.add(previewId);
            imported.push(preview.summary);
          }

          if (imported.length > 0) {
            state = {
              ...state,
              pets: [
                ...state.pets.filter(
                  (pet) => !imported.some((importedPet) => importedPet.id === pet.id),
                ),
                ...imported,
              ],
            };
          }
          importPreviews = importPreviews.filter(
            (preview) => !consumedPreviewIds.has(preview.previewId),
          );
          await emitAppState();
          return { imported, failed, state };
        }
        if (command === "discard_pet_import_previews") {
          importPreviews = [];
          return null;
        }
        if (command === "plugin:event|emit" || command === "plugin:event|emit_to") {
          await Promise.all(
            pages.map((targetPage) =>
              targetPage.evaluate(
                ({ event, payload }) => window.__copetTestEmit(event, payload),
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
        if (command === "select_sound_pack") {
          state = { ...state, currentSoundPackId: args.soundPackId as string };
          await emitAppState();
          return state;
        }
        if (command === "set_pet_window_size") {
          state = { ...state, petWindowSize: Number(args.size) };
          await emitAppState();
          return state;
        }
        if (command === "set_agent_message_visible") {
          state = { ...state, agentMessageVisible: Boolean(args.visible) };
          await emitAppState();
          return state;
        }
        if (command === "toggle_pet_window_visibility") {
          petVisible = !petVisible;
          await Promise.all(
            pages.map((targetPage) =>
              targetPage.evaluate(
                ({ event, payload }) => window.__copetTestEmit(event, payload),
                {
                  event: "copet-pet-window-visibility-changed",
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
        if (command === "remove_pet") {
          state = {
            ...state,
            currentPetId: state.currentPetId === args.petId ? copet.id : state.currentPetId,
            pets: state.pets.filter((pet) => pet.id !== args.petId),
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
                    ? "CoPet hook installed"
                    : "Configuration path not created yet",
                }
              : adapter,
          );
          return { adapter: adapters.find((adapter) => adapter.id === args.adapterId) };
        }
        return null;
      },
    );

    await page.addInitScript(({ currentLabel, eventListenDelayMs }) => {
      type Listener = {
        event: string;
        handlerId: number;
        target: { kind: string; label?: string };
      };

      let nextCallbackId = 1;
      const callbacks = new Map<number, (payload: unknown) => void>();
      const listeners: Listener[] = [];

      window.__copetPlayedSoundUrls = [];
      HTMLMediaElement.prototype.play = function () {
        const rawSrc = (this as HTMLAudioElement).getAttribute("src");
        window.__copetPlayedSoundUrls.push(
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
            if (eventListenDelayMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, eventListenDelayMs));
            }
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
            return window.__copetInvoke(command, args);
          }
          if (command === "plugin:window|get_all_windows") {
            return ["pet", "settings"];
          }
          return window.__copetInvoke(command, args);
        },
      };
      window.__copetTestListenerCount = (event: string) =>
        listeners.filter((listener) => listener.event === event).length;
      window.__copetTestEmit = (event: string, payload: unknown) => {
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
    }, { currentLabel: label, eventListenDelayMs: options.eventListenDelayMs ?? 0 });

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
      ({ event, payload: data }) => window.__copetTestEmit(event, data),
      { event: "pet-state-changed", payload },
    );
  }

  async function playedSoundUrls(page: Page) {
    return page.evaluate(() => window.__copetPlayedSoundUrls);
  }

  async function clearPlayedSoundUrls(page: Page) {
    await page.evaluate(() => {
      window.__copetPlayedSoundUrls = [];
    });
  }

  return {
    calls,
    context,
    clearPlayedSoundUrls,
    emitPetContextMenuAction: async (
      action: "toggleMessages" | "openSettings" | "hidePet",
    ) => {
      await Promise.all(
        pages.map((targetPage) =>
          targetPage.evaluate(
            ({ event, payload }) => window.__copetTestEmit(event, payload),
            { event: "copet-pet-context-menu-action", payload: action },
          ),
        ),
      );
    },
    emitRuntimeUpdate,
    invocations: (command: string) => calls.filter((call) => call.command === command),
    listenerCount: (page: Page, event: string) =>
      page.evaluate((targetEvent) => window.__copetTestListenerCount(targetEvent), event),
    openPage,
    playedSoundUrls,
    setCodexPets: (nextCodexPets: PetSummary[]) => {
      codexPets = nextCodexPets;
    },
    setImportPreviews: (nextImportPreviews: PetImportPreview[]) => {
      importPreviews = nextImportPreviews;
    },
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
    __copetInvoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    __copetPlayedSoundUrls: string[];
    __copetScrolledPetIds: string[];
    __copetTestListenerCount: (event: string) => number;
    __copetTestEmit: (event: string, payload: unknown) => void;
  }
}
