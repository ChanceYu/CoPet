import { useCallback, useEffect, useRef, useState } from "react";

import { runPetStartupWindowAnimation } from "../lib/appCommands";
import type { ComposedView } from "../lib/petAnimation";
import {
  beginPetStartupAnimationArrival,
  completePetStartupAnimationRun,
  getPetStartupAnimationRunState,
  hasPetStartupAnimationEnterCompletedVisibly,
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

function shouldRunStartupAnimation(selectedPetId: string | null): boolean {
  return (
    !!selectedPetId &&
    petStartupAnimationConfig.enabled &&
    !prefersReducedMotion()
  );
}

export function usePetStartupAnimation({
  selectedPetId,
  selectedSoundPackId,
  onInteractionSound,
}: UsePetStartupAnimationArgs): UsePetStartupAnimationResult {
  const [phase, setPhase] = useState<PetStartupAnimationPhase>(() => {
    const runState = getPetStartupAnimationRunState();
    if (runState === "complete") return "complete";
    if (shouldRunStartupAnimation(selectedPetId)) {
      return runState === "running" && hasPetStartupAnimationEnterResolved()
        ? "arriving"
        : "entering";
    }
    if (runState === "running") {
      return hasPetStartupAnimationEnterResolved() ? "arriving" : "entering";
    }
    return "idle";
  });
  const startIdentityRef = useRef<StartupIdentity | null>(null);
  const localCompleteRef = useRef(phase === "complete");
  const arrivalTimerRef = useRef<number | null>(null);
  const onInteractionSoundRef = useRef(onInteractionSound);
  const skippedStartupSettledRef = useRef(false);

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
    if (
      !selectedPetId ||
      skippedStartupSettledRef.current ||
      getPetStartupAnimationRunState() === "complete" ||
      shouldRunStartupAnimation(selectedPetId)
    ) {
      return;
    }

    skippedStartupSettledRef.current = true;
    localCompleteRef.current = true;
    setPhase("complete");
    void runPetStartupWindowAnimation(0).finally(() => {
      completePetStartupAnimationRun();
    });
  }, [selectedPetId]);

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
      return result.completed;
    };

    void startPetStartupAnimationRun(runWindowAnimation)
      .then(() => {
        if (cancelled || localCompleteRef.current) {
          return;
        }
        if (!hasPetStartupAnimationEnterCompletedVisibly()) {
          complete();
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

  const effectivePhase =
    phase === "idle" &&
    !localCompleteRef.current &&
    shouldRunStartupAnimation(selectedPetId)
      ? "entering"
      : phase;
  const composedOverride =
    effectivePhase === "entering"
      ? petStartupEnteringView
      : effectivePhase === "arriving"
        ? petStartupArrivingView
        : null;

  return {
    composedOverride,
    hideMessages: effectivePhase === "entering" || effectivePhase === "arriving",
    complete,
  };
}
