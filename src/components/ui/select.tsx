import { ChevronDown } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";

import { cn } from "../../lib/utils";

type SelectOption = {
  label: ReactNode;
  value: string;
};

type SelectProps = {
  "aria-label"?: string;
  className?: string;
  id?: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  value: string;
};

export function Select({
  "aria-label": ariaLabel,
  className,
  id,
  onValueChange,
  options,
  value,
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const listboxId = `${selectId}-listbox`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === selectedOption?.value),
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);

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
    if (options.length === 0) {
      return;
    }
    setOpen(true);
    setActiveIndex((current) => {
      const base = open ? current : selectedIndex;
      return (base + offset + options.length) % options.length;
    });
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
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
      setActiveIndex(options.length - 1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) {
        const activeOption = options[activeIndex];
        if (activeOption) {
          onValueChange(activeOption.value);
          setOpen(false);
        }
        return;
      }
      openAtSelected();
    }
  };

  return (
    <div className={cn("ui-select", className)} ref={rootRef}>
      <button
        aria-activedescendant={open ? optionId(activeIndex) : undefined}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="ui-select-trigger"
        id={selectId}
        onClick={() =>
          setOpen((visible) => {
            if (!visible) {
              setActiveIndex(selectedIndex);
            }
            return !visible;
          })
        }
        onKeyDown={handleTriggerKeyDown}
        role="combobox"
        type="button"
      >
        <span>{selectedOption?.label}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? (
        <div className="ui-select-listbox" id={listboxId} role="listbox">
          {options.map((option, index) => (
            <button
              aria-selected={option.value === value}
              className="ui-select-option"
              data-active={index === activeIndex}
              data-selected={option.value === value}
              id={optionId(index)}
              key={option.value}
              onClick={() => {
                onValueChange(option.value);
                setOpen(false);
              }}
              onPointerEnter={() => setActiveIndex(index)}
              role="option"
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
