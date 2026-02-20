import { lazy } from "react";

export function lazyRetry<T extends { default: any }>(factory: () => Promise<T>): ReturnType<typeof lazy> {
  return lazy(() =>
    factory().catch((err: any) => {
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
