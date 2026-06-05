import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import type { SoundPackSummary } from "../lib/appTypes";
import type { Translator } from "../lib/settingsTypes";

interface SettingsSoundPackSelectProps {
  soundPacks: SoundPackSummary[];
  currentSoundPackId: string;
  selectSoundPack: (soundPackId: string) => Promise<void>;
  t: Translator;
}

export function SettingsSoundPackSelect({
  soundPacks,
  currentSoundPackId,
  selectSoundPack,
  t,
}: SettingsSoundPackSelectProps) {
  const selectId = useId();
  const listboxId = `${selectId}-listbox`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const builtInPacks = soundPacks.filter((pack) => pack.builtIn);
  const customPacks = soundPacks.filter((pack) => !pack.builtIn);
  const selectablePacks = [...builtInPacks, ...customPacks];
  const selectedPack = soundPacks.find((pack) => pack.id === currentSoundPackId);
  const selectedIndex = Math.max(
    0,
    selectablePacks.findIndex((pack) => pack.id === currentSoundPackId),
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const disabled = soundPacks.length === 0 || pending;
  const label =
    selectedPack?.displayName ?? soundPacks[0]?.displayName ?? t("noSoundPacks");

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

  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const openAtSelected = () => {
    setActiveIndex(selectedIndex);
    setOpen(true);
  };

  const moveActive = (offset: number) => {
    if (selectablePacks.length === 0) {
      return;
    }
    setOpen(true);
    setActiveIndex((current) => {
      const base = open ? current : selectedIndex;
      return (base + offset + selectablePacks.length) % selectablePacks.length;
    });
  };

  const handleSelect = async (soundPackId: string) => {
    if (pending) {
      return;
    }

    setPending(true);
    setOpen(false);
    try {
      await selectSoundPack(soundPackId);
    } finally {
      setPending(false);
    }
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (disabled) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        openAtSelected();
        return;
      }
      moveActive(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openAtSelected();
        return;
      }
      moveActive(-1);
      return;
    }

    if (open && event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (open && event.key === "End") {
      event.preventDefault();
      setActiveIndex(selectablePacks.length - 1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) {
        const activePack = selectablePacks[activeIndex];
        if (activePack) {
          void handleSelect(activePack.id);
        }
        return;
      }
      openAtSelected();
    }
  };

  const handleTriggerClick = () => {
    if (disabled) {
      return;
    }
    setOpen((visible) => {
      if (!visible) {
        setActiveIndex(selectedIndex);
      }
      return !visible;
    });
  };

  const renderGroup = (heading: string, packs: SoundPackSummary[]) => {
    if (packs.length === 0) {
      return null;
    }

    return (
      <div className="ui-select-group" role="group" aria-label={heading}>
        <div className="ui-select-group-label">{heading}</div>
        {packs.map((pack) => {
          const optionIndex = selectablePacks.findIndex(
            (candidate) => candidate.id === pack.id,
          );
          return (
            <button
              aria-selected={pack.id === currentSoundPackId}
              className="ui-select-option"
              data-active={optionIndex === activeIndex}
              data-selected={pack.id === currentSoundPackId}
              disabled={pending}
              id={optionId(optionIndex)}
              key={pack.id}
              onClick={() => {
                void handleSelect(pack.id);
              }}
              onPointerEnter={() => setActiveIndex(optionIndex)}
              role="option"
              type="button"
            >
              {pack.displayName}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="ui-select sound-pack-select" ref={rootRef}>
      <button
        aria-activedescendant={open ? optionId(activeIndex) : undefined}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t("soundPack")}
        className="ui-select-trigger"
        disabled={disabled}
        id={selectId}
        onClick={handleTriggerClick}
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
