import { useEffect, useRef } from "react";

export type PetContextMenuProps = {
  anchor: { x: number; y: number };
  pauseEnabled: boolean;
  onClose: () => void;
  onPet: () => void;
  onTogglePause: (next: boolean) => void;
  onOpenSettings: () => void;
  onHidePet: () => void;
  labels: {
    pet: string;
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

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const overflowX = rect.right - window.innerWidth;
    const overflowY = rect.bottom - window.innerHeight;
    if (overflowX > 0) node.style.left = `${Math.max(0, props.anchor.x - overflowX)}px`;
    if (overflowY > 0) node.style.top = `${Math.max(0, props.anchor.y - overflowY)}px`;
  }, [props.anchor.x, props.anchor.y]);

  return (
    <div
      ref={ref}
      className="pet-context-menu"
      data-testid="pet-context-menu"
      role="menu"
      style={{ position: "fixed", left: props.anchor.x, top: props.anchor.y }}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          props.onPet();
          props.onClose();
        }}
      >
        {props.labels.pet}
      </button>
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
