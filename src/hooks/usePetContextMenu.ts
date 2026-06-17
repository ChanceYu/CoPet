import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect, useRef } from "react";

const PET_CONTEXT_MENU_ACTION_EVENT = "copet-pet-context-menu-action";

export type PetContextMenuLabels = {
  messages: string;
  openSettings: string;
  hidePet: string;
};

export type PetContextMenuAction = "toggleMessages" | "openSettings" | "hidePet";

const NATIVE_MENU_VERTICAL_GAP_PX = 4;
const NATIVE_MENU_MIN_WIDTH_PX = 148;
const NATIVE_MENU_HORIZONTAL_PADDING_PX = 48;
const NATIVE_MENU_AVERAGE_CHAR_WIDTH_PX = 7;

type UsePetContextMenuOptions = {
  labels: PetContextMenuLabels;
  onToggleMessages: () => void | Promise<void>;
  onOpenSettings: () => void | Promise<void>;
  onHidePet: () => void | Promise<void>;
  onPopupFailed: () => void;
};

function estimateNativeMenuWidth(labels: PetContextMenuLabels) {
  const longestLabelLength = Math.max(
    labels.messages.length,
    labels.openSettings.length,
    labels.hidePet.length,
  );
  return Math.max(
    NATIVE_MENU_MIN_WIDTH_PX,
    longestLabelLength * NATIVE_MENU_AVERAGE_CHAR_WIDTH_PX +
      NATIVE_MENU_HORIZONTAL_PADDING_PX,
  );
}

function petMenuPosition(anchor: HTMLElement | null, labels: PetContextMenuLabels) {
  const estimatedMenuWidth = estimateNativeMenuWidth(labels);
  if (!anchor) {
    return {
      x: window.innerWidth / 2 - estimatedMenuWidth / 2,
      y: NATIVE_MENU_VERTICAL_GAP_PX,
    };
  }

  const rect = anchor.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2 - estimatedMenuWidth / 2,
    y: rect.bottom + NATIVE_MENU_VERTICAL_GAP_PX,
  };
}

export function usePetContextMenu(options: UsePetContextMenuOptions) {
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const openMenu = useCallback(async (anchor?: HTMLElement | null) => {
    try {
      const current = optionsRef.current;
      await invoke("open_pet_context_menu", {
        labels: current.labels,
        position: petMenuPosition(anchor ?? null, current.labels),
      });
    } catch {
      optionsRef.current.onPopupFailed();
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void getCurrentWebviewWindow()
      .listen<PetContextMenuAction>(PET_CONTEXT_MENU_ACTION_EVENT, async (event) => {
        const current = optionsRef.current;
        if (event.payload === "toggleMessages") {
          await current.onToggleMessages();
        } else if (event.payload === "openSettings") {
          await current.onOpenSettings();
        } else if (event.payload === "hidePet") {
          await current.onHidePet();
        }
      })
      .then((cleanup) => {
        if (disposed) {
          cleanup();
        } else {
          unlisten = cleanup;
        }
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return { openMenu };
}
