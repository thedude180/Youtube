import { lazy } from "react";

function isChunkError(error: any): boolean {
  const msg = error?.message || "";
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("Loading chunk") ||
    msg.includes("Loading CSS chunk") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("Unable to preload CSS")
  );
}

export function lazyRetry<T extends { default: any }>(factory: () => Promise<T>): ReturnType<typeof lazy> {
  return lazy(() =>
    factory().catch((err: any) => {
      if (!isChunkError(err)) throw err;

      const key = "chunk_reload_ts";
      const lastReload = sessionStorage.getItem(key);
      const now = Date.now();
      if (!lastReload || now - Number(lastReload) > 10000) {
        sessionStorage.setItem(key, String(now));
        window.location.reload();
        return new Promise(() => {});
      }
      sessionStorage.removeItem(key);
      throw err;
    })
  );
}

export { isChunkError };
