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
import { chooseUiLanguage, onUiLanguage, rightToLeft, setUiLanguage, uiLanguage } from "./QtQml/uiLanguage.ts";

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
 * Puts the page in `source`, the language it is prerendered in, before it
 * is taken over: the UI's language starts as the browser's (`en-US`), and
 * a change to it once the page is taken over would make every translated
 * text, and what is made from one, again.
 */
export function startInSource(source = "en") {
  if (uiLanguage() !== source) setUiLanguage(source);
  else chooseUiLanguage();
  mark(source);
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
    // A page with no address of its own names none.
  }
  const picked =
    bestLanguage([asked].filter(Boolean), languages) ||
    bestLanguage([kept(key)].filter(Boolean), languages) ||
    bestLanguage(globalThis.navigator?.languages ?? [], languages) ||
    source;
  // Every change after this that is not the start's own is the reader's
  // (a picker sets App.language), and is kept for the next page at once,
  // so a start that never finishes waiting loses none. One made while the
  // start still waits (on a slow link the page is the reader's before the
  // catalogue is in) is what the page stays in.
  let starting = true;
  let ours = false;
  let readers = "";
  onUiLanguage((tag) => {
    mark(tag);
    if (ours) return;
    if (starting) readers = tag;
    keep(key, tag);
  });
  mark(source);
  const [shown] = await Promise.all([picked === source || loadCatalogs(picked), Promise.resolve(after).catch(() => undefined)]);
  starting = false;
  if (readers) return readers;
  // A catalogue that could not be had, which was said, leaves the page as
  // it was written, and the language unkept: the next page asks again.
  if (!shown) return source;
  ours = true;
  try {
    App.language = picked;
  } finally {
    ours = false;
  }
  if (asked && picked === bestLanguage([asked], languages)) keep(key, picked);
  return picked;
}
