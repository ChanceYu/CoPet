import { Toaster as SonnerToaster } from "sonner";
import type { ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      position="top-center"
      toastOptions={{
        classNames: {
          toast: "ui-sonner-toast",
          title: "ui-sonner-title",
          description: "ui-sonner-description",
          icon: "ui-sonner-icon",
          closeButton: "ui-sonner-close",
        },
      }}
      {...props}
    />
  );
}
