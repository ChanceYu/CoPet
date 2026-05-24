import type { ComposedView } from "./petAnimation";

export type PetStartupAnimationPhase =
  | "idle"
  | "entering"
  | "arriving"
  | "complete";

type PetStartupAnimationRunState = "pending" | "running" | "complete";

export const petStartupAnimationConfig = {
  enterDurationMs: 2000,
  arrivalDurationMs: 1500,
  enterSoundKey: "celebrating",
  arrivalSoundKey: "pettedSlow",
} as const;

export const petStartupEnteringView: ComposedView = {
  bodySpriteRow: "running-left",
  emotionOverlay: null,
  dragging: false,
};

export const petStartupArrivingView: ComposedView = {
  bodySpriteRow: "waiting",
  emotionOverlay: "heart",
  dragging: false,
};

let runState: PetStartupAnimationRunState = "pending";
let runPromise: Promise<void> | null = null;
let enterResolved = false;
let enterCompletedVisibly = false;
let enterSoundPlayed = false;
let arrivalStartedAtMs: number | null = null;

export function getPetStartupAnimationRunState(): PetStartupAnimationRunState {
  return runState;
}

export function completePetStartupAnimationRun(): void {
  runState = "complete";
  runPromise = null;
  enterResolved = false;
  enterCompletedVisibly = false;
  enterSoundPlayed = false;
  arrivalStartedAtMs = null;
}

export function beginPetStartupAnimationEnterSound(): boolean {
  if (enterSoundPlayed) return false;
  enterSoundPlayed = true;
  return true;
}

export function hasPetStartupAnimationEnterResolved(): boolean {
  return enterResolved;
}

export function hasPetStartupAnimationEnterCompletedVisibly(): boolean {
  return enterCompletedVisibly;
}

export function beginPetStartupAnimationArrival(nowMs = Date.now()): boolean {
  if (arrivalStartedAtMs !== null) {
    return false;
  }

  arrivalStartedAtMs = nowMs;
  return true;
}

export function petStartupAnimationArrivalRemainingMs(
  nowMs = Date.now(),
): number {
  if (arrivalStartedAtMs === null) {
    return petStartupAnimationConfig.arrivalDurationMs;
  }

  return Math.max(
    0,
    petStartupAnimationConfig.arrivalDurationMs - (nowMs - arrivalStartedAtMs),
  );
}

export function startPetStartupAnimationRun(
  run: () => Promise<boolean>,
): Promise<void> {
  if (runState === "complete") {
    return Promise.resolve();
  }

  if (!runPromise) {
    runState = "running";
    enterResolved = false;
    enterCompletedVisibly = false;
    enterSoundPlayed = false;
    arrivalStartedAtMs = null;
    runPromise = run().then((completedVisibly) => {
      enterResolved = true;
      enterCompletedVisibly = completedVisibly;
    });
  }

  return runPromise;
}
