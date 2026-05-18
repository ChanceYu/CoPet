import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

import { PetWindow } from "./PetWindow";
import { SettingsWindow } from "./SettingsWindow";

export function App() {
  const label = getCurrentWebviewWindow().label;

  if (label === "settings") {
    return <SettingsWindow />;
  }

  return <PetWindow />;
}
