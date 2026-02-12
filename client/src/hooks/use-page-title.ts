import { useEffect } from "react";

export function usePageTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} | CreatorOS` : "CreatorOS";
    return () => { document.title = prev; };
  }, [title]);
}
