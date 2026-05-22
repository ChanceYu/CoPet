import { Import, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import type { PetSummary } from "../lib/appTypes";
import {
  refreshListMinimumLoadingMs,
  wait,
} from "../lib/petWindowUi";
import { PetPackageGrid } from "./PetPackageGrid";
import { SettingsPetImportDrawer } from "./SettingsPetImportDrawer";
import { Button } from "./ui/button";

import type { Translator } from "../lib/settingsTypes";

interface SettingsPetsSectionProps {
  currentPetId: string;
  installedPets: PetSummary[];
  isSelecting: boolean;
  petBusyId: string | null;
  refreshPetLists: () => Promise<unknown>;
  removePet: (pet: PetSummary) => Promise<void>;
  selectPet: (pet: PetSummary) => Promise<void>;
  t: Translator;
}

export function SettingsPetsSection({
  currentPetId,
  installedPets,
  isSelecting,
  petBusyId,
  refreshPetLists,
  removePet,
  selectPet,
  t,
}: SettingsPetsSectionProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [importDrawerOpen, setImportDrawerOpen] = useState(false);
  const [pendingScrollPetId, setPendingScrollPetId] = useState<string | null>(
    null,
  );

  const petCardStrings = useMemo(
    () => ({
      backToTop: t("backToTop"),
      currentPet: t("currentPet"),
      customBadge: t("customBadge"),
      remove: t("remove"),
    }),
    [t],
  );

  const handleRefresh = async () => {
    const startedAt = Date.now();
    setRefreshing(true);
    try {
      await refreshPetLists();
    } finally {
      const remainingMs = refreshListMinimumLoadingMs - (Date.now() - startedAt);
      if (remainingMs > 0) {
        await wait(remainingMs);
      }
      setRefreshing(false);
    }
  };

  return (
    <div className="settings-pets">
      <h2 id="settings-section-panel-heading">{t("pets")}</h2>
      <p className="settings-section-description">{t("petsDescription")}</p>

      <div className="pet-toolbar">
        <Button
          aria-busy={refreshing}
          className="pet-toolbar-button"
          disabled={refreshing}
          onClick={() => void handleRefresh()}
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshCw
            aria-hidden="true"
            className={refreshing ? "spin" : undefined}
            data-loading={String(refreshing)}
          />
          {t("refreshList")}
        </Button>
        <Button
          className="pet-toolbar-button"
          disabled={petBusyId === "import-preview" || petBusyId === "import-commit"}
          onClick={() => setImportDrawerOpen(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          <Import aria-hidden="true" />
          {t("importPets")}
        </Button>
      </div>

      <PetPackageGrid
        currentPetId={currentPetId}
        emptyTitle={t("noInstalledPets")}
        locateCurrentLabel={t("locateCurrent")}
        onScrollToPetIdHandled={() => setPendingScrollPetId(null)}
        pets={installedPets}
        scrollToPetId={pendingScrollPetId}
        showCurrentLocator
        strings={petCardStrings}
        cardProps={(pet) => ({
          active: pet.id === currentPetId,
          busy: petBusyId === pet.id || isSelecting,
          mode: "installed",
          onRemove: !pet.builtIn && pet.id !== currentPetId
            ? (target) => {
                void removePet(target);
              }
            : undefined,
          onSelect: (target) => {
            void selectPet(target);
          },
        })}
      />
      <SettingsPetImportDrawer
        onOpenChange={setImportDrawerOpen}
        open={importDrawerOpen}
        t={t}
      />
    </div>
  );
}
