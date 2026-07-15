import { AlertCircle, RefreshCw } from "lucide-react";

export function LoadingView({ embedded = false }: { embedded?: boolean } = {}) {
  const Shell = embedded ? "div" : "main";
  return (
    <Shell className="app-shell loading-shell">
      <RefreshCw className="spin" aria-hidden="true" />
    </Shell>
  );
}

export function ErrorView({
  retryLabel = "Retry",
  message,
  onRetry,
  embedded = false,
}: {
  retryLabel?: string;
  message?: string;
  onRetry: () => void;
  embedded?: boolean;
}) {
  const Shell = embedded ? "div" : "main";
  return (
    <Shell className="app-shell error-shell">
      <AlertCircle aria-hidden="true" />
      {message ? <p>{message}</p> : null}
      <button
        aria-label={retryLabel}
        className="icon-button"
        onClick={onRetry}
        type="button"
      >
        <RefreshCw aria-hidden="true" />
      </button>
    </Shell>
  );
}
