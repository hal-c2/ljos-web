// The UI language, `Qt.uiLanguage` (`App.language` in Ljós's API), and the
// way it is written. Its own module so that `Qt` and the application, which
// `Qt` is made from, both read the one signal.
import { signal } from "#kernel";
import { rightToLeft } from "./direction.ts";

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

export { rightToLeft };

/**
 * Whether the UI is laid out from the right: as its language is written,
 * once one is chosen, else as the page it is in says (`<html dir>`).
 */
export function uiRightToLeft(): boolean {
  return chosen() ? rightToLeft(language()) : globalThis.document?.documentElement?.dir === "rtl";
}
