// Which way a language is written: apart from the UI's language, so what
// runs with no kernel (a site's build) reads it too.

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
