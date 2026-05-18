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

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div className={cn("ui-select", className)} ref={rootRef}>
      <button
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="ui-select-trigger"
        id={selectId}
        onClick={() => setOpen((visible) => !visible)}
        onKeyDown={handleTriggerKeyDown}
        role="combobox"
        type="button"
      >
        <span>{selectedOption?.label}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? (
        <div className="ui-select-listbox" id={listboxId} role="listbox">
          {options.map((option) => (
            <button
              aria-selected={option.value === value}
              className="ui-select-option"
              data-selected={option.value === value}
              key={option.value}
              onClick={() => {
                onValueChange(option.value);
                setOpen(false);
              }}
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
