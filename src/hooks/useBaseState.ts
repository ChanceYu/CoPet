import { useEffect, useState } from "react";

import type { BaseState } from "../lib/petAnimation";

const DAZE_TO_BLINK_MS = 30_000;
const BLINK_TO_SLEEP_MS = 120_000;
const TICK_INTERVAL_MS = 1_000;

export type BaseStateInputs = {
  lastActivityAtMs: number;
};

export function useBaseState(inputs: BaseStateInputs): BaseState {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") {
        return;
      }
      setNow(Date.now());
    }, TICK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  const elapsed = Math.max(0, now - inputs.lastActivityAtMs);
  if (elapsed >= BLINK_TO_SLEEP_MS) {
    return { kind: "sleep" };
  }
  if (elapsed >= DAZE_TO_BLINK_MS) {
    return { kind: "blink" };
  }
  return { kind: "daze" };
}
