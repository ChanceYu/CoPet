import type { ReactNode } from "react";

import type { SettingsSectionId } from "../lib/settingsTypes";

interface SettingsSectionHostProps {
  activeSection: SettingsSectionId;
  children: ReactNode;
  id: string;
}

export function SettingsSectionHost({
  activeSection,
  children,
  id,
}: SettingsSectionHostProps) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="settings-section"
      data-section={activeSection}
      id={id}
      role="tabpanel"
      tabIndex={0}
    >
      {children}
    </section>
  );
}
