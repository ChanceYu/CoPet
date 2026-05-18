import { Toaster as SonnerToaster } from "sonner";
import type { ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      position="top-center"
      richColors
      toastOptions={{
        classNames: {
          toast: "ui-sonner-toast",
        },
      }}
      {...props}
    />
  );
}
