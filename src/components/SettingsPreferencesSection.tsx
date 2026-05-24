import { emit } from "@tauri-apps/api/event";
import { RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";

import type {
  AgentMessageDisplay,
  SoundPackSummary,
  CooldownStyle,
  LocalePreference,
  PetInteractionPrefs,
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
import { RadioGroup } from "./ui/radio-group";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";
import { SettingsSoundPackSelect } from "./SettingsSoundPackSelect";

import type { Translator } from "../lib/settingsTypes";

const SUCCESS_TOAST_DURATION_MS = 1800;

interface SettingsPreferencesSectionProps {
  agentMessageDisplay: AgentMessageDisplay;
  setAgentMessageDisplay: (next: AgentMessageDisplay) => void;
  locale: "en-US" | "zh-CN";
  setLocalePreference: (next: LocalePreference) => void;
  petVisible: boolean;
  setPetVisible: (visible: boolean) => void;
  petWindowSize: PetWindowSize;
  setPetWindowSize: (size: PetWindowSize) => void;
  resetPetWindowPosition: () => Promise<{ errorMessage?: string }>;
  agentMessageVisible: boolean;
  setAgentMessageVisible: (visible: boolean) => void;
  petInteractions: PetInteractionPrefs;
  setPetInteractions: (prefs: PetInteractionPrefs) => void;
  soundPacks: SoundPackSummary[];
  currentSoundPackId: string;
  selectSoundPack: (soundPackId: string) => Promise<void>;
  t: Translator;
}

export function SettingsPreferencesSection({
  agentMessageDisplay,
  setAgentMessageDisplay,
  locale,
  setLocalePreference,
  petVisible,
  setPetVisible,
  petWindowSize,
  setPetWindowSize,
  resetPetWindowPosition,
  agentMessageVisible,
  setAgentMessageVisible,
  petInteractions,
  setPetInteractions,
  soundPacks,
  currentSoundPackId,
  selectSoundPack,
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
      toast.success(t("resetPositionSuccess"), { duration: SUCCESS_TOAST_DURATION_MS });
    } finally {
      setResetting(false);
    }
  };

  const setEnableClickSounds = (enableClickSounds: boolean) =>
    setPetInteractions({ ...petInteractions, enableClickSounds });

  const setEnableStartupAnimation = (enableStartupAnimation: boolean) =>
    setPetInteractions({ ...petInteractions, enableStartupAnimation });

  return (
    <div className="settings-preferences">
      <h2 id="settings-section-panel-heading">{t("preferencesTitle")}</h2>

      <section className="settings-preferences-group">
        <header className="settings-preferences-group-header">
          {t("petWindowHeading")}
        </header>
        <div className="settings-preferences-rows">
          <div className="settings-preferences-row">
            <div className="settings-preferences-row-text">
              <span className="settings-preferences-row-title">
                {t("showPet")}
              </span>
            </div>
            <div className="settings-preferences-row-control">
              <div
                className="settings-switch-row"
                onClick={() => setPetVisible(!petVisible)}
              >
                <Switch
                  aria-label={t("showPet")}
                  checked={petVisible}
                  onCheckedChange={setPetVisible}
                />
                <span
                  aria-hidden="true"
                  className="settings-switch-state"
                  data-active={petVisible ? "true" : "false"}
                >
                  {t(petVisible ? "switchStateOn" : "switchStateOff")}
                </span>
              </div>
            </div>
          </div>

          <div className="settings-preferences-row">
            <div className="settings-preferences-row-text">
              <span className="settings-preferences-row-title">
                {t("enableStartupAnimation")}
              </span>
            </div>
            <div className="settings-preferences-row-control">
              <div
                className="settings-switch-row"
                onClick={() =>
                  setEnableStartupAnimation(!petInteractions.enableStartupAnimation)
                }
              >
                <Switch
                  aria-label={t("enableStartupAnimation")}
                  checked={petInteractions.enableStartupAnimation}
                  onCheckedChange={setEnableStartupAnimation}
                />
                <span
                  aria-hidden="true"
                  className="settings-switch-state"
                  data-active={
                    petInteractions.enableStartupAnimation ? "true" : "false"
                  }
                >
                  {t(
                    petInteractions.enableStartupAnimation
                      ? "switchStateOn"
                      : "switchStateOff",
                  )}
                </span>
              </div>
            </div>
          </div>

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
        </div>
      </section>

      <section className="settings-preferences-group">
        <header className="settings-preferences-group-header">
          {t("petInteractionsHeading")}
        </header>
        <div className="settings-preferences-rows">
          <div className="settings-preferences-row">
            <div className="settings-preferences-row-text">
              <span className="settings-preferences-row-title">
                {t("enableClickSounds")}
              </span>
            </div>
            <div className="settings-preferences-row-control">
              <div className="settings-sound-controls">
                <SettingsSoundPackSelect
                  soundPacks={soundPacks}
                  currentSoundPackId={currentSoundPackId}
                  selectSoundPack={selectSoundPack}
                  t={t}
                />
                <span
                  aria-hidden="true"
                  className="settings-sound-controls-separator"
                />
                <div
                  className="settings-switch-row"
                  onClick={() => setEnableClickSounds(!petInteractions.enableClickSounds)}
                >
                  <Switch
                    aria-label={t("enableClickSounds")}
                    checked={petInteractions.enableClickSounds}
                    onCheckedChange={setEnableClickSounds}
                  />
                  <span
                    aria-hidden="true"
                    className="settings-switch-state"
                    data-active={petInteractions.enableClickSounds ? "true" : "false"}
                  >
                    {t(petInteractions.enableClickSounds ? "switchStateOn" : "switchStateOff")}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="settings-preferences-row">
            <span
              className="settings-preferences-row-title"
              id="interaction-cooldown-label"
            >
              {t("interactionCooldown")}
            </span>
            <div className="settings-preferences-row-control">
              <RadioGroup
                aria-labelledby="interaction-cooldown-label"
                onValueChange={(value) =>
                  setPetInteractions({ ...petInteractions, cooldownStyle: value as CooldownStyle })
                }
                options={[
                  { label: t("interactionCooldownShort"), value: "short" },
                  { label: t("interactionCooldownNormal"), value: "normal" },
                  { label: t("interactionCooldownLazy"), value: "lazy" },
                ]}
                value={petInteractions.cooldownStyle}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="settings-preferences-group">
        <header className="settings-preferences-group-header">
          {t("messagesHeading")}
        </header>
        <div className="settings-preferences-rows">
          <div className="settings-preferences-row">
            <div className="settings-preferences-row-text">
              <span className="settings-preferences-row-title">
                {t("agentMessageVisible")}
              </span>
              <p className="settings-preferences-row-description">
                {t("agentMessageVisibleDescription")}
              </p>
            </div>
            <div className="settings-preferences-row-control">
              <div
                className="settings-switch-row"
                onClick={() => setAgentMessageVisible(!agentMessageVisible)}
              >
                <Switch
                  aria-label={t("agentMessageVisible")}
                  checked={agentMessageVisible}
                  onCheckedChange={setAgentMessageVisible}
                />
                <span
                  aria-hidden="true"
                  className="settings-switch-state"
                  data-active={agentMessageVisible ? "true" : "false"}
                >
                  {t(agentMessageVisible ? "switchStateOn" : "switchStateOff")}
                </span>
              </div>
            </div>
          </div>

          <div className="settings-preferences-row">
            <span
              className="settings-preferences-row-title"
              id="message-display-label"
            >
              {t("messageDisplay")}
            </span>
            <div className="settings-preferences-row-control">
              <RadioGroup
                aria-labelledby="message-display-label"
                className="message-display-radio"
                onValueChange={(value) =>
                  setAgentMessageDisplay(value as AgentMessageDisplay)
                }
                options={[
                  { label: t("messageDisplayLatest"), value: "latest" },
                  { label: t("messageDisplayAll"), value: "all" },
                ]}
                value={agentMessageDisplay}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="settings-preferences-group">
        <div className="settings-preferences-rows">
          <div className="settings-preferences-row">
            <span
              className="settings-preferences-row-title"
              id="language-label"
            >
              {t("language")}
            </span>
            <div className="settings-preferences-row-control">
              <RadioGroup
                aria-labelledby="language-label"
                className="language-radio"
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
      </section>
    </div>
  );
}
