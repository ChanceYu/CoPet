import type { PetState } from "./appTypes";

export const petStates = [
  { id: "idle", row: 0, frames: 6, durationMs: 1100 },
  { id: "running-right", row: 1, frames: 8, durationMs: 1060 },
  { id: "running-left", row: 2, frames: 8, durationMs: 1060 },
  { id: "waving", row: 3, frames: 4, durationMs: 700 },
  { id: "jumping", row: 4, frames: 5, durationMs: 840 },
  { id: "failed", row: 5, frames: 8, durationMs: 1220 },
  { id: "waiting", row: 6, frames: 6, durationMs: 1010 },
  { id: "running", row: 7, frames: 6, durationMs: 820 },
  { id: "review", row: 8, frames: 6, durationMs: 1030 },
] as const satisfies PetState[];
