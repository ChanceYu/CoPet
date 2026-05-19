import { useCallback, useRef, useState } from "react";

import type { InteractionQuipPool, Locale } from "../lib/i18n";
import { interactionQuipPool } from "../lib/i18n";

const QUIP_TTL_MS = 1500;

export function useInteractionQuip(locale: Locale, enabled: boolean) {
  const [text, setText] = useState<string | null>(null);
  const lastPickRef = useRef<Map<InteractionQuipPool, number>>(new Map());
  const timerRef = useRef<number | null>(null);

  const emit = useCallback(
    (pool: InteractionQuipPool) => {
      if (!enabled) return;
      const choices = interactionQuipPool(locale, pool);
      if (choices.length === 0) return;
      const last = lastPickRef.current.get(pool) ?? -1;
      let pick = Math.floor(Math.random() * choices.length);
      if (choices.length > 1 && pick === last) pick = (pick + 1) % choices.length;
      lastPickRef.current.set(pool, pick);

      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      setText(choices[pick]);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setText(null);
      }, QUIP_TTL_MS);
    },
    [locale, enabled],
  );

  return { text, emit };
}
