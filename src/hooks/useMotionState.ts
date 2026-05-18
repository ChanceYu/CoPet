import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { MotionState } from "../lib/petAnimation";
import {
  nativeMoveJitterThreshold,
  pointerMoveJitterThreshold,
} from "../lib/petWindowUi";

export type MotionHandlers = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
};

export type UseMotionStateResult = {
  state: MotionState;
  handlers: MotionHandlers;
  notifyActivity: () => void;
  lastActivityAtMs: number;
};

export function useMotionState(): UseMotionStateResult {
  const [state, setState] = useState<MotionState>({ kind: "anchored" });
  const [lastActivityAtMs, setLastActivityAtMs] = useState(() => Date.now());
  const dragPointerRef = useRef<{ lastClientX: number } | null>(null);
  const nativeDragRef = useRef<{ lastX: number | null }>({ lastX: null });

  const notifyActivity = useCallback(() => {
    setLastActivityAtMs(Date.now());
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) {
        return;
      }
      if (event.detail >= 2) {
        return; // double-click is reserved for opening settings on the window
      }
      dragPointerRef.current = { lastClientX: event.clientX };
      nativeDragRef.current = { lastX: null };
      setState({ kind: "dragging", direction: "still" });
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
      setState({
        kind: "dragging",
        direction: delta > 0 ? "right" : "left",
      });
    };

    const endDrag = () => {
      dragPointerRef.current = null;
      nativeDragRef.current = { lastX: null };
      setState({ kind: "anchored" });
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
