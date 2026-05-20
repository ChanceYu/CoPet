import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

import { useBootstrapAppStore } from "./hooks/useAppStore";
import { PetWindow } from "./PetWindow";
import { SettingsWindow } from "./SettingsWindow";

export function App() {
  useBootstrapAppStore();
  const label = getCurrentWebviewWindow().label;

  if (label === "settings") {
    return <SettingsWindow />;
  }

  return <PetWindow />;
}
