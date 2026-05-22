import { open } from "@tauri-apps/plugin-dialog";
import { Import, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { toast } from "sonner";

import type { AppState, PetSummary } from "../lib/appTypes";
import {
  refreshListMinimumLoadingMs,
  wait,
} from "../lib/petWindowUi";
import { PetPackageGrid } from "./PetPackageGrid";
import { Button } from "./ui/button";

import type { Translator } from "../lib/settingsTypes";

type LocalImportResult = {
  errorMessage: string | null;
  state: AppState | null;
};

interface SettingsPetsSectionProps {
  currentPetId: string;
  importLocalPet: (
    manifestJson: string,
    spriteFile: File,
  ) => Promise<LocalImportResult>;
  importLocalPetFolder: (path: string) => Promise<LocalImportResult>;
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
  importLocalPet,
  importLocalPetFolder,
  installedPets,
  isSelecting,
  petBusyId,
  refreshPetLists,
  removePet,
  selectPet,
  t,
}: SettingsPetsSectionProps) {
  const [refreshing, setRefreshing] = useState(false);

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

  const handleLocalFolderFiles = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    const manifestFile = files.find((file) => file.name === "pet.json");
    const spriteFile = files.find(
      (file) =>
        file.name === "spritesheet.webp" ||
        file.name === "spritesheet.png",
    );

    if (!manifestFile || !spriteFile) {
      toast.error(t("invalidLocalPetFolder"));
      return;
    }

    const manifestJson = await manifestFile.text();
    const result = await importLocalPet(manifestJson, spriteFile);
    if (result.errorMessage) {
      toast.error(result.errorMessage);
      return;
    }
  };

  const handleImportLocalFolder = async () => {
    const selectedPath = await open({
      canCreateDirectories: false,
      directory: true,
      multiple: false,
      title: t("importLocalFolder"),
    });

    if (typeof selectedPath !== "string") {
      return;
    }

    const result = await importLocalPetFolder(selectedPath);
    if (result.errorMessage) {
      // Rust backend returns a hardcoded English message for the missing-
      // manifest/sprite case; translate it here so non-English locales see
      // the localized copy.
      const message = /folder must contain pet\.json/i.test(result.errorMessage)
        ? t("invalidLocalPetFolder")
        : result.errorMessage;
      toast.error(message);
      return;
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
          disabled={petBusyId === "local-import"}
          onClick={() => void handleImportLocalFolder()}
          size="sm"
          type="button"
          variant="outline"
        >
          <Import aria-hidden="true" />
          {t("importLocalFolder")}
        </Button>
      </div>

      <input
        {...({ directory: "", webkitdirectory: "" } as Record<string, string>)}
        className="hidden-file-input"
        onChange={(event) => void handleLocalFolderFiles(event)}
        type="file"
      />

      <PetPackageGrid
        currentPetId={currentPetId}
        emptyTitle={t("noInstalledPets")}
        locateCurrentLabel={t("locateCurrent")}
        pets={installedPets}
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
    </div>
  );
}
