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

import { ErrorView, LoadingView } from "./components/AppShell";
import { PetContextMenu } from "./components/PetContextMenu";
import { PetSprite } from "./components/PetSprite";
import { useLayeredPetState } from "./hooks/useLayeredPetState";
import { useAppData } from "./hooks/useAppData";
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
} from "./lib/petWindowUi";
import type { PetWindowSizeSliderDragPayload } from "./lib/petWindowUi";
import { agentIconUrl } from "./lib/agentIcons";

export function PetWindow() {
  const {
    agentMessages,
    dismissAgentMessage,
    load,
    loadState,
    selectedPet,
    setResponsePaused,
  } = useAppData();
  // macOS NSPanel does not always deliver contextmenu to the webview; long-press
  // is a fallback path that opens the same menu at the press origin.
  // We require __TAURI__ to be present so this path does not activate under
  // bare Playwright (which may report a Mac UA on Apple-silicon CI hosts).
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac/i.test(navigator.userAgent) &&
    typeof (window as { __TAURI__?: unknown }).__TAURI__ !== "undefined";
  const { composed, bindInput, bindMotion, quipText, emitQuip } = useLayeredPetState({
    onLongPress: isMac ? (origin) => setMenuAnchor(origin) : undefined,
  });

  const stackRef = useRef<HTMLDivElement | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const sliderDraggingRef = useRef(false);
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

  const petWindowSize =
    loadState.status === "ready" ? loadState.data.petWindowSize : defaultPetWindowSize;
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

  const resizeToStack = () => {
    if (sliderDraggingRef.current || !stackRef.current) {
      return Promise.resolve();
    }
    const nextSize = petWindowStackContentSize(stackRef.current);
    return resizeCurrentPetWindowFromCenter(nextSize);
  };

  useEffect(() => {
    petWindowSizeRef.current = petWindowSize;
    displayedPetScaleRef.current = petScale;
  }, [petScale, petWindowSize]);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      void resizeToStack();
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [selectedPet?.id, petScale, agentMessages.length, viewportSize.height, viewportSize.width]);

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
    setMenuAnchor({ x: event.clientX, y: event.clientY });
  };

  if (loadState.status === "loading") {
    return <LoadingView />;
  }

  if (loadState.status === "error") {
    return <ErrorView message={loadState.message} onRetry={() => void load()} />;
  }

  const motionHandlers = bindMotion();
  const locale = loadState.data.locale ?? "en-US";
  const t = createTranslator(locale);
  const pauseEnabled = loadState.data.responsePaused ?? false;

  return (
    <main
      className="pet-window"
      data-tauri-drag-region
      onPointerDown={handlePointerDown}
      onContextMenu={handleContextMenu}
    >
      <div
        className="pet-window-stack"
        data-fit-pet={agentMessages.length === 0 && !quipText}
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
        {quipText ? (
          <div className="pet-interaction-quip" data-testid="pet-interaction-quip">
            {quipText}
          </div>
        ) : null}
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
      {menuAnchor ? (
        <PetContextMenu
          anchor={menuAnchor}
          pauseEnabled={pauseEnabled}
          onClose={() => setMenuAnchor(null)}
          onPet={() => emitQuip("hi")}
          onTogglePause={(next) => { void setResponsePaused(next); }}
          onOpenSettings={() => void invoke("open_settings_window")}
          onHidePet={() => void invoke("toggle_pet_window_visibility")}
          labels={{
            pet: t("contextMenuPet"),
            pauseOn: t("contextMenuPauseOn"),
            pauseOff: t("contextMenuPauseOff"),
            openSettings: t("contextMenuOpenSettings"),
            hidePet: t("contextMenuHidePet"),
          }}
        />
      ) : null}
    </main>
  );
}

function AgentMessages({
  messages,
  onDismiss,
}: {
  messages: AgentMessage[];
  onDismiss: (agentId: String) => void;
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
