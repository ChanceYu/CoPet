import { Check, Trash2 } from "lucide-react";
import { useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import type { PetSummary } from "../lib/appTypes";
import { PetPreviewPopover } from "./PetPreviewPopover";
import { PetSprite } from "./PetSprite";
import { Checkbox } from "./ui/checkbox";

export type PetPackageCardProps = {
  active?: boolean;
  busy?: boolean;
  checked?: boolean;
  mode: "installed" | "preview";
  onRemove?: (pet: PetSummary) => void;
  onSelect?: (pet: PetSummary) => void;
  onToggleChecked?: (pet: PetSummary) => void;
  pet: PetSummary;
  secondaryText?: ReactNode;
  strings: {
    currentPet: string;
    customBadge: string;
    remove: string;
    selectPreview?: string;
  };
};

export function PetPackageCard({
  active = false,
  busy = false,
  checked = false,
  mode,
  onRemove,
  onSelect,
  onToggleChecked,
  pet,
  secondaryText,
  strings,
}: PetPackageCardProps) {
  const [previewAnchor, setPreviewAnchor] = useState<HTMLElement | null>(null);
  const cardComposed = {
    bodySpriteRow: active ? "waving" : "idle",
    emotionOverlay: null,
    dragging: false,
  } as const;
  const previewComposed = {
    bodySpriteRow: "waving",
    emotionOverlay: null,
    dragging: false,
  } as const;

  const handleMainClick = () => {
    if (mode === "preview") {
      onToggleChecked?.(pet);
      return;
    }

    onSelect?.(pet);
  };

  const stopActionClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  const previewSelectLabel = strings.selectPreview
    ? `${strings.selectPreview} ${pet.displayName}`
    : `Select ${pet.displayName}`;

  return (
    <article
      className="pet-card"
      data-active={active}
      data-mode={mode}
      data-pet-id={pet.id}
      onPointerEnter={(event) => setPreviewAnchor(event.currentTarget)}
      onPointerLeave={() => setPreviewAnchor(null)}
    >
      <div className="pet-card-top-row">
        <span className="pet-card-preview-identity">
          {mode === "preview" ? (
            <Checkbox
              aria-label={previewSelectLabel}
              checked={checked}
              className="pet-card-checkbox"
              disabled={busy}
              onClick={(event) => event.stopPropagation()}
              onCheckedChange={() => onToggleChecked?.(pet)}
            />
          ) : null}
          <span className="pet-card-id">{pet.slug}</span>
        </span>
        <div className="pet-card-top-actions">
          {active ? (
            <span
              className="pet-card-pill pet-card-status pet-card-current-status"
              title={strings.currentPet}
            >
              <Check aria-hidden="true" />
            </span>
          ) : null}
          {onRemove ? (
            <button
              className="pet-card-pill pet-card-action"
              disabled={busy}
              onClick={(event) => {
                stopActionClick(event);
                onRemove(pet);
              }}
              title={strings.remove}
              type="button"
            >
              <Trash2 aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
      <button
        aria-label={pet.displayName}
        aria-pressed={mode === "preview" ? checked : undefined}
        className="pet-card-main"
        disabled={busy}
        onClick={handleMainClick}
        type="button"
      >
        <span className="pet-card-preview">
          <PetSprite
            animated={false}
            pet={pet}
            composed={cardComposed}
            scale={0.34}
          />
        </span>
        <span className="pet-card-copy">
          <span className="pet-card-name">
            <span className="pet-card-name-text">{pet.displayName}</span>
            {mode === "installed" && !pet.builtIn ? (
              <span
                className="pet-card-custom-badge"
                data-testid="pet-card-custom-badge"
              >
                {strings.customBadge}
              </span>
            ) : null}
          </span>
          <span className="pet-card-description">
            {secondaryText ?? pet.description}
          </span>
        </span>
      </button>
      <PetPreviewPopover
        anchor={previewAnchor}
        composed={previewComposed}
        pet={pet}
      />
    </article>
  );
}
