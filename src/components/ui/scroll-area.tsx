import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export const ScrollArea = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function ScrollArea({ className, ...props }, ref) {
    return <div ref={ref} className={cn("ui-scroll-area", className)} {...props} />;
  },
);
