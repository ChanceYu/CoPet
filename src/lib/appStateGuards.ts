import type { AppState, PetWindowSize } from "./appTypes";

let petWindowSizeCommandSequence = 0;
const pendingPetWindowSizeCommands = new Set<number>();
let latestRequestedPetWindowSize: PetWindowSize | null = null;

export function beginPetWindowSizeCommand(size: PetWindowSize): number {
  const sequence = ++petWindowSizeCommandSequence;
  pendingPetWindowSizeCommands.add(sequence);
  latestRequestedPetWindowSize = size;
  return sequence;
}

export function finishPetWindowSizeCommand(sequence: number): void {
  pendingPetWindowSizeCommands.delete(sequence);
  if (pendingPetWindowSizeCommands.size === 0) {
    latestRequestedPetWindowSize = null;
  }
}

export function isLatestPetWindowSizeCommand(sequence: number): boolean {
  return sequence === petWindowSizeCommandSequence;
}

export function shouldApplyIncomingAppState(next: AppState): boolean {
  if (
    pendingPetWindowSizeCommands.size === 0 ||
    latestRequestedPetWindowSize === null
  ) {
    return true;
  }
  return next.petWindowSize === latestRequestedPetWindowSize;
}
