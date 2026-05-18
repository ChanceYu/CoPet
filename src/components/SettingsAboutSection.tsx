import pethoverLogoUrl from "../assets/logo.png";

import type { Translator } from "../lib/settingsTypes";

interface SettingsAboutSectionProps {
  t: Translator;
}

const PETHOVER_REPO_URL = "https://github.com/ChanceYu/pethover";

export function SettingsAboutSection({ t }: SettingsAboutSectionProps) {
  return (
    <div className="settings-about">
      <img
        alt=""
        aria-hidden="true"
        className="settings-about-logo"
        draggable={false}
        src={pethoverLogoUrl}
      />
      <h2 id="settings-section-panel-heading">{t("aboutTitle")}</h2>
      <p className="settings-about-version">
        {t("aboutVersion")} {__APP_VERSION__}
      </p>

      <p className="settings-about-line">{t("aboutBuiltWith")}</p>
      <p className="settings-about-line">
        <a href={PETHOVER_REPO_URL} rel="noreferrer" target="_blank">
          {t("aboutRepoLink")}
        </a>
      </p>
      <p className="settings-about-line settings-about-license">
        {t("aboutLicenseNotice")}
      </p>
    </div>
  );
}
