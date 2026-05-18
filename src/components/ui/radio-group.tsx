import type { KeyboardEvent, ReactNode } from "react";
import { useId, useMemo, useRef } from "react";

import { cn } from "../../lib/utils";

type RadioOption = {
  label: ReactNode;
  value: string;
};

type RadioGroupProps = {
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
  id?: string;
  name?: string;
  onValueChange: (value: string) => void;
  options: RadioOption[];
  value: string;
};

export function RadioGroup({
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  className,
  id,
  name,
  onValueChange,
  options,
  value,
}: RadioGroupProps) {
  const generatedId = useId();
  const groupId = id ?? generatedId;
  const groupName = name ?? `${groupId}-name`;
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedIndex = useMemo(() => {
    const found = options.findIndex((option) => option.value === value);
    return found === -1 ? 0 : found;
  }, [options, value]);

  const focusItem = (index: number) => {
    const target = itemRefs.current[index];
    if (target) {
      target.focus();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      const next = (index + 1) % options.length;
      onValueChange(options[next].value);
      focusItem(next);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      const next = (index - 1 + options.length) % options.length;
      onValueChange(options[next].value);
      focusItem(next);
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      onValueChange(options[index].value);
    }
  };

  return (
    <div
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={cn("ui-radio-group", className)}
      id={groupId}
      role="radiogroup"
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            aria-checked={checked}
            className="ui-radio-item"
            data-state={checked ? "checked" : "unchecked"}
            key={option.value}
            name={groupName}
            onClick={() => onValueChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
            role="radio"
            tabIndex={index === selectedIndex ? 0 : -1}
            type="button"
            value={option.value}
          >
            <span aria-hidden="true" className="ui-radio-indicator" />
            <span className="ui-radio-label">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
