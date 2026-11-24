// The site's languages (Site/Preferences.qml), narrowed for the files in
// Ljós's API that list them.

// A language the site is read in: its tag and its name as it names itself.
export interface Language {
  readonly tag: string;
  readonly name: string;
}

const textIn = (value: unknown): string => (typeof value === "string" ? value : "");

function language(one: unknown): Language {
  if (typeof one !== "object" || one === null) return { tag: "", name: "" };
  return {
    tag: "tag" in one ? textIn(one.tag) : "",
    name: "name" in one ? textIn(one.name) : "",
  };
}

export function languagesIn(languages: unknown): readonly Language[] {
  return Array.isArray(languages) ? languages.map(language) : [];
}

// A language's name in the language the page is read in (`Spanisch` on a
// German page), for a reader who does not read the name it gives itself.
// The browser knows them all, so the first load carries none.
export function nameIn(tag: string, language: string): string {
  try {
    return new Intl.DisplayNames([language, "en"], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}
