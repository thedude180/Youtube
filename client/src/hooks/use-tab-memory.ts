import { useState, useCallback } from "react";

export function useTabMemory<T extends string>(pageKey: string, defaultTab: T, validTabs: T[]): [T, (tab: T) => void] {
  const [tab, setTabState] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(`tab-${pageKey}`);
      if (stored && validTabs.includes(stored as T)) return stored as T;
    } catch {}
    return defaultTab;
  });

  const setTab = useCallback((newTab: T) => {
    setTabState(newTab);
    try { sessionStorage.setItem(`tab-${pageKey}`, newTab); } catch {}
  }, [pageKey]);

  return [tab, setTab];
}
