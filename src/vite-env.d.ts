/// <reference types="vite/client" />

import "react";

declare global {
  const __APP_VERSION__: string;
}

declare module "react" {
  interface InputHTMLAttributes<T> {
    directory?: string;
    webkitdirectory?: string;
  }
}
