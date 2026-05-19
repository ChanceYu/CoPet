import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect, useRef } from "react";

export const PET_CONTEXT_MENU_ACTION_EVENT = "pethover-pet-context-menu-action";

export type PetContextMenuLabels = {
  pause: string;
  openSettings: string;
  hidePet: string;
};

export type PetContextMenuAction = "togglePause" | "openSettings" | "hidePet";

type UsePetContextMenuOptions = {
  labels: PetContextMenuLabels;
  onTogglePause: () => void | Promise<void>;
  onOpenSettings: () => void | Promise<void>;
  onHidePet: () => void | Promise<void>;
  onPopupFailed: () => void;
};

export function usePetContextMenu(options: UsePetContextMenuOptions) {
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const openMenu = useCallback(async () => {
    try {
      await invoke("open_pet_context_menu", {
        labels: optionsRef.current.labels,
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
        if (event.payload === "togglePause") {
          await current.onTogglePause();
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
