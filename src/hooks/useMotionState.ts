import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { MotionState } from "../lib/petAnimation";
import {
  nativeMoveJitterThreshold,
  pointerMoveJitterThreshold,
} from "../lib/petWindowUi";

const DRAG_LAND_THRESHOLD_PX = 200;

export type MotionHandlers = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
};

export type UseMotionStateResult = {
  state: MotionState;
  handlers: MotionHandlers;
  notifyActivity: () => void;
  lastActivityAtMs: number;
};

const isWindows = /windows/i.test(navigator.userAgent);

export function useMotionState(opts?: { onDragLand?: () => void }): UseMotionStateResult {
  const [state, setState] = useState<MotionState>({ kind: "anchored" });
  const [lastActivityAtMs, setLastActivityAtMs] = useState(() => Date.now());
  const dragPointerRef = useRef<{ lastClientX: number } | null>(null);
  const nativeDragRef = useRef<{ lastX: number | null }>({ lastX: null });
  // Windows-only: programmatic drag state
  const winDragRef = useRef<{
    baseX: number;
    baseY: number;
    accumX: number;
    accumY: number;
    lastScreenX: number;
  } | null>(null);
  const dragDistanceRef = useRef(0);
  const rafRef = useRef(0);
  const onDragLandRef = useRef(opts?.onDragLand);

  useEffect(() => {
    onDragLandRef.current = opts?.onDragLand;
  }, [opts?.onDragLand]);

  const notifyActivity = useCallback(() => {
    setLastActivityAtMs(Date.now());
  }, []);

  // ── macOS: native startDragging + tauri://move listener ──
  const onPointerDownMac = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      dragPointerRef.current = { lastClientX: event.clientX };
      nativeDragRef.current = { lastX: null };
      dragDistanceRef.current = 0;
      notifyActivity();
      void getCurrentWebviewWindow().startDragging();
    },
    [notifyActivity],
  );

  // ── Windows: programmatic setPosition via rAF ──
  const onPointerDownWin = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
      void getCurrentWebviewWindow().outerPosition().then((pos) => {
        winDragRef.current = {
          baseX: pos.x,
          baseY: pos.y,
          accumX: 0,
          accumY: 0,
          lastScreenX: event.screenX,
        };
      });
      dragDistanceRef.current = 0;
      setState({ kind: "dragging", direction: "still" });
      notifyActivity();
    },
    [notifyActivity],
  );

  const onPointerDown = isWindows ? onPointerDownWin : onPointerDownMac;

  // ── macOS: pointermove for animation direction ──
  useEffect(() => {
    if (isWindows) return;

    const handlePointerMove = (event: PointerEvent) => {
      const pointer = dragPointerRef.current;
      if (!pointer) return;
      const delta = event.clientX - pointer.lastClientX;
      pointer.lastClientX = event.clientX;
      if (Math.abs(delta) < pointerMoveJitterThreshold) return;
      dragDistanceRef.current += Math.abs(delta);
      setState({ kind: "dragging", direction: delta > 0 ? "right" : "left" });
    };

    const endDrag = () => {
      const total = dragDistanceRef.current;
      dragDistanceRef.current = 0;
      dragPointerRef.current = null;
      nativeDragRef.current = { lastX: null };
      setState({ kind: "anchored" });
      if (total >= DRAG_LAND_THRESHOLD_PX) onDragLandRef.current?.();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    window.addEventListener("blur", endDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      window.removeEventListener("blur", endDrag);
    };
  }, []);

  // ── macOS: tauri://move fallback ──
  useEffect(() => {
    if (isWindows) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void getCurrentWebviewWindow()
      .listen<{ x: number; y: number }>("tauri://move", (event) => {
        if (!dragPointerRef.current) {
          nativeDragRef.current = { lastX: null };
          return;
        }
        const currentX = event.payload.x;
        const previousX = nativeDragRef.current.lastX;
        nativeDragRef.current.lastX = currentX;
        if (previousX === null) return;
        const delta = currentX - previousX;
        if (Math.abs(delta) < nativeMoveJitterThreshold) return;
        dragDistanceRef.current += Math.abs(delta);
        setState({ kind: "dragging", direction: delta > 0 ? "right" : "left" });
      })
      .then((cleanup) => {
        if (cancelled) cleanup();
        else unlisten = cleanup;
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // ── Windows: programmatic setPosition via rAF ──
  useEffect(() => {
    if (!isWindows) return;
    const win = getCurrentWebviewWindow();
    let raf = 0;

    const flush = () => {
      raf = 0;
      const drag = winDragRef.current;
      if (!drag) return;
      const ax = drag.accumX;
      const ay = drag.accumY;
      if (ax === 0 && ay === 0) return;
      drag.accumX = 0;
      drag.accumY = 0;
      drag.baseX += ax;
      drag.baseY += ay;
      void win.setPosition(new PhysicalPosition(drag.baseX, drag.baseY));
    };

    const handlePointerMove = (event: PointerEvent) => {
      const drag = winDragRef.current;
      if (!drag) return;
      const scale = window.devicePixelRatio || 1;
      drag.accumX += event.movementX * scale;
      drag.accumY += event.movementY * scale;
      const delta = event.screenX - drag.lastScreenX;
      drag.lastScreenX = event.screenX;
      dragDistanceRef.current += Math.abs(delta);
      if (Math.abs(delta) >= pointerMoveJitterThreshold) {
        setState({ kind: "dragging", direction: delta > 0 ? "right" : "left" });
      }
      if (!raf) raf = requestAnimationFrame(flush);
    };

    const endDrag = () => {
      const total = dragDistanceRef.current;
      dragDistanceRef.current = 0;
      winDragRef.current = null;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      setState({ kind: "anchored" });
      if (total >= DRAG_LAND_THRESHOLD_PX) onDragLandRef.current?.();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    window.addEventListener("blur", endDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      window.removeEventListener("blur", endDrag);
    };
  }, []);

  return {
    state,
    handlers: { onPointerDown },
    notifyActivity,
    lastActivityAtMs,
  };
}
