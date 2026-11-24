// A catalogue held to its messages, as a translator's work is checked:
// tooling and tests ask for it, a page never does, so it is a module of its
// own that no page's first load carries (site-ljos/tests/payload.spec.js).
import { type Catalog, canonical, Message, type Part, readPo, reason } from "./messages.ts";

/**
 * What is wrong with a catalogue's translations, read as they will be
 * shown: each that does not parse, names a value its message does not
 * have or leaves one out, has a choice's forms other than the message's,
 * or a count whose forms are not the language's plural categories (all of
 * them, and no others; a number form such as `=0` is always allowed). A
 * message with an id rather than its text is checked for parsing only.
 * Each problem is a line: the file and line, the message, and why.
 */
export function checkCatalog(catalog: Catalog | string, file?: string): string[] {
  const read = typeof catalog === "string" ? readPo(catalog, file) : catalog;
  const language = canonical(read.language);
  const problems: string[] = [];
  const categories = (ordinal: boolean): Set<string> =>
    new Set(new Intl.PluralRules(language, { type: ordinal ? "ordinal" : "cardinal" }).resolvedOptions().pluralCategories);
  const choices = (parts: Part[], out = new Map<string, Part[]>()): Map<string, Part[]> => {
    for (const part of parts) {
      if (part.kind !== "plural" && part.kind !== "select") continue;
      out.set(`${part.kind}:${part.arg}`, [...(out.get(`${part.kind}:${part.arg}`) ?? []), part]);
      for (const [, form] of part.forms) choices(form, out);
    }
    return out;
  };
  for (const [at, entry] of read.messages) {
    const key = at.slice(at.indexOf("\u0004") + 1);
    const where = `${read.file ?? read.language}:${entry.line}: ${JSON.stringify(key)}`;
    let translated: Message;
    try {
      translated = Message.parse(entry.translation);
    } catch (error) {
      problems.push(`${where}: the translation does not parse: ${reason(error)}`);
      continue;
    }
    // An id is not its message: what the message names is not known here.
    let message: Message | undefined;
    try {
      message = entry.explicitId ? undefined : Message.parse(key);
    } catch {
      message = undefined;
    }
    for (const [, parts] of choices(translated.parts)) {
      for (const part of parts) {
        if (part.kind !== "plural") continue;
        const wanted = categories(part.ordinal);
        const given = new Set<string>(part.forms.flatMap(([selector]) => ("category" in selector ? [selector.category] : [])));
        const missing = [...wanted].filter((c) => !given.has(c));
        const extra = [...given].filter((c) => !wanted.has(c));
        if (missing.length) problems.push(`${where}: the count {${part.arg}} needs the form(s) ${missing.join(", ")} in ${language}`);
        if (extra.length) problems.push(`${where}: the count {${part.arg}} has the form(s) ${extra.join(", ")}, which ${language} does not use`);
      }
    }
    if (!message || key === entry.translation) continue;
    const names = message.names();
    const named = translated.names();
    const unknown = [...named].filter((name) => !names.has(name));
    const dropped = [...names].filter((name) => !named.has(name));
    if (unknown.length) problems.push(`${where}: the translation names ${unknown.map((n) => `{${n}}`).join(", ")}, which the message does not have`);
    if (dropped.length) problems.push(`${where}: the translation leaves out ${dropped.map((n) => `{${n}}`).join(", ")}`);
    const own = choices(message.parts);
    for (const [name, parts] of choices(translated.parts)) {
      if (!name.startsWith("select:")) continue;
      const keys = new Set((own.get(name) ?? []).flatMap((part) => (part.kind === "select" ? part.forms.map(([k]) => k) : [])));
      for (const part of parts) {
        if (part.kind !== "select") continue;
        const other = part.forms.map(([k]) => k).filter((k) => !keys.has(k));
        if (other.length) problems.push(`${where}: the choice {${part.arg}} has the form(s) ${other.join(", ")}, which the message does not`);
      }
    }
  }
  return problems;
}
