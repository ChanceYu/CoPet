import { Check } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

type CheckboxProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

export function Checkbox({
  checked = false,
  className,
  disabled,
  onCheckedChange,
  onClick,
  ...props
}: CheckboxProps) {
  return (
    <button
      aria-checked={checked}
      className={cn("ui-checkbox", className)}
      data-state={checked ? "checked" : "unchecked"}
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || disabled) {
          return;
        }
        onCheckedChange?.(!checked);
      }}
      role="checkbox"
      type="button"
      {...props}
    >
      <span className="ui-checkbox-indicator" aria-hidden="true">
        {checked ? <Check aria-hidden="true" /> : null}
      </span>
    </button>
  );
}
