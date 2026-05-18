import { AlertCircle, RefreshCw } from "lucide-react";

export function LoadingView() {
  return (
    <main className="app-shell loading-shell">
      <RefreshCw className="spin" aria-hidden="true" />
    </main>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="app-shell error-shell">
      <AlertCircle aria-hidden="true" />
      <p>{message}</p>
      <button className="icon-button" type="button" onClick={onRetry} aria-label="Refresh">
        <RefreshCw aria-hidden="true" />
      </button>
    </main>
  );
}
