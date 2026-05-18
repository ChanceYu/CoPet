import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { monitorFromPoint } from "@tauri-apps/api/window";
import type { PetWindowSize } from "./appTypes";

export const defaultPetWindowSize = 30;
export const minPetWindowSize = 1;
export const maxPetWindowSize = 100;
export const minPetScale = 0.25;
export const maxPetScale = 1;
export const minPetWindowWidth = 180;
export const maxPetWindowWidth = 270;
export const maxPetWindowHeight = 310;
export const petWindowPadding = 36;
export const petWindowSizeSliderDragEvent = "pet-window-size-slider-drag";
export const petWindowSizeSliderResizeDelayMs = 180;
export const petWindowSizeSliderDragStartDistancePx = 4;
export const refreshListMinimumLoadingMs = 450;
export const pointerMoveJitterThreshold = 8;
export const nativeMoveJitterThreshold = 8;

export type PetWindowSizeSliderDragPayload = {
  phase: "begin" | "start" | "end";
};

export type PetPackageSource = "installed" | "codex";

export function petWindowScaleFromSize(size: PetWindowSize | null | undefined) {
  const normalized = Math.min(
    maxPetWindowSize,
    Math.max(minPetWindowSize, size ?? defaultPetWindowSize),
  );
  const progress = (normalized - minPetWindowSize) / (maxPetWindowSize - minPetWindowSize);
  return minPetScale + (maxPetScale - minPetScale) * progress;
}

export function maxPetWindowLogicalDimensions() {
  return { width: maxPetWindowWidth, height: maxPetWindowHeight };
}

export function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function petWindowStackContentSize(stack: HTMLElement) {
  const rect = stack.getBoundingClientRect();
  return {
    width: Math.max(minPetWindowWidth, Math.ceil(rect.width + petWindowPadding)),
    height: Math.ceil(rect.height + petWindowPadding),
  };
}

export async function resizeCurrentPetWindowFromCenter(nextSize: { width: number; height: number }) {
  const currentWindow = getCurrentWebviewWindow();
  const [oldPosition, oldOuterSize, oldInnerSize] = await Promise.all([
    currentWindow.outerPosition(),
    currentWindow.outerSize(),
    currentWindow.innerSize(),
  ]);
  const centerX = oldPosition.x + oldOuterSize.width / 2;
  const centerY = oldPosition.y + oldOuterSize.height / 2;
  const monitor = await monitorFromPoint(centerX, centerY);
  const scaleFactor = monitor?.scaleFactor ?? (await currentWindow.scaleFactor());
  const logicalSize = new LogicalSize(nextSize.width, nextSize.height);
  const physicalInnerSize = logicalSize.toPhysical(scaleFactor);
  const physicalOuterSize = {
    height: physicalInnerSize.height + Math.max(0, oldOuterSize.height - oldInnerSize.height),
    width: physicalInnerSize.width + Math.max(0, oldOuterSize.width - oldInnerSize.width),
  };
  const monitorPosition = monitor?.position ?? new PhysicalPosition(0, 0);
  const nextPosition = new PhysicalPosition(
    Math.round(centerX - physicalOuterSize.width / 2),
    Math.round(centerY - physicalOuterSize.height / 2),
  );

  await currentWindow.setPosition(
    new PhysicalPosition(
      Math.max(monitorPosition.x - physicalOuterSize.width, nextPosition.x),
      nextPosition.y,
    ),
  );
  await currentWindow.setSize(logicalSize);
}
