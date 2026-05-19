import { useEffect, useRef } from "react";

export type PetContextMenuProps = {
  pauseEnabled: boolean;
  onClose: () => void;
  onTogglePause: (next: boolean) => void;
  onOpenSettings: () => void;
  onHidePet: () => void;
  labels: {
    pauseOn: string;
    pauseOff: string;
    openSettings: string;
    hidePet: string;
  };
};

export function PetContextMenu(props: PetContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  const onCloseRef = useRef(props.onClose);
  useEffect(() => {
    onCloseRef.current = props.onClose;
  });

  useEffect(() => {
    const onDocMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onCloseRef.current();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    const onBlur = () => onCloseRef.current();
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="pet-context-menu"
      data-testid="pet-context-menu"
      role="menu"
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          props.onTogglePause(!props.pauseEnabled);
          props.onClose();
        }}
      >
        {props.pauseEnabled ? props.labels.pauseOff : props.labels.pauseOn}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          props.onOpenSettings();
          props.onClose();
        }}
      >
        {props.labels.openSettings}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          props.onHidePet();
          props.onClose();
        }}
      >
        {props.labels.hidePet}
      </button>
    </div>
  );
}
