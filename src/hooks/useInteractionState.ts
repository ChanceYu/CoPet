import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { CooldownStyle } from "../lib/appTypes";
import type { InputState } from "../lib/petAnimation";
import { bumpCounter } from "../lib/petInteractionCounters";
import type { InteractionQuipPool } from "../lib/i18n";

const HAPPY_DURATION_MS = 600;
const LOOK_RESET_MS = 400;
const TILT_AFTER_HOVER_MS = 1_000;
const SURPRISED_DURATION_MS = 800;
const LONG_PRESS_THRESHOLD_MS = 800;
// Keep in sync with HEART_PETTED_SLOW_DURATION_MS in src/hooks/useEmotionState.ts.
const PETTED_SLOW_DURATION_MS = 1500;
const LONG_PRESS_MOVE_CANCEL_PX = 5;
const RAPID_CLICK_WINDOW_MS = 1500;
const RAPID_CLICK_THRESHOLD = 3;
// Keep in sync with HEART_PETTED_DURATION_MS in src/hooks/useEmotionState.ts.
const PETTED_DURATION_MS = 900;

const COOLDOWNS_MS = {
  singleClick: 600,
  doubleClick: 1500,
  petted: 3000,
  // Deliberately shorter than PETTED_SLOW_DURATION_MS (1500ms): re-entering
  // pettedSlow mid-animation just resets the existing timer — same visual effect.
  pettedSlow: 1000,
  dragLand: 600,
} as const;

const COOLDOWN_SCALE: Record<CooldownStyle, number> = {
  short: 0.6,
  normal: 1.0,
  lazy: 1.6,
};

export type InteractionHandlers = {
  onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => void;
  onClick: (event: ReactMouseEvent<HTMLElement>) => void;
  onDoubleClick: (event: ReactMouseEvent<HTMLElement>) => void;
  onPointerDownHold: (event: ReactPointerEvent<HTMLElement>) => void;
};

export type UseInteractionStateResult = {
  state: InputState;
  handlers: InteractionHandlers;
  notifyActivity: () => void;
  notifyDragLand: () => void;
  lastActivityAtMs: number;
};

export function useInteractionState(opts?: {
  onQuip?: (pool: InteractionQuipPool) => void;
  onLongPress?: (origin: { x: number; y: number }) => void;
  cooldownStyle?: CooldownStyle;
}): UseInteractionStateResult {
  const onQuipRef = useRef(opts?.onQuip);
  useEffect(() => {
    onQuipRef.current = opts?.onQuip;
  }, [opts?.onQuip]);

  const onLongPressRef = useRef(opts?.onLongPress);
  useEffect(() => {
    onLongPressRef.current = opts?.onLongPress;
  }, [opts?.onLongPress]);

  const [state, setState] = useState<InputState>({ kind: "idle" });
  const [lastActivityAtMs, setLastActivityAtMs] = useState(() => Date.now());
  const timersRef = useRef<{
    look: number | null;
    happy: number | null;
    tilt: number | null;
    surprised: number | null;
    longPress: number | null;
    pettedSlow: number | null;
    petted: number | null;
  }>({
    look: null,
    happy: null,
    tilt: null,
    surprised: null,
    longPress: null,
    pettedSlow: null,
    petted: null,
  });
  const cooldownRef = useRef<{ -readonly [K in keyof typeof COOLDOWNS_MS]: number }>({
    singleClick: 0,
    doubleClick: 0,
    petted: 0,
    pettedSlow: 0,
    dragLand: 0,
  });
  const clickHistoryRef = useRef<number[]>([]);
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);

  const isCoolingDown = useCallback((key: keyof typeof COOLDOWNS_MS): boolean => {
    return Date.now() < cooldownRef.current[key];
  }, []);

  const startCooldown = useCallback((key: keyof typeof COOLDOWNS_MS) => {
    const scale = COOLDOWN_SCALE[opts?.cooldownStyle ?? "normal"];
    cooldownRef.current[key] = Date.now() + COOLDOWNS_MS[key] * scale;
  }, [opts?.cooldownStyle]);

  const clearTimer = useCallback((key: "look" | "happy" | "tilt" | "surprised" | "longPress" | "pettedSlow" | "petted") => {
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
    clearTimer("surprised");
    clearTimer("longPress");
    clearTimer("pettedSlow");
    clearTimer("petted");
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

  const triggerSurprised = useCallback(
    (source: "click" | "drag" = "click") => {
      clearTimer("happy");
      clearTimer("surprised");
      setState({ kind: "surprised", source });
      notifyActivity();
      timersRef.current.surprised = window.setTimeout(() => {
        timersRef.current.surprised = null;
        setState({ kind: "idle" });
      }, SURPRISED_DURATION_MS);
    },
    [clearTimer, notifyActivity],
  );

  const notifyDragLand = useCallback(() => {
    if (isCoolingDown("dragLand")) return;
    startCooldown("dragLand");
    onQuipRef.current?.("wheee");
    triggerSurprised("drag");
  }, [isCoolingDown, startCooldown, triggerSurprised]);

  const onClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (event.detail >= 2) {
        // The detail=1 event that immediately preceded this double-click already
        // appended a stale timestamp; clear it so the next legitimate single
        // clicks accumulate from zero.
        clickHistoryRef.current = [];
        if (isCoolingDown("doubleClick")) return;
        startCooldown("doubleClick");
        bumpCounter("doubleClick");
        onQuipRef.current?.("surprised");
        triggerSurprised();
        return;
      }

      // Append to history BEFORE any cooldown checks — rapid-click escalation
      // requires counting all clicks even when the singleClick reaction is cooling.
      const now = Date.now();
      clickHistoryRef.current = [
        ...clickHistoryRef.current.filter((t) => now - t <= RAPID_CLICK_WINDOW_MS),
        now,
      ];

      if (clickHistoryRef.current.length >= RAPID_CLICK_THRESHOLD) {
        // Reset history regardless of cooldown so the next sequence starts fresh.
        clickHistoryRef.current = [];
        if (isCoolingDown("petted")) return;
        startCooldown("petted");
        bumpCounter("petted");
        onQuipRef.current?.("tickled");
        clearTimer("happy");
        clearTimer("petted");
        setState({ kind: "petted" });
        notifyActivity();
        timersRef.current.petted = window.setTimeout(() => {
          timersRef.current.petted = null;
          setState({ kind: "idle" });
        }, PETTED_DURATION_MS);
        return;
      }

      if (isCoolingDown("singleClick")) return;
      startCooldown("singleClick");
      bumpCounter("click");
      onQuipRef.current?.("hi");
      clearTimer("happy");
      clearTimer("tilt");
      setState({ kind: "happy" });
      notifyActivity();
      timersRef.current.happy = window.setTimeout(() => {
        timersRef.current.happy = null;
        setState({ kind: "idle" });
      }, HAPPY_DURATION_MS);
    },
    [clearTimer, isCoolingDown, notifyActivity, startCooldown, triggerSurprised],
  );

  // Defensive: real browsers fire onClick(detail>=2) before this and the
  // cooldown gate dedupes; test harnesses that dispatch only `dblclick`
  // (or future synthetic events) still need a working counter path here.
  const onDoubleClick = useCallback(
    (_event: ReactMouseEvent<HTMLElement>) => {
      if (isCoolingDown("doubleClick")) return;
      startCooldown("doubleClick");
      bumpCounter("doubleClick");
      onQuipRef.current?.("surprised");
      triggerSurprised();
    },
    [isCoolingDown, startCooldown, triggerSurprised],
  );

  const onPointerDownHold = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      clearTimer("longPress");
      pointerDownPosRef.current = { x: event.clientX, y: event.clientY };
      timersRef.current.longPress = window.setTimeout(() => {
        timersRef.current.longPress = null;
        const origin = pointerDownPosRef.current;
        pointerDownPosRef.current = null;

        if (onLongPressRef.current) {
          // Menu-fallback path (e.g. macOS): open the menu, suppress pettedSlow.
          if (origin) onLongPressRef.current(origin);
          return;
        }

        // Normal long-press petting path.
        if (isCoolingDown("pettedSlow")) return;
        startCooldown("pettedSlow");
        bumpCounter("pettedSlow");
        onQuipRef.current?.("chill");
        clearTimer("pettedSlow");
        setState({ kind: "pettedSlow" });
        notifyActivity();
        timersRef.current.pettedSlow = window.setTimeout(() => {
          timersRef.current.pettedSlow = null;
          setState({ kind: "idle" });
        }, PETTED_SLOW_DURATION_MS);
      }, LONG_PRESS_THRESHOLD_MS);
    },
    [clearTimer, isCoolingDown, notifyActivity, startCooldown],
  );

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const start = pointerDownPosRef.current;
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_CANCEL_PX) {
        clearTimer("longPress");
        pointerDownPosRef.current = null;
      }
    };
    const onUp = () => {
      pointerDownPosRef.current = null;
      clearTimer("longPress");
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [clearTimer]);

  return {
    state,
    handlers: {
      onPointerEnter,
      onPointerMove,
      onPointerLeave,
      onClick,
      onDoubleClick,
      onPointerDownHold,
    },
    notifyActivity,
    notifyDragLand,
    lastActivityAtMs,
  };
}
