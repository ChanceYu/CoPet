import type { ButtonHTMLAttributes, HTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export function Tabs({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ui-tabs", className)} {...props} />;
}

export function TabsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ui-tabs-list", className)} role="tablist" {...props} />;
}

type TabsTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
};

export function TabsTrigger({ active = false, className, ...props }: TabsTriggerProps) {
  return (
    <button
      aria-selected={active}
      className={cn("ui-tabs-trigger", className)}
      data-state={active ? "active" : "inactive"}
      role="tab"
      type="button"
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ui-tabs-content", className)} role="tabpanel" {...props} />;
}
