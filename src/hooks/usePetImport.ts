import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  commitPetImportPreviews,
  createPetImportSession,
  discardPetImportPreviews,
  getDownloadsDir,
  previewCodexPetImports,
  previewPetImportFolders,
} from "../lib/appCommands";
import type {
  PetImportPreview,
  PetImportPreviewBatch,
  PetImportSession,
} from "../lib/appTypes";

const CHOOSE_FOLDERS_TITLE = "Choose folders";
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

type PetImportOperationHooks = {
  after?: (operation: PetImportOperation) => void;
  before?: (operation: PetImportOperation) => void;
};

type PetImportSessionPromise = {
  generation: number;
  promise: Promise<PetImportSessionResult>;
};

export type PetImportStrings = {
  busy: string;
  chooseFoldersTitle: string;
  createSessionFailed: string;
  dialogOpenFailed: string;
  importFailed: string;
  previewCodexFailed: string;
  previewFoldersFailed: string;
  skippedPackages: (count: number) => string;
};

export type UsePetImportOptions = {
  strings?: Partial<PetImportStrings>;
};

const defaultStrings: PetImportStrings = {
  busy: "Import is already in progress.",
  chooseFoldersTitle: CHOOSE_FOLDERS_TITLE,
  createSessionFailed: "Could not create import session.",
  dialogOpenFailed: "Could not open the file picker.",
  importFailed: "Could not import pets.",
  previewCodexFailed: "Could not preview Codex pets.",
  previewFoldersFailed: "Could not preview folders.",
  skippedPackages: (count) => `${SKIPPED_INVALID_PACKAGES}: ${count}`,
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
  const [isCommitting, setIsCommitting] = useState(false);
  const sessionRef = useRef<PetImportSession | null>(null);
  const sessionPromiseRef = useRef<PetImportSessionPromise | null>(null);
  const previewStateRef = useRef<PreviewState>({
    previews: [],
    selectedPreviewIds: new Set(),
  });
  const generationRef = useRef(0);
  const nextOperationIdRef = useRef(0);
  const activeOperationIdsRef = useRef(new Set<number>());
  const commitOperationIdsRef = useRef(new Set<number>());
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
    async (operation: PetImportOperation): Promise<PetImportSessionResult> => {
      if (sessionRef.current) {
        return { errorMessage: null, session: sessionRef.current };
      }

      if (sessionPromiseRef.current?.generation !== operation.generation) {
        const sessionPromiseEntry: PetImportSessionPromise = {
          generation: operation.generation,
          promise: createPetImportSession(),
        };
        sessionPromiseEntry.promise.finally(() => {
          if (sessionPromiseRef.current === sessionPromiseEntry) {
            sessionPromiseRef.current = null;
          }
        });
        sessionPromiseRef.current = sessionPromiseEntry;
      }

      const sessionPromiseEntry = sessionPromiseRef.current;
      const result = await sessionPromiseEntry.promise;
      if (!isOperationCurrent(operation)) {
        if (result.session) {
          await discardSessionBestEffort(result.session);
        }
        return { errorMessage: null, session: null };
      }

      if (result.errorMessage || !result.session) {
        const message = result.errorMessage ?? strings.createSessionFailed;
        appendErrors([message]);
        return { errorMessage: message, session: null };
      }

      setSessionState(result.session);
      return { errorMessage: null, session: result.session };
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
      action: (operation: PetImportOperation) => Promise<string | null | void>,
      hooks: PetImportOperationHooks = {},
    ): Promise<PetImportActionResult> => {
      const operation = beginOperation();
      if (!operation) {
        return { errorMessage: strings.busy };
      }

      hooks.before?.(operation);
      try {
        const errorMessage = await action(operation);
        return { errorMessage: errorMessage ?? null };
      } catch (error) {
        const message = toMessage(error);
        if (isOperationCurrent(operation)) {
          appendErrors([message]);
        }
        return { errorMessage: message };
      } finally {
        hooks.after?.(operation);
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
      const sessionResult = await ensureSession(operation);
      if (sessionResult.errorMessage) {
        return sessionResult.errorMessage;
      }
      if (!sessionResult.session || !isOperationCurrent(operation)) {
        return null;
      }

      const result = await previewCodexPetImports(sessionResult.session.sessionId);
      if (!isOperationCurrent(operation)) {
        return null;
      }
      if (result.errorMessage || !result.batch) {
        const message = result.errorMessage ?? strings.previewCodexFailed;
        appendErrors([message]);
        return message;
      }

      applyBatch(operation, result.batch);
      return null;
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
        const message = `${strings.dialogOpenFailed} ${toMessage(error)}`;
        if (isOperationCurrent(operation)) {
          appendErrors([message]);
        }
        return message;
      }

      if (selectedPaths.length === 0 || !isOperationCurrent(operation)) {
        return null;
      }

      const sessionResult = await ensureSession(operation);
      if (sessionResult.errorMessage) {
        return sessionResult.errorMessage;
      }
      if (!sessionResult.session || !isOperationCurrent(operation)) {
        return null;
      }

      const result = await previewPetImportFolders(
        sessionResult.session.sessionId,
        selectedPaths,
      );
      if (!isOperationCurrent(operation)) {
        return null;
      }
      if (result.errorMessage || !result.batch) {
        const message = result.errorMessage ?? strings.previewFoldersFailed;
        appendErrors([message]);
        return message;
      }

      applyBatch(operation, result.batch);
      return null;
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

  const commitPreviews = useCallback(
    async (previewIds: string[]) => {
      return runOperation(async (operation) => {
        const activeSession = sessionRef.current;
        if (!activeSession || previewIds.length === 0) {
          return null;
        }

        const result = await commitPetImportPreviews(
          activeSession.sessionId,
          previewIds,
        );
        if (!isOperationCurrent(operation)) {
          return null;
        }
        if (result.errorMessage || !result.result) {
          const message = result.errorMessage ?? strings.importFailed;
          appendErrors([message]);
          return message;
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
        return null;
      }, {
        before: (operation) => {
          commitOperationIdsRef.current.add(operation.id);
          setIsCommitting(true);
        },
        after: (operation) => {
          commitOperationIdsRef.current.delete(operation.id);
          setIsCommitting(commitOperationIdsRef.current.size > 0);
        },
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

  const toggleAll = useCallback(() => {
    setPreviewStateSafely((current) => {
      const allSelected =
        current.previews.length > 0 &&
        current.selectedPreviewIds.size === current.previews.length;
      return {
        ...current,
        selectedPreviewIds: allSelected
          ? new Set()
          : new Set(current.previews.map((preview) => preview.previewId)),
      };
    });
  }, [setPreviewStateSafely]);

  const clearError = useCallback(() => {
    setErrors([]);
  }, []);

  const closeSession = useCallback(async (): Promise<boolean> => {
    if (commitOperationIdsRef.current.size > 0) {
      return false;
    }

    generationRef.current += 1;
    activeOperationIdsRef.current.clear();
    commitOperationIdsRef.current.clear();
    setIsBusy(false);
    setIsCommitting(false);

    const activeSession = sessionRef.current;
    const pendingSession = sessionPromiseRef.current;
    sessionPromiseRef.current = null;
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
      const result = await pendingSession.promise;
      if (result.session) {
        await discardSessionBestEffort(result.session);
      }
    }

    return true;
  }, [discardSessionBestEffort, setPreviewStateSafely, setSessionState]);

  return useMemo(
    () => ({
      clearError,
      closeSession,
      errors,
      importAll,
      importSelected,
      isCommitting,
      isBusy,
      previewCodex,
      previewFolders,
      previews,
      removePreview,
      selectedCount,
      selectedPreviewIds: new Set(selectedPreviewIds),
      session,
      toggleAll,
      togglePreview,
    }),
    [
      clearError,
      closeSession,
      errors,
      importAll,
      importSelected,
      isCommitting,
      isBusy,
      previewCodex,
      previewFolders,
      previews,
      removePreview,
      selectedCount,
      selectedPreviewIds,
      session,
      toggleAll,
      togglePreview,
    ],
  );
}
