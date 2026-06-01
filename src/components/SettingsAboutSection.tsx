import copetLogoUrl from "../assets/logo.png";
import { COPET_REPO_URL } from "../lib/appLinks";
import { useOpenExternalUrl } from "../hooks/useOpenExternalUrl";

import type { Translator } from "../lib/settingsTypes";

interface SettingsAboutSectionProps {
  t: Translator;
}

export function SettingsAboutSection({ t }: SettingsAboutSectionProps) {
  const openExternal = useOpenExternalUrl();
  return (
    <div className="settings-about">
      <div className="settings-about-hero">
        <div className="settings-about-logo-frame">
          <img
            alt=""
            aria-hidden="true"
            className="settings-about-logo"
            draggable={false}
            src={copetLogoUrl}
          />
        </div>
        <h2 id="settings-section-panel-heading">{t("aboutTitle")}</h2>
        <span className="settings-about-version">
          {t("aboutVersion")} v{__APP_VERSION__}
        </span>
      </div>

      <div className="settings-about-meta">
        <p className="settings-about-line">{t("aboutBuiltWith")}</p>
        <p className="settings-about-line">
          <a
            className="settings-about-link"
            href={COPET_REPO_URL}
            onClick={(event) => {
              event.preventDefault();
              void openExternal(COPET_REPO_URL);
            }}
            rel="noreferrer"
          >
            {t("aboutRepoLink")}
          </a>
        </p>
        <p className="settings-about-line settings-about-license">
          {t("aboutLicenseNotice")}
        </p>
      </div>
    </div>
  );
}
