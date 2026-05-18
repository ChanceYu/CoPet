const pethoverDevLogEnabled = import.meta.env.DEV;

export function pethoverDevLog(stage: string, payload: unknown) {
  if (!pethoverDevLogEnabled) {
    return;
  }

  console.debug(`[pethover:${stage}]`, payload);
}
