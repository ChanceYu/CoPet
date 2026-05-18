import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { InputState } from "../lib/petAnimation";

const HAPPY_DURATION_MS = 600;
const LOOK_RESET_MS = 400;
const TILT_AFTER_HOVER_MS = 1_000;

export type InputHandlers = {
  onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => void;
  onClick: (event: ReactMouseEvent<HTMLElement>) => void;
};

export type UseInputStateResult = {
  state: InputState;
  handlers: InputHandlers;
  notifyActivity: () => void;
  lastActivityAtMs: number;
};

export function useInputState(): UseInputStateResult {
  const [state, setState] = useState<InputState>({ kind: "idle" });
  const [lastActivityAtMs, setLastActivityAtMs] = useState(() => Date.now());
  const timersRef = useRef<{ look: number | null; happy: number | null; tilt: number | null }>({
    look: null,
    happy: null,
    tilt: null,
  });

  const clearTimer = useCallback((key: "look" | "happy" | "tilt") => {
    const id = timersRef.current[key];
    if (id !== null) {
      window.clearTimeout(id);
      timersRef.current[key] = null;
    }
  }, []);

  const clearAllTimers = useCallback(() => {
    clearTimer("look");
    clearTimer("happy");
    clearTimer("tilt");
  }, [clearTimer]);

  useEffect(() => clearAllTimers, [clearAllTimers]);

  const notifyActivity = useCallback(() => {
    setLastActivityAtMs(Date.now());
  }, []);

  const onPointerEnter = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const direction: "left" | "right" = event.clientX > centerX ? "right" : "left";
      clearTimer("look");
      clearTimer("tilt");
      setState({ kind: "looking", direction });
      notifyActivity();
      timersRef.current.tilt = window.setTimeout(() => {
        timersRef.current.tilt = null;
        setState({ kind: "tilting" });
      }, TILT_AFTER_HOVER_MS);
      timersRef.current.look = window.setTimeout(() => {
        timersRef.current.look = null;
        // After look duration, only collapse if still looking (not tilting yet).
        setState((current) => (current.kind === "looking" ? current : current));
      }, LOOK_RESET_MS);
    },
    [clearTimer, notifyActivity],
  );

  const onPointerMove = useCallback(
    (_event: ReactPointerEvent<HTMLElement>) => {
      // Re-arm the tilt timer when the pointer keeps moving so "tilting" only
      // fires after a full second of stillness, matching the spec.
      clearTimer("tilt");
      timersRef.current.tilt = window.setTimeout(() => {
        timersRef.current.tilt = null;
        setState({ kind: "tilting" });
      }, TILT_AFTER_HOVER_MS);
    },
    [clearTimer],
  );

  const onPointerLeave = useCallback(() => {
    clearTimer("look");
    clearTimer("tilt");
    setState((current) => (current.kind === "happy" ? current : { kind: "idle" }));
  }, [clearTimer]);

  const onClick = useCallback(
    (_event: ReactMouseEvent<HTMLElement>) => {
      clearTimer("happy");
      clearTimer("tilt");
      setState({ kind: "happy" });
      notifyActivity();
      timersRef.current.happy = window.setTimeout(() => {
        timersRef.current.happy = null;
        setState({ kind: "idle" });
      }, HAPPY_DURATION_MS);
    },
    [clearTimer, notifyActivity],
  );

  return {
    state,
    handlers: { onPointerEnter, onPointerMove, onPointerLeave, onClick },
    notifyActivity,
    lastActivityAtMs,
  };
}
