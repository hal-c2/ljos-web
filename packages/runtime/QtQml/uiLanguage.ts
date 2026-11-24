// The UI language, `Qt.uiLanguage` (`App.language` in Ljós's API), and the
// way it is written. Its own module so that `Qt` and the application, which
// `Qt` is made from, both read the one signal.
import { signal } from "#kernel";

const [language, setLanguage] = signal(globalThis.navigator?.language ?? "en");
export const uiLanguage = language;

// Told each language the UI is set to, after it is set: what fetches a
// language's catalogue the first time it is asked for.
const told = new Set<(language: string) => void>();

// Whether the UI's language was chosen: by the app (`Qt.uiLanguage`,
// `App.language`) or by a site with catalogues. Until it is, the
// browser's language says nothing of the language the app is written in,
// so an app no one translated is not laid out from the right because its
// reader's browser is in Arabic (Qt takes the direction from the
// translation installed, not the system's language).
const [chosen, setChosen] = signal(false);

/** Says the UI is in its language from now on, though it was not set: a site that is written in it. */
export function chooseUiLanguage(): void {
  setChosen(true);
}

export function setUiLanguage(next: string): void {
  setChosen(true);
  setLanguage(next);
  for (const tell of [...told]) tell(next);
}

/** Calls `tell` with every UI language set from now on; the function it gives stops it. */
export function onUiLanguage(tell: (language: string) => void): () => void {
  told.add(tell);
  return () => void told.delete(tell);
}

// The languages written from right to left, for a browser whose
// `Intl.Locale` cannot say (no `getTextInfo` or `textInfo`).
const RIGHT_TO_LEFT = new Set(["ar", "arc", "ckb", "dv", "fa", "he", "iw", "ks", "ku", "ps", "sd", "syr", "ug", "ur", "yi"]);

/**
 * Whether a language is written from right to left: `ar`, `ar-EG`, `fa_IR`,
 * `he`. Its script decides where it names one (`ku-Arab`, `pa-Arab`), as
 * the most likely script does where it does not.
 */
export function rightToLeft(language: string): boolean {
  if (!language) return false;
  let locale: Intl.Locale;
  try {
    locale = new Intl.Locale(language.replace(/_/gu, "-"));
  } catch {
    return false;
  }
  const info = (locale as Intl.Locale & { getTextInfo?: () => { direction?: string }; textInfo?: { direction?: string } });
  const direction = (info.getTextInfo?.() ?? info.textInfo)?.direction;
  if (direction) return direction === "rtl";
  const script = locale.maximize().script;
  if (script) return ["Arab", "Hebr", "Thaa", "Syrc", "Nkoo", "Adlm", "Rohg"].includes(script);
  return RIGHT_TO_LEFT.has(locale.language);
}

/**
 * Whether the UI is laid out from the right: as its language is written,
 * once one is chosen, else as the page it is in says (`<html dir>`).
 */
export function uiRightToLeft(): boolean {
  return chosen() ? rightToLeft(language()) : globalThis.document?.documentElement?.dir === "rtl";
}
