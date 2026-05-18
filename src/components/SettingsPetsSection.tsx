import { open } from "@tauri-apps/plugin-dialog";
import {
  Check,
  ChevronUp,
  Import,
  LocateFixed,
  PawPrint,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ChangeEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import { Virtuoso } from "react-virtuoso";
import type { VirtuosoHandle } from "react-virtuoso";
import { toast } from "sonner";

import type { AppState, PetSummary } from "../lib/appTypes";
import {
  refreshListMinimumLoadingMs,
  wait,
} from "../lib/petWindowUi";
import { PetSprite } from "./PetSprite";
import { Button } from "./ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./ui/empty";

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
  const [pendingScrollPetId, setPendingScrollPetId] = useState<string | null>(
    null,
  );
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  useEffect(() => {
    if (!pendingScrollPetId) {
      return;
    }
    const index = installedPets.findIndex(
      (pet) => pet.id === pendingScrollPetId,
    );
    if (index === -1) {
      setPendingScrollPetId(null);
      return;
    }
    virtuosoRef.current?.scrollToIndex({
      index: Math.floor(index / 3),
      align: "center",
      behavior: "smooth",
    });
    setPendingScrollPetId(null);
  }, [pendingScrollPetId, installedPets]);

  const petCardStrings = useMemo(
    () => ({
      currentPet: t("currentPet"),
      customBadge: t("customBadge"),
      remove: t("remove"),
    }),
    [t],
  );

  const scrollPetListToTop = () => {
    virtuosoRef.current?.scrollToIndex({ index: 0, behavior: "smooth" });
  };

  const scrollToCurrentPet = () => {
    const index = installedPets.findIndex((pet) => pet.id === currentPetId);
    if (index === -1) {
      return;
    }
    virtuosoRef.current?.scrollToIndex({
      index: Math.floor(index / 3),
      align: "center",
      behavior: "smooth",
    });
  };

  const activePetList = useMemo(() => {
    if (installedPets.length === 0) {
      return (
        <div className="pet-list-region">
          <Empty>
            <EmptyHeader>
              <EmptyMedia>
                <PawPrint aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>{t("noInstalledPets")}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </div>
      );
    }

    const rows: PetSummary[][] = [];
    for (let i = 0; i < installedPets.length; i += 3) {
      rows.push(installedPets.slice(i, i + 3));
    }

    return (
      <div className="pet-list-region">
        <Virtuoso
          className="pet-virtuoso"
          data={rows}
          itemContent={(_index, row) => (
            <div className="pet-grid">
              {row.map((pet) => {
                const active = pet.id === currentPetId;
                return (
                  <PetPackageCard
                    active={active}
                    busy={petBusyId === pet.id || isSelecting}
                    key={pet.id}
                    onRemovePet={removePet}
                    onSelectPet={selectPet}
                    pet={pet}
                    strings={petCardStrings}
                  />
                );
              })}
            </div>
          )}
          ref={virtuosoRef}
        />
        <Button
          aria-label={t("backToTop")}
          className="pet-list-back-to-top"
          onClick={scrollPetListToTop}
          size="icon"
          title={t("backToTop")}
          type="button"
          variant="outline"
        >
          <ChevronUp aria-hidden="true" />
        </Button>
        <Button
          aria-label={t("locateCurrent")}
          className="pet-list-locate-current"
          onClick={scrollToCurrentPet}
          size="icon"
          title={t("locateCurrent")}
          type="button"
          variant="outline"
        >
          <LocateFixed aria-hidden="true" />
        </Button>
      </div>
    );
  }, [
    currentPetId,
    installedPets,
    isSelecting,
    petBusyId,
    petCardStrings,
    removePet,
    selectPet,
    t,
  ]);

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

    const nextCurrentPetId = result.state?.currentPetId;
    if (nextCurrentPetId) {
      setPendingScrollPetId(nextCurrentPetId);
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
      toast.error(result.errorMessage);
      return;
    }

    const nextCurrentPetId = result.state?.currentPetId;
    if (nextCurrentPetId) {
      setPendingScrollPetId(nextCurrentPetId);
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

      {activePetList}
    </div>
  );
}

function PetPackageCard({
  active,
  busy,
  onRemovePet,
  onSelectPet,
  pet,
  strings,
}: {
  active: boolean;
  busy: boolean;
  onRemovePet: (pet: PetSummary) => Promise<void>;
  onSelectPet: (pet: PetSummary) => Promise<void>;
  pet: PetSummary;
  strings: {
    currentPet: string;
    customBadge: string;
    remove: string;
  };
}) {
  const handleMainClick = () => {
    void onSelectPet(pet);
  };

  const stopActionClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  return (
    <article className="pet-card" data-active={active} data-pet-id={pet.id}>
      <div className="pet-card-top-actions">
        {active ? (
          <span
            className="pet-card-pill pet-card-status pet-card-current-status"
            title={strings.currentPet}
          >
            <Check aria-hidden="true" />
          </span>
        ) : null}
        {!active && !pet.builtIn ? (
          <button
            className="pet-card-pill pet-card-action"
            disabled={busy}
            onClick={(event) => {
              stopActionClick(event);
              void onRemovePet(pet);
            }}
            title={strings.remove}
            type="button"
          >
            <Trash2 aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <button
        aria-label={pet.displayName}
        className="pet-card-main"
        disabled={busy}
        onClick={handleMainClick}
        type="button"
      >
        <span className="pet-card-id">{pet.slug}</span>
        <span className="pet-card-preview">
          <PetSprite
            pet={pet}
            composed={{
              bodySpriteRow: active ? "waving" : "idle",
              emotionOverlay: null,
              dragging: false,
            }}
            scale={0.34}
          />
        </span>
        <span className="pet-card-copy">
          <span className="pet-card-name">
            <span className="pet-card-name-text">{pet.displayName}</span>
            {!pet.builtIn ? (
              <span
                className="pet-card-custom-badge"
                data-testid="pet-card-custom-badge"
              >
                {strings.customBadge}
              </span>
            ) : null}
          </span>
          <span className="pet-card-description">{pet.description}</span>
        </span>
      </button>
    </article>
  );
}
