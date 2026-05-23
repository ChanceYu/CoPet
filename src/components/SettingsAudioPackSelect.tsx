import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import type { AudioPackSummary } from "../lib/appTypes";
import type { Translator } from "../lib/settingsTypes";

interface SettingsAudioPackSelectProps {
  audioPacks: AudioPackSummary[];
  currentAudioPackId: string;
  selectAudioPack: (audioPackId: string) => Promise<void>;
  t: Translator;
}

export function SettingsAudioPackSelect({
  audioPacks,
  currentAudioPackId,
  selectAudioPack,
  t,
}: SettingsAudioPackSelectProps) {
  const selectId = useId();
  const listboxId = `${selectId}-listbox`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const builtInPacks = audioPacks.filter((pack) => pack.builtIn);
  const customPacks = audioPacks.filter((pack) => !pack.builtIn);
  const selectedPack = audioPacks.find((pack) => pack.id === currentAudioPackId);
  const disabled = audioPacks.length === 0 || pending;

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const label = selectedPack?.displayName ?? audioPacks[0]?.displayName ?? t("noSoundPacks");

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (
      !disabled &&
      (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ")
    ) {
      event.preventDefault();
      setOpen(true);
    }
  };

  const handleSelect = async (audioPackId: string) => {
    if (pending) {
      return;
    }

    setPending(true);
    setOpen(false);
    try {
      await selectAudioPack(audioPackId);
    } finally {
      setPending(false);
    }
  };

  const renderGroup = (heading: string, packs: AudioPackSummary[]) => {
    if (packs.length === 0) {
      return null;
    }

    return (
      <div className="ui-select-group" role="group" aria-label={heading}>
        <div className="ui-select-group-label">{heading}</div>
        {packs.map((pack) => (
          <button
            aria-selected={pack.id === currentAudioPackId}
            className="ui-select-option"
            data-selected={pack.id === currentAudioPackId}
            disabled={pending}
            key={pack.id}
            onClick={() => {
              void handleSelect(pack.id);
            }}
            role="option"
            type="button"
          >
            {pack.displayName}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="ui-select audio-pack-select" ref={rootRef}>
      <button
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t("soundPack")}
        className="ui-select-trigger"
        disabled={disabled}
        id={selectId}
        onClick={() => {
          if (!disabled) {
            setOpen((visible) => !visible);
          }
        }}
        onKeyDown={handleTriggerKeyDown}
        role="combobox"
        type="button"
      >
        <span>{label}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? (
        <div className="ui-select-listbox" id={listboxId} role="listbox">
          {renderGroup(t("builtInSounds"), builtInPacks)}
          {renderGroup(t("customSounds"), customPacks)}
        </div>
      ) : null}
    </div>
  );
}
