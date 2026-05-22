import type { HTMLAttributes, KeyboardEvent, ReactNode } from "react";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "../../lib/utils";
import { Button } from "./button";

type DrawerProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  closeLabel?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  overlayLabel?: string;
};

export function Drawer({
  children,
  className,
  closeLabel = "Close drawer",
  onOpenChange,
  onKeyDown,
  open,
  overlayLabel = "Close drawer",
  ...props
}: DrawerProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const content = contentRef.current;
    const focusTarget =
      content?.querySelector<HTMLElement>(focusableSelector) ?? content;
    focusTarget?.focus();

    return () => {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onOpenChange(false);
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusable = getFocusableElements(event.currentTarget);
    if (focusable.length === 0) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="ui-drawer-root">
      <div
        aria-label={overlayLabel}
        className="ui-drawer-overlay"
        onClick={() => onOpenChange(false)}
        role="button"
        tabIndex={-1}
      />
      <div
        aria-modal="true"
        className={cn("ui-drawer-content", className)}
        onKeyDown={handleKeyDown}
        ref={contentRef}
        role="dialog"
        tabIndex={-1}
        {...props}
      >
        <Button
          aria-label={closeLabel}
          className="ui-drawer-close"
          onClick={() => onOpenChange(false)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" />
        </Button>
        {children}
      </div>
    </div>
  );
}

export function DrawerHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ui-drawer-header", className)} {...props} />;
}

export function DrawerTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("ui-drawer-title", className)} {...props} />;
}

export function DrawerDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("ui-drawer-description", className)} {...props} />
  );
}

export function DrawerBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ui-drawer-body", className)} {...props} />;
}

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => !element.hasAttribute("disabled") && !element.hidden);
}
