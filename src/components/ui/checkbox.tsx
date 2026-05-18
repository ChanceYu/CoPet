import type { InputHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function Checkbox({ className, ...props }: CheckboxProps) {
  return <input className={cn("ui-checkbox", className)} type="checkbox" {...props} />;
}
