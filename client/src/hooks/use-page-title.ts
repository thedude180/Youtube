import { useEffect } from "react";

function setMetaContent(selector: string, content: string) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute("content", content);
}

function getMetaContent(selector: string): string {
  return document.querySelector(selector)?.getAttribute("content") || "";
}

function ensureLink(rel: string): HTMLLinkElement {
  let link = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }
  return link;
}

export function usePageTitle(title: string, description?: string) {
  useEffect(() => {
    const prev = document.title;
    const prevDesc = getMetaContent('meta[name="description"]');
    const prevOgTitle = getMetaContent('meta[property="og:title"]');
    const prevOgDesc = getMetaContent('meta[property="og:description"]');
    const prevOgUrl = getMetaContent('meta[property="og:url"]');

    document.title = title ? `${title} | CreatorOS` : "CreatorOS — Your Entire YouTube Team In A Box";

    if (description) {
      setMetaContent('meta[name="description"]', description);
      setMetaContent('meta[property="og:description"]', description);
    }
    setMetaContent('meta[property="og:title"]', document.title);

    const currentUrl = window.location.href;
    setMetaContent('meta[property="og:url"]', currentUrl);

    const canonical = ensureLink("canonical");
    const prevCanonical = canonical.href;
    canonical.href = currentUrl;

    return () => {
      document.title = prev;
      if (prevDesc) setMetaContent('meta[name="description"]', prevDesc);
      if (prevOgTitle) setMetaContent('meta[property="og:title"]', prevOgTitle);
      if (prevOgDesc) setMetaContent('meta[property="og:description"]', prevOgDesc);
      if (prevOgUrl) setMetaContent('meta[property="og:url"]', prevOgUrl);
      if (prevCanonical) canonical.href = prevCanonical;
    };
  }, [title, description]);
}
