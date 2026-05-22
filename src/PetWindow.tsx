import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { X } from "lucide-react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ErrorView, LoadingView } from "./components/AppShell";
import { PetSprite } from "./components/PetSprite";
import { Toaster } from "./components/ui/sonner";
import { useLayeredPetState } from "./hooks/useLayeredPetState";
import {
  useAgentMessages,
  useLoadState,
  useLocale,
  usePetInteractions,
  usePetState,
  usePetWindowSize,
  useResponsePaused,
  useSelectedPet,
} from "./hooks/useAppStore";
import {
  dismissAgentMessage,
  reloadAppStore,
  setResponsePaused as setResponsePausedCommand,
} from "./lib/appCommands";
import { usePetContextMenu } from "./hooks/usePetContextMenu";
import { agentSoundKeyForPetState, usePetSounds } from "./hooks/usePetSounds";
import { createTranslator } from "./lib/i18n";
import type { AgentMessage, PetWindowSize } from "./lib/appTypes";
import {
  defaultPetWindowSize,
  maxPetWindowLogicalDimensions,
  petWindowPadding,
  petWindowScaleFromSize,
  petWindowSizeSliderDragEvent,
  petWindowSizeSliderResizeDelayMs,
  petWindowStackContentSize,
  resizeCurrentPetWindowFromCenter,
  resizeCurrentPetWindowToResetPosition,
} from "./lib/petWindowUi";
import type { PetWindowSizeSliderDragPayload } from "./lib/petWindowUi";
import { agentIconUrl } from "./lib/agentIcons";

export function PetWindow() {
  const loadState = useLoadState();
  const agentMessages = useAgentMessages();
  const selectedPet = useSelectedPet();
  const petState = usePetState();
  const pauseEnabled = useResponsePaused();
  const petInteractions = usePetInteractions();
  const soundEnabled = petInteractions.enableClickSounds;
  const petWindowSize = usePetWindowSize();
  const locale = useLocale();
  const t = createTranslator(locale);

  const setResponsePaused = async (paused: boolean) => {
    const { errorMessage } = await setResponsePausedCommand(paused);
    if (errorMessage) toast.error(errorMessage);
  };
  const { playInteractionSound, playAgentSound, stopAllSounds } = usePetSounds({
    enabled: soundEnabled,
    sounds: selectedPet?.sounds,
  });
  const lastAgentSoundKeyRef = useRef<string | null>(null);
  const previousPetStateRef = useRef<string | null>(null);
  const reportedLoadErrorRef = useRef<string | null>(null);
  const selectedPetIdRef = useRef<string | null>(null);
  // macOS NSPanel does not always deliver contextmenu to the webview; long-press
  // is a fallback path that opens the same native menu below the pet.
  // We require __TAURI__ to be present so this path does not activate under
  // bare Playwright (which may report a Mac UA on Apple-silicon CI hosts).
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac/i.test(navigator.userAgent) &&
    typeof (window as { __TAURI__?: unknown }).__TAURI__ !== "undefined";
  const initialContentResizeAnchorReleaseMs = 250;
  const openPetContextMenuRef = useRef<() => void>(() => undefined);
  const { composed, bindInput, bindMotion, notifyFailed } = useLayeredPetState({
    onLongPress: isMac ? () => openPetContextMenuRef.current() : undefined,
    onInteractionSound: playInteractionSound,
  });

  const stackRef = useRef<HTMLDivElement | null>(null);
  const sliderDraggingRef = useRef(false);
  const initialContentResizePendingRef = useRef(true);
  const initialContentResizeReleaseTimerRef = useRef<number | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const sliderScaleReleaseTimerRef = useRef<number | null>(null);
  const petWindowSizeRef = useRef(defaultPetWindowSize);
  const displayedPetScaleRef = useRef(petWindowScaleFromSize(defaultPetWindowSize));
  const [viewportSize, setViewportSize] = useState(() => ({
    height: window.innerHeight,
    width: window.innerWidth,
  }));
  const [sliderScaleLock, setSliderScaleLock] = useState<{
    startScale: number;
    startSize: PetWindowSize;
  } | null>(null);

  const { openMenu: openPetContextMenu } = usePetContextMenu({
    labels: {
      pause: pauseEnabled ? t("contextMenuPauseOff") : t("contextMenuPauseOn"),
      openSettings: t("contextMenuOpenSettings"),
      hidePet: t("contextMenuHidePet"),
    },
    onTogglePause: () => {
      void setResponsePaused(!pauseEnabled);
    },
    onOpenSettings: () => invoke("open_settings_window"),
    onHidePet: () => invoke("toggle_pet_window_visibility"),
    onPopupFailed: notifyFailed,
  });
  const configuredPetScale = petWindowScaleFromSize(petWindowSize);
  const fitPetScale =
    selectedPet && agentMessages.length === 0
      ? Math.max(
          0.01,
          Math.min(
            configuredPetScale,
            (viewportSize.width - petWindowPadding) / selectedPet.frameWidth,
            (viewportSize.height - petWindowPadding) / selectedPet.frameHeight,
          ),
        )
      : configuredPetScale;
  const petScale =
    sliderScaleLock && petWindowSize === sliderScaleLock.startSize
      ? sliderScaleLock.startScale
      : fitPetScale;

  const resizeToStack = (anchor: "center" | "resetPosition" = "center") => {
    if (sliderDraggingRef.current || !stackRef.current) {
      return Promise.resolve();
    }
    const nextSize = petWindowStackContentSize(stackRef.current);
    return anchor === "resetPosition"
      ? resizeCurrentPetWindowToResetPosition(nextSize)
      : resizeCurrentPetWindowFromCenter(nextSize);
  };

  const petMenuAnchor = () =>
    stackRef.current?.querySelector<HTMLElement>(".pet-sprite-frame") ?? stackRef.current;

  const openPetContextMenuBelowPet = () => {
    void openPetContextMenu(petMenuAnchor());
  };

  const reportLoadError = (errorMessage: string) => {
    reportedLoadErrorRef.current = errorMessage;
    toast.error(errorMessage, { id: "pet-load-error" });
  };

  const retryLoad = async () => {
    const result = await reloadAppStore();
    if (result.errorMessage) {
      reportLoadError(result.errorMessage);
    }
  };

  useEffect(() => {
    petWindowSizeRef.current = petWindowSize;
    displayedPetScaleRef.current = petScale;
  }, [petScale, petWindowSize]);

  useEffect(() => {
    const selectedPetId = selectedPet?.id ?? null;
    const selectedPetChanged = selectedPetIdRef.current !== selectedPetId;
    selectedPetIdRef.current = selectedPetId;

    const previousPetState = previousPetStateRef.current;
    const petStateChanged = previousPetState !== null && previousPetState !== petState;
    previousPetStateRef.current = petState;

    if (selectedPetChanged) {
      lastAgentSoundKeyRef.current = null;
      stopAllSounds();
      return;
    }

    const soundKey = agentSoundKeyForPetState(petState);
    if (!soundEnabled || pauseEnabled || soundKey === null) {
      lastAgentSoundKeyRef.current = null;
      return;
    }
    if (!petStateChanged) {
      return;
    }
    if (lastAgentSoundKeyRef.current === soundKey) {
      return;
    }
    lastAgentSoundKeyRef.current = soundKey;
    playAgentSound(soundKey);
  }, [pauseEnabled, petState, playAgentSound, selectedPet?.id, soundEnabled, stopAllSounds]);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      const anchor =
        initialContentResizePendingRef.current && stackRef.current
          ? "resetPosition"
          : "center";
      if (anchor === "resetPosition" && initialContentResizeReleaseTimerRef.current === null) {
        initialContentResizeReleaseTimerRef.current = window.setTimeout(() => {
          initialContentResizePendingRef.current = false;
          initialContentResizeReleaseTimerRef.current = null;
        }, initialContentResizeAnchorReleaseMs);
      }
      void resizeToStack(anchor);
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [selectedPet?.id, petScale, agentMessages.length, viewportSize.height, viewportSize.width]);

  useEffect(() => {
    openPetContextMenuRef.current = () => {
      openPetContextMenuBelowPet();
    };
  }, [openPetContextMenu]);

  useEffect(() => {
    return () => {
      if (initialContentResizeReleaseTimerRef.current !== null) {
        window.clearTimeout(initialContentResizeReleaseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const updateViewportSize = () => {
      setViewportSize({ height: window.innerHeight, width: window.innerWidth });
    };
    window.addEventListener("resize", updateViewportSize);
    return () => window.removeEventListener("resize", updateViewportSize);
  }, []);

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

  useEffect(() => {
    let unlistenDrag: (() => void) | undefined;

    void listen<PetWindowSizeSliderDragPayload>(petWindowSizeSliderDragEvent, (event) => {
      if (event.payload.phase === "begin") {
        sliderDraggingRef.current = true;
        if (resizeTimerRef.current !== null) {
          window.clearTimeout(resizeTimerRef.current);
          resizeTimerRef.current = null;
        }
        if (sliderScaleReleaseTimerRef.current !== null) {
          window.clearTimeout(sliderScaleReleaseTimerRef.current);
          sliderScaleReleaseTimerRef.current = null;
        }
        return;
      }

      if (event.payload.phase === "start") {
        sliderDraggingRef.current = true;
        setSliderScaleLock({
          startScale: displayedPetScaleRef.current,
          startSize: petWindowSizeRef.current,
        });
        void resizeCurrentPetWindowFromCenter(maxPetWindowLogicalDimensions());
        return;
      }

      sliderDraggingRef.current = false;
      setSliderScaleLock({
        startScale: displayedPetScaleRef.current,
        startSize: petWindowSizeRef.current,
      });
      resizeTimerRef.current = window.setTimeout(() => {
        resizeTimerRef.current = null;
        void resizeToStack().finally(() => {
          sliderScaleReleaseTimerRef.current = window.setTimeout(() => {
            sliderScaleReleaseTimerRef.current = null;
            setSliderScaleLock(null);
          }, 50);
        });
      }, petWindowSizeSliderResizeDelayMs);
    }).then((cleanup) => {
      unlistenDrag = cleanup;
    });

    return () => {
      unlistenDrag?.();
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current);
      }
      if (sliderScaleReleaseTimerRef.current !== null) {
        window.clearTimeout(sliderScaleReleaseTimerRef.current);
      }
    };
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    motionHandlers.onPointerDown(event);
  };

  const handleContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    openPetContextMenuBelowPet();
  };

  if (loadState.status === "loading") {
    return <LoadingView />;
  }

  if (loadState.status === "error") {
    return (
      <>
        <ErrorView onRetry={() => void retryLoad()} />
        <Toaster position="bottom-center" />
      </>
    );
  }

  const motionHandlers = bindMotion();

  return (
    <>
      <main
        className="pet-window"
        data-tauri-drag-region
        onPointerDown={handlePointerDown}
        onContextMenu={handleContextMenu}
      >
        <div
          className="pet-window-stack"
          data-fit-pet={agentMessages.length === 0}
          ref={stackRef}
          style={
            selectedPet
              ? ({
                  "--pet-agent-message-min-width": `${Math.ceil(
                    selectedPet.frameWidth * petScale + 12,
                  )}px`,
                } as CSSProperties)
              : undefined
          }
        >
          {agentMessages.length > 0 ? (
            <AgentMessages messages={agentMessages} onDismiss={dismissAgentMessage} />
          ) : null}
          {selectedPet ? (
            <PetSprite
              pet={selectedPet}
              composed={composed}
              scale={petScale}
              inputHandlers={bindInput()}
            />
          ) : null}
        </div>
      </main>
      <Toaster position="bottom-center" />
    </>
  );
}

function AgentMessages({
  messages,
  onDismiss,
}: {
  messages: AgentMessage[];
  onDismiss: (agentId: string) => void;
}) {
  return (
    <div className="pet-agent-messages" data-testid="pet-agent-messages">
      {messages.map((message) => {
        const iconUrl = agentIconUrl(message.agent);
        return (
        <div
          className="pet-agent-message"
          data-testid="pet-agent-message"
          key={`${message.agent}:${message.updatedAtMs}:${message.text}`}
        >
          {iconUrl ? (
            <img
              alt={message.displayName}
              className="pet-agent-icon"
              src={iconUrl}
            />
          ) : null}
          <span className="pet-agent-text">{message.text}</span>
          <button
            aria-label="Dismiss"
            className="pet-agent-message-dismiss"
            onClick={(event) => {
              event.stopPropagation();
              onDismiss(message.agent);
            }}
            type="button"
          >
            <X aria-hidden="true" />
          </button>
        </div>
        );
      })}
    </div>
  );
}
