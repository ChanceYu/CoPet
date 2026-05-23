import { AlertCircle, RefreshCw } from "lucide-react";

export function LoadingView() {
  return (
    <main className="app-shell loading-shell">
      <RefreshCw className="spin" aria-hidden="true" />
    </main>
  );
}

export function ErrorView({
  retryLabel = "Retry",
  message,
  onRetry,
}: {
  retryLabel?: string;
  message?: string;
  onRetry: () => void;
}) {
  return (
    <main className="app-shell error-shell">
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
    </main>
  );
}
