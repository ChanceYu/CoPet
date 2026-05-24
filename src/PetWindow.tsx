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
import { usePetStartupAnimation } from "./hooks/usePetStartupAnimation";
import {
  useAgentMessages,
  useLoadState,
  useLocale,
  useAgentMessageVisible,
  usePetInteractions,
  usePetState,
  usePetWindowSize,
  useSelectedSoundPack,
  useSelectedPet,
} from "./hooks/useAppStore";
import {
  dismissAgentMessage,
  reloadAppStore,
  setAgentMessageVisible as setAgentMessageVisibleCommand,
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
  const selectedSoundPack = useSelectedSoundPack();
  const petState = usePetState();
  const agentMessageVisible = useAgentMessageVisible();
  const petInteractions = usePetInteractions();
  const soundEnabled = petInteractions.enableClickSounds;
  const petWindowSize = usePetWindowSize();
  const locale = useLocale();
  const t = createTranslator(locale);

  const setAgentMessageVisible = async (visible: boolean) => {
    const { errorMessage } = await setAgentMessageVisibleCommand(visible);
    if (errorMessage) toast.error(errorMessage);
  };
  const { playInteractionSound, playAgentSound, stopAllSounds } = usePetSounds({
    enabled: soundEnabled,
    sounds: selectedSoundPack?.sounds,
  });
  const lastAgentSoundKeyRef = useRef<string | null>(null);
  const previousPetStateRef = useRef<string | null>(null);
  const selectedPetIdRef = useRef<string | null>(null);
  const selectedSoundPackIdRef = useRef<string | null>(null);
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
  const startup = usePetStartupAnimation({
    enabled: petInteractions.enableStartupAnimation,
    selectedPetId: selectedPet?.id ?? null,
    selectedSoundPackId: selectedSoundPack?.id ?? null,
    onInteractionSound: playInteractionSound,
    onAgentSound: playAgentSound,
  });
  const displayedAgentMessages = startup.hideMessages ? [] : agentMessages;
  const displayedComposed = startup.composedOverride ?? composed;

  const stackRef = useRef<HTMLDivElement | null>(null);
  const sliderDraggingRef = useRef(false);
  const initialContentResizePendingRef = useRef(true);
  const initialContentResizeReleaseTimerRef = useRef<number | null>(null);
  const startupHadOverrideRef = useRef(false);
  if (startup.hideMessages) {
    // Capture the fact that the startup slide-in actually ran (vs. the
    // disabled / reduced-motion paths that go straight to complete). We use
    // this below to skip the first reset-position resize, which would
    // otherwise teleport the pet leftward when the stack grows to include
    // agent messages.
    startupHadOverrideRef.current = true;
  }
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
      messages: agentMessageVisible
        ? t("contextMenuHideMessages")
        : t("contextMenuShowMessages"),
      openSettings: t("contextMenuOpenSettings"),
      hidePet: t("contextMenuHidePet"),
    },
    onToggleMessages: () => {
      void setAgentMessageVisible(!agentMessageVisible);
    },
    onOpenSettings: () => invoke("open_settings_window"),
    onHidePet: () => invoke("toggle_pet_window_visibility"),
    onPopupFailed: notifyFailed,
  });
  const configuredPetScale = petWindowScaleFromSize(petWindowSize);
  const fitPetScale =
    selectedPet && displayedAgentMessages.length === 0
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

  useEffect(() => {
    petWindowSizeRef.current = petWindowSize;
    displayedPetScaleRef.current = petScale;
  }, [petScale, petWindowSize]);

  useEffect(() => {
    const selectedPetId = selectedPet?.id ?? null;
    const previousPetId = selectedPetIdRef.current;
    const selectedPetChanged = previousPetId !== selectedPetId;
    // Only the "was a real id, is now a different real id" transition counts
    // as a user-driven switch. The initial null → ready transition is just
    // startup state settling; stopAllSounds() here would silence the startup
    // wheee that usePetStartupAnimation just kicked off in the effect chain
    // immediately above this one.
    const selectedPetUserSwitch =
      previousPetId !== null && selectedPetChanged;
    selectedPetIdRef.current = selectedPetId;

    const selectedSoundPackId = selectedSoundPack?.id ?? null;
    const previousSoundPackId = selectedSoundPackIdRef.current;
    const selectedSoundPackChanged = previousSoundPackId !== selectedSoundPackId;
    const selectedSoundPackUserSwitch =
      previousSoundPackId !== null && selectedSoundPackChanged;
    selectedSoundPackIdRef.current = selectedSoundPackId;

    const previousPetState = previousPetStateRef.current;
    const petStateChanged = previousPetState !== null && previousPetState !== petState;
    previousPetStateRef.current = petState;

    if (selectedPetChanged || selectedSoundPackChanged) {
      lastAgentSoundKeyRef.current = null;
      if (selectedPetUserSwitch || selectedSoundPackUserSwitch) {
        stopAllSounds();
      }
      return;
    }

    const soundKey = agentSoundKeyForPetState(petState);
    if (!soundEnabled || !agentMessageVisible || soundKey === null) {
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
  }, [
    agentMessageVisible,
    petState,
    playAgentSound,
    selectedSoundPack?.id,
    selectedPet?.id,
    soundEnabled,
    stopAllSounds,
  ]);

  useEffect(() => {
    if (startup.hideMessages) {
      return;
    }

    // Preserve the bottom-right placement the Rust slide-in landed on.
    // A reset-position resize here would setSize() to the new stack content
    // size (now including agent messages) and shift window-left to keep the
    // right edge against the monitor, visually nudging the centered pet to
    // the left. After this single skip, later resizes use the "center"
    // anchor and stay stable.
    if (
      startupHadOverrideRef.current &&
      initialContentResizePendingRef.current
    ) {
      initialContentResizePendingRef.current = false;
      startupHadOverrideRef.current = false;
      return;
    }

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
  }, [
    selectedPet?.id,
    petScale,
    displayedAgentMessages.length,
    startup.hideMessages,
    viewportSize.height,
    viewportSize.width,
  ]);

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
      <ErrorView
        message={loadState.error ?? "Unknown error"}
        onRetry={() => void reloadAppStore()}
        retryLabel={t("retry")}
      />
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
          data-fit-pet={displayedAgentMessages.length === 0}
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
          {displayedAgentMessages.length > 0 ? (
            <AgentMessages
              dismissLabel={t("dismiss")}
              messages={displayedAgentMessages}
              onDismiss={dismissAgentMessage}
            />
          ) : null}
          {selectedPet ? (
            <PetSprite
              pet={selectedPet}
              composed={displayedComposed}
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
  dismissLabel,
  messages,
  onDismiss,
}: {
  dismissLabel: string;
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
            aria-label={dismissLabel}
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
