import { useCallback, useEffect, useRef, useState } from "react";

import { runPetStartupWindowAnimation } from "../lib/appCommands";
import type { ComposedView } from "../lib/petAnimation";
import {
  beginPetStartupAnimationArrival,
  completePetStartupAnimationRun,
  getPetStartupAnimationRunState,
  hasPetStartupAnimationEnterResolved,
  petStartupAnimationConfig,
  petStartupAnimationArrivalRemainingMs,
  petStartupArrivingView,
  petStartupEnteringView,
  startPetStartupAnimationRun,
  type PetStartupAnimationPhase,
} from "../lib/petStartupAnimation";
import type { InteractionSoundKey } from "./usePetSounds";

export type UsePetStartupAnimationArgs = {
  selectedPetId: string | null;
  selectedSoundPackId: string | null;
  onInteractionSound: (kind: InteractionSoundKey) => void;
};

export type UsePetStartupAnimationResult = {
  composedOverride: ComposedView | null;
  hideMessages: boolean;
  complete: () => void;
};

type StartupIdentity = {
  selectedPetId: string;
  selectedSoundPackId: string | null;
};

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function usePetStartupAnimation({
  selectedPetId,
  selectedSoundPackId,
  onInteractionSound,
}: UsePetStartupAnimationArgs): UsePetStartupAnimationResult {
  const [phase, setPhase] = useState<PetStartupAnimationPhase>(() => {
    const runState = getPetStartupAnimationRunState();
    if (runState === "complete") return "complete";
    if (runState === "running") {
      return hasPetStartupAnimationEnterResolved() ? "arriving" : "entering";
    }
    return "idle";
  });
  const startIdentityRef = useRef<StartupIdentity | null>(null);
  const localCompleteRef = useRef(phase === "complete");
  const arrivalTimerRef = useRef<number | null>(null);
  const onInteractionSoundRef = useRef(onInteractionSound);

  useEffect(() => {
    onInteractionSoundRef.current = onInteractionSound;
  }, [onInteractionSound]);

  const clearArrivalTimer = useCallback(() => {
    if (arrivalTimerRef.current !== null) {
      window.clearTimeout(arrivalTimerRef.current);
      arrivalTimerRef.current = null;
    }
  }, []);

  const complete = useCallback(() => {
    localCompleteRef.current = true;
    clearArrivalTimer();
    completePetStartupAnimationRun();
    setPhase("complete");
  }, [clearArrivalTimer]);

  useEffect(() => {
    return () => {
      clearArrivalTimer();
    };
  }, [clearArrivalTimer]);

  useEffect(() => {
    const startedWith = startIdentityRef.current;
    if (
      !startedWith ||
      phase === "idle" ||
      phase === "complete" ||
      localCompleteRef.current
    ) {
      return;
    }

    if (
      startedWith.selectedPetId !== selectedPetId ||
      startedWith.selectedSoundPackId !== selectedSoundPackId
    ) {
      complete();
    }
  }, [complete, phase, selectedPetId, selectedSoundPackId]);

  useEffect(() => {
    if (!petStartupAnimationConfig.enabled) {
      complete();
      return;
    }
    if (!selectedPetId || localCompleteRef.current) {
      return;
    }
    if (prefersReducedMotion()) {
      complete();
      return;
    }
    if (getPetStartupAnimationRunState() === "complete") {
      localCompleteRef.current = true;
      setPhase("complete");
      return;
    }
    let cancelled = false;
    if (!startIdentityRef.current) {
      startIdentityRef.current = { selectedPetId, selectedSoundPackId };
      setPhase("entering");
    }

    const runWindowAnimation = async () => {
      const result = await runPetStartupWindowAnimation(
        petStartupAnimationConfig.enterDurationMs,
      );
      if (result.errorMessage) {
        throw new Error(result.errorMessage);
      }
    };

    void startPetStartupAnimationRun(runWindowAnimation)
      .then(() => {
        if (cancelled || localCompleteRef.current) {
          return;
        }

        const startedWith = startIdentityRef.current;
        if (
          !startedWith ||
          startedWith.selectedPetId !== selectedPetId ||
          startedWith.selectedSoundPackId !== selectedSoundPackId
        ) {
          complete();
          return;
        }

        setPhase("arriving");
        if (beginPetStartupAnimationArrival()) {
          onInteractionSoundRef.current(petStartupAnimationConfig.arrivalSoundKey);
        }
        clearArrivalTimer();
        const arrivalRemainingMs = petStartupAnimationArrivalRemainingMs();
        if (arrivalRemainingMs <= 0) {
          arrivalTimerRef.current = null;
          complete();
          return;
        }
        arrivalTimerRef.current = window.setTimeout(() => {
          arrivalTimerRef.current = null;
          complete();
        }, arrivalRemainingMs);
      })
      .catch(() => {
        if (!cancelled && !localCompleteRef.current) {
          complete();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clearArrivalTimer, complete, selectedPetId, selectedSoundPackId]);

  const composedOverride =
    phase === "entering"
      ? petStartupEnteringView
      : phase === "arriving"
        ? petStartupArrivingView
        : null;

  return {
    composedOverride,
    hideMessages: phase === "entering" || phase === "arriving",
    complete,
  };
}
