import type { ButtonHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

export function Switch({ checked, className, onCheckedChange, ...props }: SwitchProps) {
  return (
    <button
      aria-checked={checked}
      className={cn("ui-switch", className)}
      data-state={checked ? "checked" : "unchecked"}
      onClick={(event) => {
        event.stopPropagation();
        onCheckedChange?.(!checked);
      }}
      role="switch"
      type="button"
      {...props}
    >
      <span className="ui-switch-thumb" />
    </button>
  );
}
