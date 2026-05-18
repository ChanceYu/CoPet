import { toast } from "sonner";

import type { AdapterSummary } from "../lib/appTypes";
import { agentIconUrl } from "../lib/agentIcons";
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

  return (
    <div className="settings-agents">
      <h2 id="settings-section-panel-heading">{t("agentIntegrations")}</h2>
      <p className="settings-section-description">
        {t("settingsDescription")}
      </p>

      <div className="adapter-chip-grid">
        {adapters.map((adapter) => {
          const iconUrl = agentIconUrl(adapter.id);
          return (
            <label
              className="adapter-chip"
              data-disabled={adapterBusyId === adapter.id}
              key={adapter.id}
            >
              <Switch
                aria-label={adapter.displayName}
                checked={adapter.installed}
                disabled={adapterBusyId === adapter.id}
                onCheckedChange={(checked) =>
                  void handleAdapterChange(adapter, checked)
                }
              />
              {iconUrl ? (
                <img
                  alt=""
                  aria-hidden="true"
                  className="adapter-chip-logo"
                  draggable={false}
                  src={iconUrl}
                />
              ) : null}
              <span>{adapter.displayName}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
