// The languages of a site built from a bundle with catalogues: the
// bundle's `i18n/<language>.po`, as a native Ljós project keeps them.
// What the page is read in is the address's `?lang=`, else the one the
// reader picked last (kept in the browser), else the first of the
// browser's own languages the site has, else the source's. No catalogue
// is in a page's first load: each is fetched when its language is first
// asked for, and the page changes language once it is in.
//
// The page is prerendered in the source language, and changes language
// once it is taken over; `<html lang dir>` say the language shown, so a
// screen reader reads it in that language and the browser sets text the
// way it is written.
import { App, catalogSources, loadCatalogs } from "./Ljos/Core/index.js";
import { onUiLanguage, rightToLeft } from "./QtQml/uiLanguage.ts";

function locale(tag) {
  try {
    return new Intl.Locale(String(tag).replace(/_/gu, "-"));
  } catch {
    return undefined;
  }
}

/**
 * The language of `languages` (the site's, each a BCP 47 tag) that
 * `wanted` (a reader's, most wanted first) is best read in, or "" when it
 * has none of them. A language is matched by its name, then by its
 * language and the script it is written in (`zh-CN` reads `zh-Hans`, never
 * `zh-Hant`; `pt-PT` reads `pt-BR`).
 */
export function bestLanguage(wanted, languages) {
  const offered = languages.map((tag) => ({ tag, at: locale(tag)?.maximize() })).filter(({ at }) => at);
  for (const one of wanted) {
    const exact = languages.find((tag) => tag.toLowerCase() === String(one).replace(/_/gu, "-").toLowerCase());
    if (exact) return exact;
    const at = locale(one)?.maximize();
    if (!at) continue;
    const same = offered.filter((it) => it.at.language === at.language && it.at.script === at.script);
    const found = same.find((it) => it.at.region === at.region) ?? same[0];
    if (found) return found.tag;
  }
  return "";
}

function kept(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function keep(key, tag) {
  try {
    globalThis.localStorage?.setItem(key, tag);
  } catch {
    // A browser that keeps nothing still shows the language on this page.
  }
}

// What the page's root says of the language shown.
function mark(tag) {
  const root = globalThis.document?.documentElement;
  if (!root) return;
  root.lang = tag;
  root.dir = rightToLeft(tag) ? "rtl" : "ltr";
}

/**
 * Starts a page's languages: `catalogs` maps each language the site is
 * translated into to what gives its catalogue's text, `source` is the
 * language the site is written in, and `key` where the reader's pick is
 * kept. The catalogue is fetched at once; the language is set once it is
 * in and `after` (the page being taken over) has settled, so the page as
 * prerendered is taken over as it was written. Resolves with the language
 * the page is read in.
 */
export async function startLanguages({ catalogs, source = "en", key = "ljos-site:language", after }) {
  const languages = [source, ...Object.keys(catalogs)];
  catalogSources(catalogs);
  let asked = "";
  try {
    asked = new URL(globalThis.location.href).searchParams.get("lang") ?? "";
  } catch {
    asked = "";
  }
  const picked =
    bestLanguage([asked].filter(Boolean), languages) ||
    bestLanguage([kept(key)].filter(Boolean), languages) ||
    bestLanguage(globalThis.navigator?.languages ?? [], languages) ||
    source;
  // Every change after this is the reader's (a picker sets App.language),
  // and is kept for the next page.
  let starting = true;
  onUiLanguage((tag) => {
    mark(tag);
    if (!starting) keep(key, tag);
  });
  mark(source);
  await Promise.all([picked === source ? undefined : loadCatalogs(picked), Promise.resolve(after).catch(() => undefined)]);
  App.language = picked;
  if (asked && picked === bestLanguage([asked], languages)) keep(key, picked);
  starting = false;
  return picked;
}
