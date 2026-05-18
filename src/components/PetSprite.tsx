import { convertFileSrc } from "@tauri-apps/api/core";
import type { CSSProperties } from "react";

import type { PetStateId, PetSummary } from "../lib/appTypes";
import type { ComposedView } from "../lib/petAnimation";
import { petStates } from "../lib/petStates";
import type { InputHandlers } from "../hooks/useInputState";
import type { MotionHandlers } from "../hooks/useMotionState";

export type PetSpriteProps = {
  pet: PetSummary;
  composed: ComposedView;
  scale?: number;
  animated?: boolean;
  inputHandlers?: InputHandlers;
  motionHandlers?: MotionHandlers;
};

export function PetSprite({
  pet,
  composed,
  scale = 1,
  animated = true,
  inputHandlers,
  motionHandlers,
}: PetSpriteProps) {
  const animation =
    petStates.find((item) => item.id === composed.bodySpriteRow) ?? petStates[0];

  const handlePointerEnter = inputHandlers?.onPointerEnter;
  const handlePointerMove = inputHandlers?.onPointerMove;
  const handlePointerLeave = inputHandlers?.onPointerLeave;
  const handleClick = inputHandlers?.onClick;
  const handlePointerDown = motionHandlers?.onPointerDown;

  return (
    <div
      className="pet-sprite-frame"
      role="img"
      aria-label={pet.displayName}
      data-dragging={composed.dragging ? "true" : "false"}
      data-emotion={composed.emotionOverlay ?? ""}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      style={
        {
          "--pet-scale": scale,
          "--frame-width": `${pet.frameWidth}px`,
          "--frame-height": `${pet.frameHeight}px`,
          "--scaled-frame-width": `${pet.frameWidth * scale}px`,
          "--scaled-frame-height": `${pet.frameHeight * scale}px`,
          "--sheet-width": `${pet.frameWidth * pet.gridColumns}px`,
          "--sheet-height": `${pet.frameHeight * pet.gridRows}px`,
          "--sprite-row-y": `-${animation.row * pet.frameHeight}px`,
          "--sprite-end-x": `-${animation.frames * pet.frameWidth}px`,
        } as CSSProperties
      }
    >
      <div
        className="pet-sprite"
        data-animated={animated}
        data-pet-state={animation.id as PetStateId}
        style={
          {
            "--sprite-url": `url("${convertFileSrc(pet.spritePath)}")`,
            "--sprite-row": animation.row,
            "--sprite-frames": animation.frames,
            "--sprite-duration": `${animation.durationMs}ms`,
          } as CSSProperties
        }
      />
      {composed.emotionOverlay ? (
        <div
          className={`pet-emotion-overlay pet-emotion-${composed.emotionOverlay}`}
          data-testid="pet-emotion-overlay"
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}
