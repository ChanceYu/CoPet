import boxImg from "@/assets/box.png";
import type { Translator } from "../lib/settingsTypes";

interface SettingsTipBoxProps {
  t: Translator;
}

export function SettingsTipBox({ t }: SettingsTipBoxProps) {
  return (
    <section
      aria-labelledby="settings-tip-title"
      className="settings-tip-box"
    >
      <div className="settings-tip-content">
        <h2 className="settings-tip-title" id="settings-tip-title">
          {t("settingsTipTitle")}
        </h2>
        <p className="settings-tip-description">
          {t("settingsTipDescription")}
        </p>
      </div>
      <div aria-hidden="true" className="settings-tip-media">
        <img alt="" className="settings-tip-img" draggable={false} src={boxImg} />
      </div>
    </section>
  );
}
