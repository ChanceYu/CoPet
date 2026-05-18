import type { InputHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

type SliderProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type" | "value"> & {
  onValueChange?: (value: number) => void;
  value: number;
};

export function Slider({
  className,
  max = 100,
  min = 1,
  onValueChange,
  step = 1,
  value,
  ...props
}: SliderProps) {
  return (
    <input
      className={cn("ui-slider", className)}
      max={max}
      min={min}
      onChange={(event) => onValueChange?.(Number(event.currentTarget.value))}
      step={step}
      type="range"
      value={value}
      {...props}
    />
  );
}
