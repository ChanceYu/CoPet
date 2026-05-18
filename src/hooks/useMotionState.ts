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

export function useMotionState(opts?: { onDragLand?: () => void }): UseMotionStateResult {
  const [state, setState] = useState<MotionState>({ kind: "anchored" });
  const [lastActivityAtMs, setLastActivityAtMs] = useState(() => Date.now());
  const dragPointerRef = useRef<{ lastClientX: number } | null>(null);
  const nativeDragRef = useRef<{ lastX: number | null }>({ lastX: null });
  const dragDistanceRef = useRef(0);
  const onDragLandRef = useRef(opts?.onDragLand);

  useEffect(() => {
    onDragLandRef.current = opts?.onDragLand;
  }, [opts?.onDragLand]);

  const notifyActivity = useCallback(() => {
    setLastActivityAtMs(Date.now());
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) {
        return;
      }
      dragPointerRef.current = { lastClientX: event.clientX };
      nativeDragRef.current = { lastX: null };
      dragDistanceRef.current = 0;
      notifyActivity();
      void getCurrentWebviewWindow().startDragging();
    },
    [notifyActivity],
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const pointer = dragPointerRef.current;
      if (!pointer) {
        return;
      }
      const delta = event.clientX - pointer.lastClientX;
      pointer.lastClientX = event.clientX;
      if (Math.abs(delta) < pointerMoveJitterThreshold) {
        return;
      }
      dragDistanceRef.current += Math.abs(delta);
      setState({
        kind: "dragging",
        direction: delta > 0 ? "right" : "left",
      });
    };

    const endDrag = () => {
      const total = dragDistanceRef.current;
      dragDistanceRef.current = 0;
      dragPointerRef.current = null;
      nativeDragRef.current = { lastX: null };
      setState({ kind: "anchored" });
      if (total >= DRAG_LAND_THRESHOLD_PX) {
        onDragLandRef.current?.();
      }
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

  useEffect(() => {
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
        if (previousX === null) {
          return;
        }
        const delta = currentX - previousX;
        if (Math.abs(delta) < nativeMoveJitterThreshold) {
          return;
        }
        dragDistanceRef.current += Math.abs(delta);
        setState({
          kind: "dragging",
          direction: delta > 0 ? "right" : "left",
        });
      })
      .then((cleanup) => {
        if (cancelled) {
          cleanup();
        } else {
          unlisten = cleanup;
        }
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return {
    state,
    handlers: { onPointerDown },
    notifyActivity,
    lastActivityAtMs,
  };
}
