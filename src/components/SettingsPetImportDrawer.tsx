import { FolderOpen, PackageOpen, Upload } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";

import { usePetImport } from "../hooks/usePetImport";
import type { PetSummary } from "../lib/appTypes";
import type { Translator } from "../lib/settingsTypes";
import { PetPackageGrid } from "./PetPackageGrid";
import { Button } from "./ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "./ui/drawer";

type SettingsPetImportDrawerProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  t: Translator;
};

export function SettingsPetImportDrawer({
  onOpenChange,
  open,
  t,
}: SettingsPetImportDrawerProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [showLocalChoices, setShowLocalChoices] = useState(false);
  const petImport = usePetImport({
    strings: {
      chooseFoldersTitle: t("chooseFolders"),
      chooseZipTitle: t("chooseZip"),
      skippedPackages: (count) =>
        t("petImportSkipped").replace("{count}", String(count)),
      zipFilterName: t("chooseZip"),
    },
  });

  const previewByPreviewId = useMemo(
    () =>
      new Map(
        petImport.previews.map((preview) => [preview.previewId, preview]),
      ),
    [petImport.previews],
  );

  const petCardStrings = useMemo(
    () => ({
      backToTop: t("backToTop"),
      currentPet: t("currentPet"),
      customBadge: t("customBadge"),
      remove: t("removePreview"),
      selectPreview: t("selectPreviewPet"),
    }),
    [t],
  );

  const runImportAction = async (
    action: () => Promise<{ errorMessage: string | null }>,
  ) => {
    const result = await action();
    if (result.errorMessage) {
      toast.error(result.errorMessage);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }

    if (petImport.isCommitting) {
      return;
    }

    void petImport.closeSession().then((closed) => {
      if (closed) {
        setShowLocalChoices(false);
        onOpenChange(false);
      }
    });
  };

  const previewPets = petImport.previews.map((preview) => ({
    ...preview.summary,
    id: preview.previewId,
  }));
  const hasPreviews = previewPets.length > 0;

  return (
    <Drawer
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      closeDisabled={petImport.isCommitting}
      closeLabel={t("close")}
      onOpenChange={handleOpenChange}
      open={open}
    >
      <DrawerHeader>
        <DrawerTitle id={titleId}>{t("importPets")}</DrawerTitle>
        <DrawerDescription id={descriptionId}>
          {t("importPetsHint")}
        </DrawerDescription>
      </DrawerHeader>
      <DrawerBody style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="pet-import-actions">
          <Button
            disabled={petImport.isBusy}
            onClick={() => void runImportAction(petImport.previewCodex)}
            type="button"
            variant="outline"
          >
            <PackageOpen aria-hidden="true" />
            {t("fromCodex")}
          </Button>
          <Button
            aria-expanded={showLocalChoices}
            disabled={petImport.isBusy}
            onClick={() => setShowLocalChoices((current) => !current)}
            type="button"
            variant="outline"
          >
            <FolderOpen aria-hidden="true" />
            {t("fromFolders")}
          </Button>
        </div>

        {showLocalChoices ? (
          <div className="pet-import-local-actions">
            <Button
              disabled={petImport.isBusy}
              onClick={() => void runImportAction(petImport.previewFolders)}
              type="button"
              variant="outline"
            >
              <FolderOpen aria-hidden="true" />
              {t("chooseFolders")}
            </Button>
            <Button
              disabled={petImport.isBusy}
              onClick={() => void runImportAction(petImport.previewZips)}
              type="button"
              variant="outline"
            >
              <Upload aria-hidden="true" />
              {t("chooseZip")}
            </Button>
          </div>
        ) : null}

        {hasPreviews ? (
          <div className="pet-import-toolbar">
            <div className="pet-import-toolbar-main">
              <Button
                disabled={petImport.isBusy}
                onClick={petImport.selectAll}
                size="sm"
                type="button"
                variant="outline"
              >
                {t("selectAll")}
              </Button>
              <span aria-live="polite">
                {t("selectedPreviewCount").replace(
                  "{count}",
                  String(petImport.selectedCount),
                )}
              </span>
            </div>
            <div className="pet-import-toolbar-actions">
              <Button
                disabled={petImport.isBusy || petImport.selectedCount === 0}
                onClick={() => void runImportAction(petImport.importSelected)}
                size="sm"
                type="button"
              >
                {t("importSelected")}
              </Button>
              <Button
                disabled={petImport.isBusy || !hasPreviews}
                onClick={() => void runImportAction(petImport.importAll)}
                size="sm"
                type="button"
                variant="outline"
              >
                {t("importAll")}
              </Button>
            </div>
          </div>
        ) : null}

        {petImport.errors.length > 0 ? (
          <ul className="pet-import-errors" role="alert">
            {petImport.errors.map((error, index) => (
              <li key={`${error}-${index}`}>{error}</li>
            ))}
          </ul>
        ) : null}

        <div
          style={{
            display: "flex",
            flex: "1 1 auto",
            minHeight: 180,
            minWidth: 0,
            width: "100%",
          }}
        >
          <PetPackageGrid
            emptyTitle={t("previewImportsEmpty")}
            pets={previewPets}
            renderSecondaryText={(pet) => {
              const preview = previewByPreviewId.get(pet.id);
              return preview
                ? `${preview.sourceLabel} · ${preview.intendedPetId}`
                : pet.description;
            }}
            strings={petCardStrings}
            cardProps={(pet: PetSummary) => {
              const preview = previewByPreviewId.get(pet.id);
              return {
                busy: petImport.isBusy,
                checked: preview
                  ? petImport.selectedPreviewIds.has(preview.previewId)
                  : false,
                mode: "preview",
                onRemove: preview
                  ? () => petImport.removePreview(preview.previewId)
                  : undefined,
                onToggleChecked: preview
                  ? () => petImport.togglePreview(preview.previewId)
                  : undefined,
              };
            }}
          />
        </div>
      </DrawerBody>
    </Drawer>
  );
}
