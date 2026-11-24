// The UI language, `Qt.uiLanguage` (`App.language` in Ljós's API), and the
// way it is written. Its own module so that `Qt` and the application, which
// `Qt` is made from, both read the one signal.
import { signal } from "#kernel";

const [language, setLanguage] = signal(globalThis.navigator?.language ?? "en");
export const uiLanguage = language;

// Told each language the UI is set to, after it is set: what fetches a
// language's catalogue the first time it is asked for.
const told = new Set<(language: string) => void>();

export function setUiLanguage(next: string): void {
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
