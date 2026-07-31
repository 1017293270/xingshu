export type VitePreloadRecoveryOptions = {
  buildId: string;
  reload: () => void;
  storage: Storage;
  target: EventTarget;
};

export function installVitePreloadRecovery({
  buildId,
  reload,
  storage,
  target
}: VitePreloadRecoveryOptions) {
  const recoveryKey = `xingshu:preload-recovery:${buildId}`;
  let reloadRequested = false;

  const handlePreloadError: EventListener = (event) => {
    event.preventDefault();

    if (reloadRequested || storage.getItem(recoveryKey) === "attempted") {
      return;
    }

    reloadRequested = true;
    storage.setItem(recoveryKey, "attempted");
    reload();
  };

  target.addEventListener("vite:preloadError", handlePreloadError);

  return () => {
    target.removeEventListener("vite:preloadError", handlePreloadError);
  };
}
