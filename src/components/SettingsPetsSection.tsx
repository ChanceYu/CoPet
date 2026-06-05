import { Import, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { PetSummary } from "../lib/appTypes";
import {
  refreshListMinimumLoadingMs,
  wait,
} from "../lib/petWindowUi";
import { PetPackageGrid } from "./PetPackageGrid";
import { SettingsPetImportDrawer } from "./SettingsPetImportDrawer";
import { Button } from "./ui/button";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

import type { Translator } from "../lib/settingsTypes";

type PetSourceFilter = "all" | "builtIn" | "custom";

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
  const [sourceFilter, setSourceFilter] = useState<PetSourceFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const petCardStrings = useMemo(
    () => ({
      backToTop: t("backToTop"),
      currentPet: t("currentPet"),
      customBadge: t("customBadge"),
      remove: t("remove"),
    }),
    [t],
  );

  const filteredPets = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

    return installedPets.filter((pet) => {
      if (sourceFilter === "builtIn" && !pet.builtIn) {
        return false;
      }
      if (sourceFilter === "custom" && pet.builtIn) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }

      return [pet.displayName, pet.slug, pet.description].some((value) =>
        value.toLocaleLowerCase().includes(normalizedQuery),
      );
    });
  }, [installedPets, searchQuery, sourceFilter]);

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
      <div className="settings-pets-description-row">
        <p className="settings-section-description">{t("petsDescription")}</p>
      </div>

      <div className="pet-list-toolbar">
        <div className="pet-list-toolbar-left">
          <ToggleGroup
            aria-label={t("petType")}
            className="pet-source-filter"
            onValueChange={(value) => setSourceFilter(value as PetSourceFilter)}
            value={sourceFilter}
          >
            <ToggleGroupItem value="all">{t("allPets")}</ToggleGroupItem>
            <ToggleGroupItem value="builtIn">{t("builtInPets")}</ToggleGroupItem>
            <ToggleGroupItem value="custom">{t("customPets")}</ToggleGroupItem>
          </ToggleGroup>
          <label className="pet-search">
            <Search aria-hidden="true" />
            <input
              aria-label={t("searchPets")}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("searchPets")}
              type="search"
              value={searchQuery}
            />
          </label>
        </div>
        <div className="pet-toolbar">
          <Button
            aria-busy={refreshing}
            className="pet-list-toolbar-button"
            disabled={refreshing}
            onClick={() => void handleRefresh()}
            size="sm"
            type="button"
            variant="ghost"
          >
            <RefreshCw
              aria-hidden="true"
              className={refreshing ? "spin" : undefined}
              data-loading={String(refreshing)}
            />
            {t("refresh")}
          </Button>
          <Button
            className="pet-list-toolbar-button"
            disabled={
              petBusyId === "import-preview" || petBusyId === "import-commit"
            }
            onClick={() => setImportDrawerOpen(true)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Import aria-hidden="true" />
            {t("import")}
          </Button>
        </div>
      </div>

      <PetPackageGrid
        currentPetId={currentPetId}
        emptyClassName={
          installedPets.length === 0 ? undefined : "pet-list-empty-subtle"
        }
        emptyTitle={
          installedPets.length === 0 ? t("noInstalledPets") : t("noMatchingPets")
        }
        locateCurrentLabel={t("locateCurrent")}
        onScrollToPetIdHandled={() => setPendingScrollPetId(null)}
        pets={filteredPets}
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
        refreshPetLists={refreshPetLists}
        t={t}
      />
    </div>
  );
}
