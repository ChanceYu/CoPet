import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
import { createContext, useContext } from "react";

import { cn } from "../../lib/utils";

type ToggleGroupProps = HTMLAttributes<HTMLDivElement> & {
  value: string;
  onValueChange: (value: string) => void;
};

const ToggleGroupContext = createContext<ToggleGroupProps | null>(null);

export function ToggleGroup({ className, onValueChange, value, ...props }: ToggleGroupProps) {
  return (
    <ToggleGroupContext.Provider value={{ onValueChange, value }}>
      <div className={cn("ui-toggle-group", className)} role="group" {...props} />
    </ToggleGroupContext.Provider>
  );
}

type ToggleGroupItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  value: string;
};

export function ToggleGroupItem({
  children,
  className,
  onClick,
  value,
  ...props
}: ToggleGroupItemProps) {
  const group = useContext(ToggleGroupContext);
  const active = value === group?.value;

  return (
    <button
      aria-pressed={active}
      className={cn("ui-toggle-group-item", className)}
      data-state={active ? "active" : "inactive"}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          group?.onValueChange(value);
        }
      }}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
