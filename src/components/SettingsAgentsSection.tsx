import type { KeyboardEvent } from "react";
import { toast } from "sonner";

import type { AdapterSummary } from "../lib/appTypes";
import { COPET_ISSUES_URL } from "../lib/appLinks";
import { agentIconUrl } from "../lib/agentIcons";
import { agentMeta } from "../lib/agentMeta";
import { useOpenExternalUrl } from "../hooks/useOpenExternalUrl";
import { Switch } from "./ui/switch";

import type { Translator } from "../lib/settingsTypes";

type AdapterAction = "install_agent_adapter" | "uninstall_agent_adapter";

interface SettingsAgentsSectionProps {
  adapters: AdapterSummary[];
  adapterBusyId: string | null;
  runAdapterAction: (
    adapter: AdapterSummary,
    action: AdapterAction,
  ) => Promise<{ errorMessage: string | null }>;
  t: Translator;
}

export function SettingsAgentsSection({
  adapters,
  adapterBusyId,
  runAdapterAction,
  t,
}: SettingsAgentsSectionProps) {
  const openExternal = useOpenExternalUrl();

  const handleAdapterChange = async (
    adapter: AdapterSummary,
    checked: boolean,
  ) => {
    const action: AdapterAction = checked
      ? "install_agent_adapter"
      : "uninstall_agent_adapter";
    const result = await runAdapterAction(adapter, action);
    if (result.errorMessage) {
      toast.error(result.errorMessage);
    }
  };

  const toggleAdapter = (adapter: AdapterSummary) => {
    if (adapterBusyId === adapter.id) return;
    void handleAdapterChange(adapter, !adapter.installed);
  };

  const handleCardKeyDown = (
    event: KeyboardEvent<HTMLLIElement>,
    adapter: AdapterSummary,
  ) => {
    if (event.key !== " " && event.key !== "Enter") return;
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    toggleAdapter(adapter);
  };

  return (
    <div className="settings-agents">
      <h2 id="settings-section-panel-heading">{t("agentIntegrations")}</h2>
      <p className="settings-section-description">
        {t("agentIntegrationsLead")}
      </p>

      <ul className="adapter-card-list">
        {adapters.map((adapter) => {
          const iconUrl = agentIconUrl(adapter.id);
          const meta = agentMeta(adapter.id);
          const busy = adapterBusyId === adapter.id;
          const installed = adapter.installed;
          const description = meta ? t(meta.descriptionKey) : adapter.message;
          const showUnhealthy = installed && !adapter.healthy;
          return (
            <li
              className="adapter-card"
              data-busy={busy || undefined}
              data-installed={installed || undefined}
              key={adapter.id}
              onClick={() => toggleAdapter(adapter)}
              onKeyDown={(event) => handleCardKeyDown(event, adapter)}
              tabIndex={-1}
            >
              <div className="adapter-card-media" aria-hidden="true">
                {iconUrl ? (
                  <img
                    alt=""
                    className="adapter-card-logo"
                    draggable={false}
                    src={iconUrl}
                  />
                ) : (
                  <span className="adapter-card-logo-fallback">
                    {adapter.displayName.charAt(0)}
                  </span>
                )}
              </div>

              <div className="adapter-card-body">
                <div className="adapter-card-heading">
                  <span className="adapter-card-name">
                    {adapter.displayName}
                  </span>
                </div>

                {description ? (
                  <p className="adapter-card-description">{description}</p>
                ) : null}

                {(showUnhealthy || (installed && adapter.configPath)) && (
                  <div className="adapter-card-meta">
                    {showUnhealthy ? (
                      <span
                        className="adapter-status-pill"
                        data-tone="warn"
                      >
                        {t("agentStatusUnhealthy")}
                      </span>
                    ) : null}
                    {installed && adapter.configPath ? (
                      <span
                        className="adapter-config-path"
                        title={adapter.configPath}
                      >
                        <span className="adapter-config-path-label">
                          {t("agentConfigPathLabel")}
                        </span>
                        <code>{formatAdapterConfigPath(adapter.configPath)}</code>
                      </span>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="adapter-card-control">
                <Switch
                  aria-label={adapter.displayName}
                  checked={installed}
                  disabled={busy}
                  onCheckedChange={(checked) =>
                    void handleAdapterChange(adapter, checked)
                  }
                />
              </div>
            </li>
          );
        })}
      </ul>

      <p className="adapter-footnote">
        {renderFootnoteWithLink(t, openExternal)}
      </p>
    </div>
  );
}

function renderFootnoteWithLink(
  t: Translator,
  openExternal: (url: string) => Promise<void>,
) {
  const template = t("agentFootnote");
  const linkLabel = t("agentFootnoteLinkLabel");
  const [before, after = ""] = template.split("{link}");
  return (
    <>
      {before}
      <a
        className="adapter-footnote-link"
        href={COPET_ISSUES_URL}
        onClick={(event) => {
          event.preventDefault();
          void openExternal(COPET_ISSUES_URL);
        }}
        rel="noreferrer"
      >
        {linkLabel}
      </a>
      {after}
    </>
  );
}

function formatAdapterConfigPath(configPath: string): string {
  const match = /^\/Users\/[^/]+(?:\/(.*))?$/.exec(configPath);
  if (!match) return configPath;
  return match[1] ? `~/${match[1]}` : "~";
}
