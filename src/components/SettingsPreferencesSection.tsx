import { emit } from "@tauri-apps/api/event";
import { RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";

import type {
  LocalePreference,
  PetWindowSize,
} from "../lib/appTypes";
import {
  maxPetWindowSize,
  minPetWindowSize,
  petWindowSizeSliderDragEvent,
  petWindowSizeSliderDragStartDistancePx,
} from "../lib/petWindowUi";
import type { PetWindowSizeSliderDragPayload } from "../lib/petWindowUi";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import { Slider } from "./ui/slider";

import type { Translator } from "../lib/settingsTypes";

interface SettingsPreferencesSectionProps {
  locale: "en-US" | "zh-CN";
  setLocalePreference: (next: LocalePreference) => void;
  petWindowSize: PetWindowSize;
  setPetWindowSize: (size: PetWindowSize) => void;
  resetPetWindowPosition: () => Promise<{ errorMessage?: string }>;
  t: Translator;
}

export function SettingsPreferencesSection({
  locale,
  setLocalePreference,
  petWindowSize,
  setPetWindowSize,
  resetPetWindowPosition,
  t,
}: SettingsPreferencesSectionProps) {
  const [resetting, setResetting] = useState(false);
  const sizePointerRef = useRef<{
    startClientX: number;
    startClientY: number;
    started: boolean;
  } | null>(null);

  const emitSliderDrag = (
    phase: PetWindowSizeSliderDragPayload["phase"],
  ) => {
    void emit(petWindowSizeSliderDragEvent, { phase });
  };

  const startSizeSliderDrag = () => {
    if (sizePointerRef.current?.started) {
      return;
    }
    if (sizePointerRef.current) {
      sizePointerRef.current.started = true;
    }
    emitSliderDrag("start");
  };

  const handleSizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    sizePointerRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      started: false,
    };
    emitSliderDrag("begin");
  };

  const handleSizePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = sizePointerRef.current;
    if (!pointer || pointer.started) {
      return;
    }
    const distance = Math.hypot(
      event.clientX - pointer.startClientX,
      event.clientY - pointer.startClientY,
    );
    if (distance >= petWindowSizeSliderDragStartDistancePx) {
      startSizeSliderDrag();
    }
  };

  const handleSizeEnd = () => {
    if (!sizePointerRef.current) {
      return;
    }
    sizePointerRef.current = null;
    emitSliderDrag("end");
  };

  const handleResetPosition = async () => {
    setResetting(true);
    try {
      const { errorMessage } = await resetPetWindowPosition();
      if (errorMessage) {
        toast.error(errorMessage);
        return;
      }
      toast.success(t("resetPositionSuccess"));
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="settings-preferences">
      <h2 id="settings-section-panel-heading">{t("preferencesTitle")}</h2>

      <div className="settings-preferences-rows">
        <div className="settings-preferences-row">
          <span className="settings-preferences-row-title">{t("size")}</span>
          <div
            className="settings-preferences-row-control pet-size-control"
            onPointerCancel={handleSizeEnd}
            onPointerDown={handleSizePointerDown}
            onPointerMove={handleSizePointerMove}
            onPointerUp={handleSizeEnd}
          >
            <Slider
              aria-label={t("size")}
              max={maxPetWindowSize}
              min={minPetWindowSize}
              onValueChange={(value) => setPetWindowSize(value)}
              step={1}
              value={petWindowSize}
            />
          </div>
        </div>

        <div className="settings-preferences-row">
          <p className="settings-preferences-row-description">
            {t("resetPositionDescription")}
          </p>
          <div className="settings-preferences-row-control">
            <Button
              className="pet-toolbar-button"
              disabled={resetting}
              onClick={() => void handleResetPosition()}
              size="sm"
              type="button"
              variant="outline"
            >
              <RotateCcw aria-hidden="true" />
              {t("resetPosition")}
            </Button>
          </div>
        </div>

        <div className="settings-preferences-row">
          <label
            className="settings-preferences-row-title"
            htmlFor="language-select"
          >
            {t("language")}
          </label>
          <div className="settings-preferences-row-control">
            <Select
              aria-label={t("language")}
              className="language-select"
              id="language-select"
              onValueChange={(value) =>
                setLocalePreference(value as LocalePreference)
              }
              options={[
                { label: t("english"), value: "en-US" },
                { label: t("zhCn"), value: "zh-CN" },
              ]}
              value={locale === "zh-CN" ? "zh-CN" : "en-US"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
