import { useEffect, useRef } from "react";

interface UsePWAUpdateOptions {
  onUpdateFound: () => void;
}

export function usePWAUpdate(
  registration: ServiceWorkerRegistration | null,
  { onUpdateFound }: UsePWAUpdateOptions,
) {
  // Capture whether a SW was already controlling the page at mount time.
  // If null -> first install, not an update.
  const hadController = useRef(
    typeof navigator !== "undefined" && !!navigator.serviceWorker?.controller,
  );
  const notifiedRef = useRef(false);
  const reloadingRef = useRef(false);

  useEffect(() => {
    if (!registration) return;

    const notifyUpdateReady = () => {
      if (!hadController.current || notifiedRef.current) return;
      notifiedRef.current = true;
      onUpdateFound();
    };

    if (registration.waiting) {
      notifyUpdateReady();
    }

    let installingWorker: ServiceWorker | null = null;
    let removeInstallingListener: (() => void) | undefined;

    const handleUpdateFound = () => {
      if (!hadController.current) return;

      removeInstallingListener?.();
      installingWorker = registration.installing;
      if (!installingWorker) {
        if (registration.waiting) notifyUpdateReady();
        return;
      }

      const handleStateChange = () => {
        if (installingWorker?.state === "installed" || installingWorker?.state === "activated") {
          notifyUpdateReady();
        }
      };

      installingWorker.addEventListener("statechange", handleStateChange);
      removeInstallingListener = () => {
        installingWorker?.removeEventListener("statechange", handleStateChange);
      };
      handleStateChange();
    };

    registration.addEventListener("updatefound", handleUpdateFound);

    const handleControllerChange = () => {
      if (!hadController.current) {
        hadController.current = true;
        return;
      }
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    return () => {
      registration.removeEventListener("updatefound", handleUpdateFound);
      removeInstallingListener?.();
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, [registration, onUpdateFound]);

  return {
    checkForUpdate: () => registration?.update(),
  };
}
