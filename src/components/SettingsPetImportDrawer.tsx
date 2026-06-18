import { FolderOpen, PackageOpen } from "lucide-react";
import { useId, useMemo } from "react";
import { toast } from "sonner";

import { usePetImport } from "../hooks/usePetImport";
import type { PetSummary } from "../lib/appTypes";
import type { Translator } from "../lib/settingsTypes";
import { PetPackageGrid } from "./PetPackageGrid";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
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

const runImportAction = async (
  action: () => Promise<{ errorMessage: string | null }>,
) => {
  await action();
};

export function SettingsPetImportDrawer({
  onOpenChange,
  open,
  t,
}: SettingsPetImportDrawerProps) {
  const titleId = useId();
  const descriptionId = useId();
  const petImport = usePetImport({
    onError: (message) => toast.error(message),
    strings: {
      chooseFoldersTitle: t("chooseFolders"),
      skippedPackages: (count) =>
        t("petImportSkipped").replace("{count}", String(count)),
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
        onOpenChange(false);
      }
    });
  };

  const previewPets = petImport.previews.map((preview) => ({
    ...preview.summary,
    id: preview.previewId,
  }));
  const hasPreviews = previewPets.length > 0;
  const allPreviewsSelected =
    hasPreviews && petImport.selectedCount === petImport.previews.length;
  const codexButton = (
    <Button
      disabled={petImport.isBusy}
      onClick={() => void runImportAction(petImport.previewCodex)}
      size="sm"
      type="button"
      variant="outline"
    >
      <PackageOpen aria-hidden="true" />
      {t("fromCodex")}
    </Button>
  );

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
      <DrawerBody className="pet-import-drawer-body">
        <div className="pet-import-actions">
          <span
            className="pet-import-source-action"
          >
            {codexButton}
          </span>
          <Button
            disabled={petImport.isBusy}
            onClick={() => void runImportAction(petImport.previewFolders)}
            size="sm"
            type="button"
            variant="outline"
          >
            <FolderOpen aria-hidden="true" />
            {t("fromFolders")}
          </Button>
        </div>

        {hasPreviews ? (
          <div className="pet-import-toolbar">
            <div className="pet-import-toolbar-main">
              <Checkbox
                aria-label={t("selectAll")}
                checked={allPreviewsSelected}
                className="pet-import-select-all"
                disabled={petImport.isBusy}
                onCheckedChange={petImport.toggleAll}
              />
              <span aria-live="polite" className="pet-import-selected-count">
                {t("selectedPreviewCount").replace(
                  "{count}",
                  String(petImport.selectedCount),
                )}
              </span>
            </div>
            <div className="pet-import-toolbar-actions">
              <Button
                className="pet-import-primary-action"
                disabled={petImport.isBusy || petImport.selectedCount === 0}
                onClick={() => void runImportAction(petImport.importSelected)}
                size="sm"
                type="button"
              >
                {t("importSelected")}
              </Button>
              <Button
                className="pet-import-primary-action"
                disabled={petImport.isBusy || !hasPreviews}
                onClick={() => void runImportAction(petImport.importAll)}
                size="sm"
                type="button"
              >
                {t("importAll")}
              </Button>
            </div>
          </div>
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
              return preview?.summary.description ?? pet.description;
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
