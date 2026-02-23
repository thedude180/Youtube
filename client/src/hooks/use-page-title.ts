import { useEffect } from "react";
import i18n from "i18next";

const SUPPORTED_LOCALES = ["en", "es", "fr", "pt", "de", "ja", "ko", "zh", "ar", "hi", "ru", "it"];

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

function updateHreflangTags() {
  document.querySelectorAll('link[rel="alternate"][hreflang]').forEach((el) => el.remove());

  const baseUrl = window.location.origin;
  const path = window.location.pathname;

  SUPPORTED_LOCALES.forEach((locale) => {
    const link = document.createElement("link");
    link.rel = "alternate";
    link.hreflang = locale;
    link.href = `${baseUrl}${path}${path.includes("?") ? "&" : "?"}lang=${locale}`;
    document.head.appendChild(link);
  });

  const xDefault = document.createElement("link");
  xDefault.rel = "alternate";
  xDefault.hreflang = "x-default";
  xDefault.href = `${baseUrl}${path}`;
  document.head.appendChild(xDefault);
}

function announceRouteChange(title: string) {
  let announcer = document.getElementById("route-announcer");
  if (!announcer) {
    announcer = document.createElement("div");
    announcer.id = "route-announcer";
    announcer.setAttribute("role", "status");
    announcer.setAttribute("aria-live", "polite");
    announcer.setAttribute("aria-atomic", "true");
    announcer.className = "sr-only";
    document.body.appendChild(announcer);
  }
  announcer.textContent = "";
  requestAnimationFrame(() => {
    announcer!.textContent = `Navigated to ${title}`;
  });
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

    const currentLang = i18n.language || "en";
    setMetaContent('meta[property="og:locale"]', currentLang.replace("-", "_"));

    const currentUrl = window.location.href;
    setMetaContent('meta[property="og:url"]', currentUrl);

    const canonical = ensureLink("canonical");
    const prevCanonical = canonical.href;
    canonical.href = currentUrl;

    updateHreflangTags();

    announceRouteChange(title || "CreatorOS");

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
