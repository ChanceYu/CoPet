import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  commitPetImportPreviews,
  createPetImportSession,
  discardPetImportPreviews,
  getDownloadsDir,
  previewCodexPetImports,
  previewPetImportFolders,
  previewPetImportZips,
} from "../lib/appCommands";
import type {
  PetImportPreview,
  PetImportPreviewBatch,
  PetImportSession,
} from "../lib/appTypes";

const CHOOSE_FOLDERS_TITLE = "Choose folders";
const CHOOSE_ZIP_TITLE = "Choose zip";
const SKIPPED_INVALID_PACKAGES = "Skipped invalid packages";

type PetImportActionResult = { errorMessage: string | null };

type PetImportSessionResult = {
  errorMessage: string | null;
  session: PetImportSession | null;
};

type PetImportOperation = {
  generation: number;
  id: number;
};

export type PetImportStrings = {
  busy: string;
  chooseFoldersTitle: string;
  chooseZipTitle: string;
  createSessionFailed: string;
  dialogOpenFailed: string;
  importFailed: string;
  previewCodexFailed: string;
  previewFoldersFailed: string;
  previewZipsFailed: string;
  skippedPackages: (count: number) => string;
  zipFilterName: string;
};

export type UsePetImportOptions = {
  strings?: Partial<PetImportStrings>;
};

const defaultStrings: PetImportStrings = {
  busy: "Import is already in progress.",
  chooseFoldersTitle: CHOOSE_FOLDERS_TITLE,
  chooseZipTitle: CHOOSE_ZIP_TITLE,
  createSessionFailed: "Could not create import session.",
  dialogOpenFailed: "Could not open the file picker.",
  importFailed: "Could not import pets.",
  previewCodexFailed: "Could not preview Codex pets.",
  previewFoldersFailed: "Could not preview folders.",
  previewZipsFailed: "Could not preview zip files.",
  skippedPackages: (count) => `${SKIPPED_INVALID_PACKAGES}: ${count}`,
  zipFilterName: "Zip archives",
};

function normalizeDialogPaths(value: string | string[] | null): string[] {
  if (Array.isArray(value)) {
    return value;
  }
  return typeof value === "string" ? [value] : [];
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type PreviewState = {
  previews: PetImportPreview[];
  selectedPreviewIds: Set<string>;
};

export function usePetImport(options: UsePetImportOptions = {}) {
  const strings = useMemo(
    () => ({ ...defaultStrings, ...options.strings }),
    [options.strings],
  );
  const [session, setSession] = useState<PetImportSession | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>(() => ({
    previews: [],
    selectedPreviewIds: new Set(),
  }));
  const [errors, setErrors] = useState<string[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const sessionRef = useRef<PetImportSession | null>(null);
  const sessionPromiseRef = useRef<Promise<PetImportSessionResult> | null>(null);
  const previewStateRef = useRef<PreviewState>({
    previews: [],
    selectedPreviewIds: new Set(),
  });
  const generationRef = useRef(0);
  const nextOperationIdRef = useRef(0);
  const activeOperationIdsRef = useRef(new Set<number>());
  const discardedSessionIdsRef = useRef(new Set<string>());

  const { previews, selectedPreviewIds } = previewState;
  const selectedCount = selectedPreviewIds.size;

  const setSessionState = useCallback((nextSession: PetImportSession | null) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
  }, []);

  const setPreviewStateSafely = useCallback(
    (updater: (current: PreviewState) => PreviewState) => {
      const next = updater(previewStateRef.current);
      previewStateRef.current = {
        previews: next.previews,
        selectedPreviewIds: new Set(next.selectedPreviewIds),
      };
      setPreviewState({
        previews: next.previews,
        selectedPreviewIds: new Set(next.selectedPreviewIds),
      });
    },
    [],
  );

  const appendErrors = useCallback((messages: string[]) => {
    if (messages.length === 0) {
      return;
    }
    setErrors((current) => [...current, ...messages]);
  }, []);

  const isOperationCurrent = useCallback((operation: PetImportOperation) => {
    return (
      generationRef.current === operation.generation &&
      activeOperationIdsRef.current.has(operation.id)
    );
  }, []);

  const discardSessionBestEffort = useCallback(
    async (targetSession: PetImportSession) => {
      if (discardedSessionIdsRef.current.has(targetSession.sessionId)) {
        return;
      }
      discardedSessionIdsRef.current.add(targetSession.sessionId);
      await discardPetImportPreviews(targetSession.sessionId);
    },
    [],
  );

  const beginOperation = useCallback((): PetImportOperation | null => {
    if (activeOperationIdsRef.current.size > 0) {
      appendErrors([strings.busy]);
      return null;
    }

    const operation = {
      generation: generationRef.current,
      id: ++nextOperationIdRef.current,
    };
    activeOperationIdsRef.current.add(operation.id);
    setIsBusy(true);
    return operation;
  }, [appendErrors, strings.busy]);

  const finishOperation = useCallback((operation: PetImportOperation) => {
    activeOperationIdsRef.current.delete(operation.id);
    setIsBusy(activeOperationIdsRef.current.size > 0);
  }, []);

  const ensureSession = useCallback(
    async (operation: PetImportOperation) => {
      if (sessionRef.current) {
        return sessionRef.current;
      }

      if (!sessionPromiseRef.current) {
        sessionPromiseRef.current = createPetImportSession().finally(() => {
          sessionPromiseRef.current = null;
        });
      }

      const result = await sessionPromiseRef.current;
      if (!isOperationCurrent(operation)) {
        if (result.session) {
          await discardSessionBestEffort(result.session);
        }
        return null;
      }

      if (result.errorMessage || !result.session) {
        appendErrors([result.errorMessage ?? strings.createSessionFailed]);
        return null;
      }

      setSessionState(result.session);
      return result.session;
    },
    [
      appendErrors,
      discardSessionBestEffort,
      isOperationCurrent,
      setSessionState,
      strings.createSessionFailed,
    ],
  );

  const runOperation = useCallback(
    async (
      action: (operation: PetImportOperation) => Promise<void>,
    ): Promise<PetImportActionResult> => {
      const operation = beginOperation();
      if (!operation) {
        return { errorMessage: strings.busy };
      }

      try {
        await action(operation);
        return { errorMessage: null };
      } catch (error) {
        const message = toMessage(error);
        if (isOperationCurrent(operation)) {
          appendErrors([message]);
        }
        return { errorMessage: message };
      } finally {
        finishOperation(operation);
      }
    },
    [
      appendErrors,
      beginOperation,
      finishOperation,
      isOperationCurrent,
      strings.busy,
    ],
  );

  const applyBatch = useCallback(
    (operation: PetImportOperation, batch: PetImportPreviewBatch) => {
      if (!isOperationCurrent(operation)) {
        return;
      }

      setPreviewStateSafely((current) => {
        const existingIds = new Set(
          current.previews.map((preview) => preview.previewId),
        );
        const nextPreviews = [...current.previews];
        const nextSelectedIds = new Set(current.selectedPreviewIds);

        for (const preview of batch.previews) {
          if (existingIds.has(preview.previewId)) {
            continue;
          }
          existingIds.add(preview.previewId);
          nextPreviews.push(preview);
          if (preview.selectedByDefault) {
            nextSelectedIds.add(preview.previewId);
          }
        }

        return { previews: nextPreviews, selectedPreviewIds: nextSelectedIds };
      });

      appendErrors([
        ...batch.errors,
        ...(batch.skipped > 0 ? [strings.skippedPackages(batch.skipped)] : []),
      ]);
    },
    [appendErrors, isOperationCurrent, setPreviewStateSafely, strings],
  );

  const previewCodex = useCallback(async () => {
    return runOperation(async (operation) => {
      const activeSession = await ensureSession(operation);
      if (!activeSession || !isOperationCurrent(operation)) {
        return;
      }

      const result = await previewCodexPetImports(activeSession.sessionId);
      if (!isOperationCurrent(operation)) {
        return;
      }
      if (result.errorMessage || !result.batch) {
        appendErrors([result.errorMessage ?? strings.previewCodexFailed]);
        return;
      }

      applyBatch(operation, result.batch);
    });
  }, [
    appendErrors,
    applyBatch,
    ensureSession,
    isOperationCurrent,
    runOperation,
    strings.previewCodexFailed,
  ]);

  const previewFolders = useCallback(async () => {
    return runOperation(async (operation) => {
      let selectedPaths: string[];
      try {
        const defaultPath = await getDownloadsDir();
        if (!isOperationCurrent(operation)) {
          return;
        }

        selectedPaths = normalizeDialogPaths(
          await open({
            canCreateDirectories: false,
            defaultPath: defaultPath ?? undefined,
            directory: true,
            multiple: true,
            title: strings.chooseFoldersTitle,
          }),
        );
      } catch (error) {
        if (isOperationCurrent(operation)) {
          appendErrors([
            `${strings.dialogOpenFailed} ${toMessage(error)}`,
          ]);
        }
        return;
      }

      if (selectedPaths.length === 0 || !isOperationCurrent(operation)) {
        return;
      }

      const activeSession = await ensureSession(operation);
      if (!activeSession || !isOperationCurrent(operation)) {
        return;
      }

      const result = await previewPetImportFolders(
        activeSession.sessionId,
        selectedPaths,
      );
      if (!isOperationCurrent(operation)) {
        return;
      }
      if (result.errorMessage || !result.batch) {
        appendErrors([result.errorMessage ?? strings.previewFoldersFailed]);
        return;
      }

      applyBatch(operation, result.batch);
    });
  }, [
    appendErrors,
    applyBatch,
    ensureSession,
    isOperationCurrent,
    runOperation,
    strings.chooseFoldersTitle,
    strings.dialogOpenFailed,
    strings.previewFoldersFailed,
  ]);

  const previewZips = useCallback(async () => {
    return runOperation(async (operation) => {
      let selectedPaths: string[];
      try {
        const defaultPath = await getDownloadsDir();
        if (!isOperationCurrent(operation)) {
          return;
        }

        selectedPaths = normalizeDialogPaths(
          await open({
            canCreateDirectories: false,
            defaultPath: defaultPath ?? undefined,
            directory: false,
            filters: [{ extensions: ["zip"], name: strings.zipFilterName }],
            multiple: true,
            title: strings.chooseZipTitle,
          }),
        );
      } catch (error) {
        if (isOperationCurrent(operation)) {
          appendErrors([
            `${strings.dialogOpenFailed} ${toMessage(error)}`,
          ]);
        }
        return;
      }

      if (selectedPaths.length === 0 || !isOperationCurrent(operation)) {
        return;
      }

      const activeSession = await ensureSession(operation);
      if (!activeSession || !isOperationCurrent(operation)) {
        return;
      }

      const result = await previewPetImportZips(
        activeSession.sessionId,
        selectedPaths,
      );
      if (!isOperationCurrent(operation)) {
        return;
      }
      if (result.errorMessage || !result.batch) {
        appendErrors([result.errorMessage ?? strings.previewZipsFailed]);
        return;
      }

      applyBatch(operation, result.batch);
    });
  }, [
    appendErrors,
    applyBatch,
    ensureSession,
    isOperationCurrent,
    runOperation,
    strings.chooseZipTitle,
    strings.dialogOpenFailed,
    strings.previewZipsFailed,
    strings.zipFilterName,
  ]);

  const commitPreviews = useCallback(
    async (previewIds: string[]) => {
      return runOperation(async (operation) => {
        const activeSession = sessionRef.current;
        if (!activeSession || previewIds.length === 0) {
          return;
        }

        const result = await commitPetImportPreviews(
          activeSession.sessionId,
          previewIds,
        );
        if (!isOperationCurrent(operation)) {
          return;
        }
        if (result.errorMessage || !result.result) {
          appendErrors([result.errorMessage ?? strings.importFailed]);
          return;
        }

        const failedPreviewIds = new Set(
          result.result.failed.map((failure) => failure.previewId),
        );
        const committedPreviewIds = new Set(
          previewIds.filter((previewId) => !failedPreviewIds.has(previewId)),
        );

        setPreviewStateSafely((current) => {
          const nextSelectedIds = new Set(current.selectedPreviewIds);
          for (const previewId of committedPreviewIds) {
            nextSelectedIds.delete(previewId);
          }
          return {
            previews: current.previews.filter(
              (preview) => !committedPreviewIds.has(preview.previewId),
            ),
            selectedPreviewIds: nextSelectedIds,
          };
        });
        appendErrors(
          result.result.failed.map(
            (failure) => `${failure.previewId}: ${failure.errorMessage}`,
          ),
        );
      });
    },
    [
      appendErrors,
      isOperationCurrent,
      runOperation,
      setPreviewStateSafely,
      strings.importFailed,
    ],
  );

  const importSelected = useCallback(async () => {
    return commitPreviews(Array.from(previewStateRef.current.selectedPreviewIds));
  }, [commitPreviews]);

  const importAll = useCallback(async () => {
    return commitPreviews(
      previewStateRef.current.previews.map((preview) => preview.previewId),
    );
  }, [commitPreviews]);

  const removePreview = useCallback(
    (previewId: string) => {
      setPreviewStateSafely((current) => {
        const nextSelectedIds = new Set(current.selectedPreviewIds);
        nextSelectedIds.delete(previewId);
        return {
          previews: current.previews.filter(
            (preview) => preview.previewId !== previewId,
          ),
          selectedPreviewIds: nextSelectedIds,
        };
      });
    },
    [setPreviewStateSafely],
  );

  const togglePreview = useCallback(
    (previewId: string) => {
      setPreviewStateSafely((current) => {
        const next = new Set(current.selectedPreviewIds);
        if (next.has(previewId)) {
          next.delete(previewId);
        } else {
          next.add(previewId);
        }
        return { ...current, selectedPreviewIds: next };
      });
    },
    [setPreviewStateSafely],
  );

  const selectAll = useCallback(() => {
    setPreviewStateSafely((current) => ({
      ...current,
      selectedPreviewIds: new Set(
        current.previews.map((preview) => preview.previewId),
      ),
    }));
  }, [setPreviewStateSafely]);

  const clearError = useCallback(() => {
    setErrors([]);
  }, []);

  const closeSession = useCallback(async () => {
    generationRef.current += 1;
    activeOperationIdsRef.current.clear();
    setIsBusy(false);

    const activeSession = sessionRef.current;
    const pendingSession = sessionPromiseRef.current;
    setSessionState(null);
    setPreviewStateSafely(() => ({
      previews: [],
      selectedPreviewIds: new Set(),
    }));
    setErrors([]);

    if (activeSession) {
      await discardSessionBestEffort(activeSession);
    }

    if (pendingSession) {
      const result = await pendingSession;
      if (result.session) {
        await discardSessionBestEffort(result.session);
      }
    }
  }, [discardSessionBestEffort, setPreviewStateSafely, setSessionState]);

  return useMemo(
    () => ({
      clearError,
      closeSession,
      errors,
      importAll,
      importSelected,
      isBusy,
      previewCodex,
      previewFolders,
      previewZips,
      previews,
      removePreview,
      selectAll,
      selectedCount,
      selectedPreviewIds: new Set(selectedPreviewIds),
      session,
      togglePreview,
    }),
    [
      clearError,
      closeSession,
      errors,
      importAll,
      importSelected,
      isBusy,
      previewCodex,
      previewFolders,
      previewZips,
      previews,
      removePreview,
      selectAll,
      selectedCount,
      selectedPreviewIds,
      session,
      togglePreview,
    ],
  );
}
