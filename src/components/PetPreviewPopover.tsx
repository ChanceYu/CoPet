import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

import type { PetSummary } from "../lib/appTypes";
import type { ComposedView } from "../lib/petAnimation";
import { PetSprite } from "./PetSprite";

const popoverWidth = 128;
const popoverHeight = 142;
const viewportMargin = 10;
const anchorGap = 8;

type PetPreviewPopoverProps = {
  anchor: HTMLElement | null;
  composed: ComposedView;
  pet: PetSummary;
};

type PopoverPosition = {
  left: number;
  top: number;
};

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function previewPosition(anchor: HTMLElement): PopoverPosition {
  const rect = anchor.getBoundingClientRect();
  const maxLeft = window.innerWidth - popoverWidth - viewportMargin;
  const maxTop = window.innerHeight - popoverHeight - viewportMargin;
  const centeredLeft = rect.left + rect.width / 2 - popoverWidth / 2;
  const topSpace = rect.top - viewportMargin;
  const bottomSpace = window.innerHeight - rect.bottom - viewportMargin;
  const preferAbove =
    topSpace >= popoverHeight + anchorGap || topSpace >= bottomSpace;
  const rawTop = preferAbove
    ? rect.top - popoverHeight - anchorGap
    : rect.bottom + anchorGap;

  return {
    left: clamp(centeredLeft, viewportMargin, maxLeft),
    top: clamp(rawTop, viewportMargin, maxTop),
  };
}

export function PetPreviewPopover({
  anchor,
  composed,
  pet,
}: PetPreviewPopoverProps) {
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  useLayoutEffect(() => {
    if (!anchor) {
      setPosition(null);
      return;
    }

    const updatePosition = () => setPosition(previewPosition(anchor));
    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [anchor]);

  if (!anchor || !position) {
    return null;
  }

  return createPortal(
    <div
      aria-hidden="true"
      className="pet-preview-popover"
      data-testid="pet-preview-popover"
      style={{
        left: position.left,
        top: position.top,
      }}
    >
      <PetSprite composed={composed} pet={pet} scale={0.48} />
    </div>,
    document.body,
  );
}
