// Translated messages: `` t`Hello ${name}` ``, `msg`, `plural`, `select`
// and `selectOrdinal`, as native Ljós has them (ljos-ui docs/I18N.md).
//
// The compiler reads each message where it is written and calls
// `__ljos_message(message, context, key, "a,b", a, b)`: the message in ICU
// MessageFormat, its context, the key a catalogue holds it by (its id, or
// the message) and its values by name. The text is looked up in the
// catalogues of the UI language, `App.language`, as the binding that
// shows it runs, so a binding shows the new language when it changes.
//
// What is here is ljos-ui's: the parser and formatter of `ljos_i18n`'s
// `message.rs`, the `.po` reader of its `po.rs` and the lookup of its
// `I18n::message`, written again in TypeScript with the browser's
// `Intl.PluralRules` and `Intl.NumberFormat` in place of ICU4X. The same
// message gives the same key and the same text in both.
import { signal } from "#kernel";
import { Qt } from "../../QtQml/Qt.ts";
import { onUiLanguage } from "../../QtQml/uiLanguage.ts";

// ---------------------------------------------------------------------------
// ICU MessageFormat 1, the part Ljós writes: text, `{arg}`,
// `{arg, number}`, `plural`, `selectordinal` and `select`, with `#` the
// count in a form of a plural. An `offset` and the date and time types are
// refused, as they are natively.

type Category = "zero" | "one" | "two" | "few" | "many" | "other";
const CATEGORIES: readonly string[] = ["zero", "one", "two", "few", "many", "other"];

type Selector = { exact: number } | { category: Category };

type Part =
  | { kind: "text"; text: string }
  | { kind: "arg"; name: string }
  | { kind: "number"; name: string }
  | { kind: "pound" }
  | { kind: "plural"; arg: string; ordinal: boolean; forms: [Selector, Part[]][] }
  | { kind: "select"; arg: string; forms: [string, Part[]][] };

/** A value a message shows: its text, and the number it is if it is one. */
interface Value {
  text: string;
  number: number | undefined;
}

class MessageError extends Error {
  readonly at: number;
  readonly reason: string;
  constructor(at: number, reason: string) {
    super(`${reason} (at character ${at})`);
    this.at = at;
    this.reason = reason;
  }
}

const isSyntax = (c: string): boolean => /\s/u.test(c) || "{},#'=".includes(c);

class Parser {
  at = 0;
  readonly chars: string[];
  constructor(chars: string[]) {
    this.chars = chars;
  }

  peek(): string | undefined {
    return this.chars[this.at];
  }

  error(reason: string): never {
    throw new MessageError(this.at, reason);
  }

  space(): void {
    while (this.peek() !== undefined && /\s/u.test(this.peek()!)) this.at += 1;
  }

  expect(c: string): void {
    if (this.peek() === c) this.at += 1;
    else this.error(`expected \`${c}\``);
  }

  word(): string {
    const start = this.at;
    while (this.peek() !== undefined && !isSyntax(this.peek()!)) this.at += 1;
    return this.chars.slice(start, this.at).join("");
  }

  message(plural: boolean, nested: boolean): Part[] {
    const parts: Part[] = [];
    let text = "";
    const flush = () => {
      if (text) parts.push({ kind: "text", text });
      text = "";
    };
    for (;;) {
      const c = this.peek();
      if (c === undefined) {
        if (nested) this.error("a form is not closed with `}`");
        break;
      }
      if (c === "}") {
        if (nested) break;
        this.error("a `}` that no `{` opened");
      }
      if (c === "{") {
        flush();
        parts.push(this.argument(plural));
      } else if (c === "#" && plural) {
        this.at += 1;
        flush();
        parts.push({ kind: "pound" });
      } else if (c === "'") {
        this.at += 1;
        const next = this.peek();
        if (next === "'") {
          this.at += 1;
          text += "'";
        } else if (next === "{" || next === "}" || (plural && next === "#")) {
          text += this.quoted();
        } else {
          text += "'";
        }
      } else {
        this.at += 1;
        text += c;
      }
    }
    flush();
    return parts;
  }

  // The text of a quote, `''` in it one apostrophe, up to the quote that
  // ends it, or the end of the message.
  quoted(): string {
    let text = "";
    for (let c = this.peek(); c !== undefined; c = this.peek()) {
      this.at += 1;
      if (c !== "'") text += c;
      else if (this.peek() === "'") {
        this.at += 1;
        text += "'";
      } else break;
    }
    return text;
  }

  argument(plural: boolean): Part {
    this.expect("{");
    this.space();
    const name = this.word();
    if (!name) this.error("an argument has no name");
    this.space();
    if (this.peek() === "}") {
      this.at += 1;
      return { kind: "arg", name };
    }
    if (this.peek() === undefined) this.error("expected `}`");
    this.expect(",");
    this.space();
    const kind = this.word();
    this.space();
    switch (kind) {
      case "number":
        if (this.peek() !== "}") this.error("a `number` argument has no style in Ljós");
        this.at += 1;
        return { kind: "number", name };
      case "plural":
      case "selectordinal": {
        this.expect(",");
        const forms = this.forms<Selector>(true, (key) => {
          // `offset:1` is a plural's own; a select's `offset` is a key as any other,
          // even in a select inside a plural's form.
          if (/^offset(?::|$)/u.test(key)) this.error("an `offset` is not supported");
          if (key.startsWith("=")) {
            const n = key.slice(1);
            const exact = Number(n);
            if (n.trim() === "" || Number.isNaN(exact)) this.error(`\`=${n}\` is not a number`);
            return { exact };
          }
          if (!CATEGORIES.includes(key))
            this.error(`\`${key}\` is not a plural category (zero, one, two, few, many, other) or \`=N\``);
          return { category: key as Category };
        }, sameSelector);
        if (!forms.some(([s]) => "category" in s && s.category === "other"))
          this.error(`the forms of \`${name}\` need \`other\``);
        return { kind: "plural", arg: name, ordinal: kind === "selectordinal", forms };
      }
      case "select": {
        this.expect(",");
        const forms = this.forms<string>(plural, (key) => key, (a, b) => a === b);
        if (!forms.some(([k]) => k === "other")) this.error(`the forms of \`${name}\` need \`other\``);
        return { kind: "select", arg: name, forms };
      }
      case "":
        return this.error("an argument's type is missing after `,`");
      default:
        return this.error(`\`${kind}\` arguments are not supported`);
    }
  }

  forms<K>(plural: boolean, key: (written: string) => K, same: (a: K, b: K) => boolean): [K, Part[]][] {
    const forms: [K, Part[]][] = [];
    for (;;) {
      this.space();
      const c = this.peek();
      if (c === "}") {
        this.at += 1;
        return forms;
      }
      if (c === undefined) this.error("the forms are not closed with `}`");
      const start = this.at;
      if (this.peek() === "=") this.at += 1;
      const rest = this.word();
      const written = this.chars.slice(start, this.at).join("");
      if (!rest) {
        if (this.peek() === "{") this.error("a form has no key");
        if (written === "=") this.error("`=` is not followed by a number");
        this.error("expected a form's key");
      }
      const k = key(written);
      if (forms.some(([f]) => same(f, k))) this.error(`the form \`${written}\` is there twice`);
      this.space();
      this.expect("{");
      const form = this.message(plural, true);
      this.expect("}");
      forms.push([k, form]);
    }
  }
}

const sameSelector = (a: Selector, b: Selector): boolean =>
  "exact" in a ? "exact" in b && a.exact === b.exact : "category" in b && a.category === b.category;

/** A message parsed: what it shows, and the names of its values. */
class Message {
  readonly parts: Part[];
  constructor(parts: Part[]) {
    this.parts = parts;
  }

  static parse(text: string): Message {
    return new Message(new Parser([...text]).message(false, false));
  }

  names(): Set<string> {
    const out = new Set<string>();
    const walk = (parts: Part[]) => {
      for (const part of parts) {
        if (part.kind === "arg" || part.kind === "number") out.add(part.name);
        else if (part.kind === "plural" || part.kind === "select") {
          out.add(part.arg);
          for (const [, form] of part.forms) walk(form);
        }
      }
    };
    walk(this.parts);
    return out;
  }

  format(values: Map<string, Value>, language: Plurals, numbers: Intl.NumberFormat): string {
    const number = (value: Value): string => {
      const n = asNumber(value);
      return n === undefined ? value.text : numbers.format(n);
    };
    const write = (parts: Part[], pound: Value | undefined): string => {
      let out = "";
      for (const part of parts) {
        switch (part.kind) {
          case "text":
            out += part.text;
            break;
          case "arg": {
            const value = values.get(part.name);
            out += value ? value.text : `{${part.name}}`;
            break;
          }
          case "number": {
            const value = values.get(part.name);
            out += value ? number(value) : `{${part.name}}`;
            break;
          }
          case "pound":
            out += pound ? number(pound) : "#";
            break;
          case "plural": {
            const value = values.get(part.arg);
            const n = value && asNumber(value);
            const category = value ? language.category(part.ordinal, value) : "other";
            const by = (c: Category) => part.forms.find(([s]) => "category" in s && s.category === c);
            const form =
              (n !== undefined && part.forms.find(([s]) => "exact" in s && s.exact === n)) ||
              by(category) ||
              by("other");
            if (form) out += write(form[1], value);
            break;
          }
          case "select": {
            const key = values.get(part.arg)?.text;
            const form = part.forms.find(([k]) => k === key) ?? part.forms.find(([k]) => k === "other");
            if (form) out += write(form[1], pound);
            break;
          }
        }
      }
      return out;
    };
    return write(this.parts, undefined);
  }
}

const asNumber = (value: Value): number | undefined => {
  if (value.number !== undefined) return value.number;
  const text = value.text.trim();
  if (text === "") return undefined;
  const n = Number(text);
  return Number.isNaN(n) ? undefined : n;
};

// What a value is shown as: a number as JavaScript writes it, anything
// else as its string.
function valueOf(v: unknown): Value {
  if (typeof v === "number") return { text: String(v), number: v };
  if (typeof v === "string") return { text: v, number: undefined };
  let text: string;
  try {
    text = String(v);
  } catch {
    text = "[object]";
  }
  return { text, number: undefined };
}

/** The plural rules of one language, cardinal and ordinal. */
class Plurals {
  readonly cardinal: Intl.PluralRules | undefined;
  readonly ordinal: Intl.PluralRules | undefined;

  constructor(language: string) {
    const rules = (type: Intl.PluralRulesOptions["type"]) => {
      try {
        return new Intl.PluralRules(language, { type });
      } catch {
        return undefined;
      }
    };
    this.cardinal = rules("cardinal");
    this.ordinal = rules("ordinal");
  }

  category(ordinal: boolean, value: Value): Category {
    const rules = ordinal ? this.ordinal : this.cardinal;
    const n = asNumber(value);
    if (!rules || n === undefined) return "other";
    return rules.select(n) as Category;
  }
}

// ---------------------------------------------------------------------------
// Language names, compared in one spelling: `is_IS` is `is-IS`.

function parsed(name: string): Intl.Locale | undefined {
  if (!name) return undefined;
  try {
    return new Intl.Locale(name.replace(/_/gu, "-"));
  } catch {
    return undefined;
  }
}

const canonical = (name: string): string => parsed(name)?.toString() ?? name.toLowerCase();

// The names a UI language is looked for under, most specific first: the
// name itself, without its script, with the region the language is most
// likely spoken in, with its script alone (`zh-CN` is written in Hans, so
// it finds a `zh-Hans` catalogue and `zh-TW` a `zh-Hant` one), and the
// language alone.
function fallbacks(language: string): string[] {
  const locale = parsed(language);
  if (!locale) return [canonical(language)];
  const out = [locale.toString()];
  const lang = locale.language;
  if (locale.region) out.push(`${lang}-${locale.region}`);
  const maximized = locale.maximize();
  if (maximized.region) out.push(`${lang}-${maximized.region}`);
  const script = locale.script ?? maximized.script;
  if (script) out.push(`${lang}-${script}`);
  out.push(lang);
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------
// `.po` catalogues, as Lingui writes them: `msgid` is the source message
// in ICU MessageFormat or its explicit id, `msgstr` its translation and
// `msgctxt` its context. An obsolete (`#~`), fuzzy or untranslated entry
// is no translation. An entry whose `msgid` is an explicit id says so as
// Lingui writes it, with the comment `#. js-lingui-explicit-id`.

interface Entry {
  translation: string;
  line: number;
  /** Its `msgid` is an id, not the source message. */
  explicitId?: boolean;
}

/** A catalogue of one language. */
export interface Catalog {
  readonly language: string;
  /** The file it was read from, which a warning names. */
  readonly file: string | undefined;
  readonly messages: ReadonlyMap<string, Entry>;
}

const entryKey = (context: string, key: string): string => `${context}\u0004${key}`;

function unquote(text: string, line: number): string {
  const trimmed = text.trim();
  if (trimmed.length < 2 || !trimmed.startsWith('"') || !trimmed.endsWith('"'))
    throw new Error(`line ${line}: expected a string in double quotes`);
  const inner = trimmed.slice(1, -1);
  let out = "";
  for (let i = 0; i < inner.length; i += 1) {
    const c = inner[i];
    if (c !== "\\") {
      out += c;
      continue;
    }
    i += 1;
    const next = inner[i];
    const escaped = { n: "\n", t: "\t", r: "\r", '"': '"', "\\": "\\" }[next ?? ""];
    if (next === undefined) throw new Error(`line ${line}: the string ends in \`\\\``);
    if (escaped === undefined) throw new Error(`line ${line}: \`\\${next}\` is not an escape`);
    out += escaped;
  }
  return out;
}

/**
 * Reads a `.po` file. Its language is the header's `Language:`, or the
 * file's name without `.po`. Throws, saying the line, where the file is not
 * one.
 */
export function readPo(text: string, file?: string): Catalog {
  type Field = "context" | "id" | "plural" | "str" | "other";
  interface Reading {
    context: string | undefined;
    id: string;
    translation: string;
    flags: string[];
    explicitId: boolean;
    obsolete: boolean;
    line: number;
  }
  const fresh = (): Reading => ({ context: undefined, id: "", translation: "", flags: [], explicitId: false, obsolete: false, line: 0 });
  const messages = new Map<string, Entry>();
  let language: string | undefined;
  let entry = fresh();
  let field: Field | undefined;
  let started = false;
  const finish = () => {
    if (started) {
      const done = entry;
      if (done.id === "" && done.context === undefined && !done.obsolete) {
        language = headerLanguage(done.translation);
      } else if (!done.obsolete && !done.flags.includes("fuzzy") && done.translation !== "") {
        const key = entryKey(done.context ?? "", done.id);
        // The first of two of one key is the one kept, as natively.
        if (!messages.has(key)) messages.set(key, { translation: done.translation, line: done.line, ...(done.explicitId ? { explicitId: true } : {}) });
      }
    }
    entry = fresh();
    started = false;
  };
  const lines = text.split("\n");
  for (const [number, written] of lines.entries()) {
    const line = number + 1;
    const raw = written.replace(/\r$/u, "");
    const obsolete = raw.startsWith("#~");
    const body = obsolete ? raw.slice(2).trimStart() : raw.trimStart();
    if (body === "") {
      if (!obsolete) {
        finish();
        field = undefined;
      }
      continue;
    }
    if (body.startsWith("#")) {
      // A comment after the keywords starts the next entry.
      if (field !== undefined) {
        finish();
        field = undefined;
      }
      started = true;
      if (body[1] === "." && body.slice(2).trim() === "js-lingui-explicit-id") entry.explicitId = true;
      if (body[1] === ",")
        entry.flags.push(
          ...body
            .slice(2)
            .split(",")
            .map((flag) => flag.trim())
            .filter(Boolean),
        );
      continue;
    }
    if (body.startsWith('"')) {
      const more = unquote(body, line);
      if (field === "context") entry.context = (entry.context ?? "") + more;
      else if (field === "id") entry.id += more;
      else if (field === "str") entry.translation += more;
      else if (field === undefined) throw new Error(`line ${line}: a string that continues no keyword`);
      continue;
    }
    const space = body.search(/\s/u);
    if (space < 0) throw new Error(`line ${line}: \`${body}\` is not a keyword and a string`);
    const keyword = body.slice(0, space);
    const value = body.slice(space + 1);
    let next: Field;
    if (keyword === "msgctxt") next = "context";
    else if (keyword === "msgid") next = "id";
    else if (keyword === "msgid_plural") next = "plural";
    else if (keyword === "msgstr" || keyword === "msgstr[0]") next = "str";
    else if (keyword.startsWith("msgstr[")) next = "other";
    else throw new Error(`line ${line}: \`${keyword}\` is not a keyword of a .po file`);
    // `msgctxt` or `msgid` after the translation starts the next entry.
    if ((next === "context" || next === "id") && (field === "str" || field === "other" || field === "plural"))
      finish();
    started = true;
    entry.obsolete ||= obsolete;
    const string = unquote(value, line);
    if (next === "context") entry.context = string;
    else if (next === "id") {
      entry.id = string;
      entry.line = line;
    } else if (next === "str") entry.translation = string;
    field = next;
  }
  finish();
  const name = file?.split(/[\\/]/u).pop();
  return {
    language: language ?? name?.replace(/\.po$/u, "") ?? "",
    file: name,
    messages,
  };
}

function headerLanguage(header: string): string | undefined {
  for (const line of header.split("\n")) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const value = line.slice(colon + 1).trim();
    if (line.slice(0, colon).trim().toLowerCase() === "language" && value) return value;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// The catalogues the program has, and the lookup.

interface Installed {
  catalog: Catalog;
  name: string;
  plurals: Plurals;
  // What each entry's translation parsed to, or null when it is not used.
  parsed: Map<string, Message | null>;
}

let installed: Installed[] = [];
// Read by every message that is shown, so that one shows what a catalogue
// installed after it says.
const [revision, setRevision] = signal(0);
const sources = new Map<string, Message | null>();
// Compiled call sites give a fixed set of messages; descriptors made at
// run time could give any number, so the cache starts again rather than
// grow without end.
const SOURCES_CACHED = 4096;
const said = new Set<string>();
const sourcePlurals = new Plurals("en");
const numberFormats = new Map<string, Intl.NumberFormat>();

/** Says once what is wrong with a catalogue or a message. */
function warn(text: string): void {
  if (said.has(text)) return;
  said.add(text);
  console.warn(text);
}

/**
 * Adds a catalogue: a `.po` file's text, or one {@link readPo} read. One
 * installed later is looked in first. Every message shown is looked up
 * again.
 *
 * ```js
 * import is from "./i18n/is.po?raw";
 * installCatalog(is, "is.po");
 * ```
 */
export function installCatalog(catalog: Catalog | string, file?: string): Catalog {
  const read = typeof catalog === "string" ? readPo(catalog, file) : catalog;
  installed = [
    ...installed.filter((it) => it.catalog !== read),
    { catalog: read, name: canonical(read.language), plurals: new Plurals(canonical(read.language)), parsed: new Map() },
  ];
  setRevision(revision() + 1);
  return read;
}

/** Takes a catalogue {@link installCatalog} gave out again. */
export function removeCatalog(catalog: Catalog): void {
  installed = installed.filter((it) => it.catalog !== catalog);
  // Fetched again if its language is asked for again.
  loading.delete(canonical(catalog.language));
  setRevision(revision() + 1);
}

function source(text: string): Message | null {
  const found = sources.get(text);
  if (found !== undefined) return found;
  let message: Message | null;
  try {
    message = Message.parse(text);
  } catch (error) {
    warn(`${JSON.stringify(text)}: the message does not parse, so it is shown as written: ${reason(error)}`);
    message = null;
  }
  if (sources.size >= SOURCES_CACHED) sources.clear();
  sources.set(text, message);
  return message;
}

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function translation(it: Installed, entry: Entry, key: string, known: Message | null): Message | null {
  const names = known?.names() ?? new Set<string>();
  // An id may stand for messages with other placeholders, so whether a
  // translation fits is known only for the message it is checked against.
  const cacheKey = `${entry.line}\u0004${key}\u0004${[...names].sort().join(",")}`;
  const cached = it.parsed.get(cacheKey);
  if (cached !== undefined) return cached;
  let message: Message | null = null;
  let why: string | undefined;
  try {
    message = Message.parse(entry.translation);
    const unknown = [...message.names()].filter((name) => !names.has(name)).map((name) => `{${name}}`);
    if (unknown.length) why = `the translation names ${unknown.join(", ")}, which the message does not have`;
  } catch (error) {
    why = `the translation does not parse: ${reason(error)}`;
  }
  if (why !== undefined) {
    const file = it.catalog.file;
    const at = file ? (entry.line ? `${file}:${entry.line}` : file) : it.catalog.language;
    warn(`${at}: ${JSON.stringify(key)}: ${why}`);
    message = null;
  }
  it.parsed.set(cacheKey, message);
  return message;
}

function numbers(language: string): Intl.NumberFormat {
  let format = numberFormats.get(language);
  if (!format) {
    try {
      // `is_IS`, as Qt writes it, is not a BCP 47 tag `Intl` takes.
      format = new Intl.NumberFormat(parsed(language)?.toString(), { maximumFractionDigits: 20 });
    } catch {
      format = new Intl.NumberFormat(undefined, { maximumFractionDigits: 20 });
    }
    numberFormats.set(language, format);
  }
  return format;
}

/**
 * The text of a message in the UI language: its translation in the first
 * catalogue of the fallback chain that has one it can use, or the message
 * itself, with English plural rules. A translation that does not parse,
 * or names a value the message does not have, is passed over and said
 * once.
 */
function lookup(message: string, context: string, key: string, values: Map<string, Value>): string {
  const language: string = Qt.uiLanguage;
  revision();
  const known = source(message);
  const format = numbers(language);
  const chain = installed.length ? fallbacks(language) : [];
  let catalogued: string | undefined;
  for (const name of chain) {
    for (let i = installed.length - 1; i >= 0; i -= 1) {
      const it = installed[i];
      if (!it || it.name !== name) continue;
      catalogued ??= name;
      const entry = it.catalog.messages.get(entryKey(context, key));
      if (!entry) continue;
      const translated = translation(it, entry, key, known);
      if (translated) return translated.format(values, it.plurals, format);
    }
  }
  if (catalogued !== undefined) missing(catalogued, context, key);
  return known ? known.format(values, sourcePlurals, format) : message;
}

// ---------------------------------------------------------------------------
// A catalogue held to its messages, as a translator's work is checked.

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

// ---------------------------------------------------------------------------
// What the UI language's catalogues do not have.

/** A message shown as written because the UI language's catalogues have no translation of it. */
export interface Untranslated {
  /** The catalogue's language that was looked in first. */
  readonly language: string;
  readonly context: string;
  /** What a catalogue holds it by: its id, or the message. */
  readonly key: string;
}

const untranslatedSeen = new Map<string, Untranslated>();

// A language with catalogues installed that has no translation of a
// message: the message is shown as written, and said once, so a
// translation that is missing is found rather than read past.
function missing(language: string, context: string, key: string): void {
  const at = `${language}\u0004${entryKey(context, key)}`;
  if (untranslatedSeen.has(at)) return;
  const found: Untranslated = Object.freeze({ language, context, key });
  untranslatedSeen.set(at, found);
  // A debug line, not a warning: a catalogue that is behind its sources is
  // the ordinary state of a project being translated, and native Ljós
  // shows the source text silently too. `untranslated()` is the report.
  console.debug(`${language}: ${JSON.stringify(key)}${context ? ` (context ${JSON.stringify(context)})` : ""}: no translation, so it is shown as written`);
}

/**
 * Every message shown so far as written although catalogues of the UI
 * language were installed: the translations a catalogue is missing. A
 * language with no catalogue at all, such as the source's own, has
 * nothing missing.
 */
export function untranslated(): readonly Untranslated[] {
  return [...untranslatedSeen.values()];
}

// ---------------------------------------------------------------------------
// Catalogues fetched when their language is first asked for.

/** Where a language's catalogue is: an address to fetch, or a function that gives its text. */
export type CatalogSource = string | URL | (() => Promise<string>);

const sourcesOf = new Map<string, { source: CatalogSource; file: string }>();
const loading = new Map<string, Promise<void>>();
let listening: (() => void) | undefined;

async function textOf(source: CatalogSource): Promise<string> {
  if (typeof source === "function") return source();
  const response = await fetch(source);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
  return response.text();
}

function load(name: string): Promise<void> {
  const given = sourcesOf.get(name);
  if (!given) return Promise.resolve();
  let pending = loading.get(name);
  if (!pending) {
    pending = textOf(given.source).then(
      (text) => {
        try {
          installCatalog(text, given.file);
        } catch (error) {
          // Asked for again next time the language is: the file may be mended.
          loading.delete(name);
          warn(`${given.file}: the catalogue does not read, so it is left out: ${reason(error)}`);
        }
      },
      (error: unknown) => {
        // Asked for again next time the language is: the network may be back.
        loading.delete(name);
        warn(`${given.file}: the catalogue could not be fetched: ${reason(error)}`);
      },
    );
    loading.set(name, pending);
  }
  return pending;
}

/**
 * Fetches and installs the catalogues `language` is looked up in (its
 * fallback chain, `pt-BR` then `pt`) that {@link catalogSources} named and
 * that are not in yet. Resolves when each is in, or has failed and been said.
 */
export function loadCatalogs(language: string = Qt.uiLanguage): Promise<void> {
  return Promise.all(fallbacks(language).map(load)).then(() => undefined);
}

/**
 * Names where each language's catalogue is, so that none is fetched until
 * it is asked for: setting `App.language` afterwards fetches the new
 * language's (a message is shown as written until it is in, then again in
 * the language), and {@link loadCatalogs} fetches one before it is set, so
 * the page changes language at once. The UI language already set is not
 * fetched for until one of the two asks.
 *
 * ```js
 * catalogSources({ is: "i18n/is.po", "pt-BR": "i18n/pt-BR.po" });
 * ```
 */
export function catalogSources(sources: Readonly<Record<string, CatalogSource>>): void {
  for (const [language, source] of Object.entries(sources)) {
    const file = typeof source === "function" ? `${language}.po` : String(source).split(/[?#]/u)[0]!.split("/").pop() || `${language}.po`;
    sourcesOf.set(canonical(language), { source, file });
  }
  listening ??= onUiLanguage((language) => void loadCatalogs(language));
}

const valuesOf = (names: string, values: readonly unknown[]): Map<string, Value> => {
  const out = new Map<string, Value>();
  if (names) names.split(",").forEach((name, i) => out.set(name, valueOf(values[i])));
  return out;
};

/** What the compiler writes a message it read as. */
export function __ljos_message(
  message: string,
  context: string,
  key: string,
  names: string,
  ...values: unknown[]
): string {
  return lookup(message, context, key, valuesOf(names, values));
}

/** A message `msg` made: translated where `t` is given it. */
export interface MessageDescriptor {
  readonly id: string;
  readonly message: string;
  readonly context?: string;
  readonly values?: Readonly<Record<string, unknown>>;
}

/** What the compiler writes a `msg` it read as. */
export function __ljos_msg(
  message: string,
  context: string,
  key: string,
  names: string,
  ...values: unknown[]
): MessageDescriptor {
  const m: { id: string; message: string; context?: string; values?: Record<string, unknown> } = { id: key, message };
  if (context) m.context = context;
  if (names) {
    const v: Record<string, unknown> = {};
    names.split(",").forEach((name, i) => {
      v[name] = values[i];
    });
    m.values = Object.freeze(v);
  }
  return Object.freeze(m);
}

// The compiler's escaping, so both give one text the same key: one quote
// from the first brace to the last, as ICU quotes, and an apostrophe
// doubled where it would quote.
const plain = (s: string): string => s.replace(/'(?=['{}#|]|$)/gu, "''");
function escape(s: string): string {
  const first = s.search(/[{}]/u);
  if (first < 0) return plain(s);
  const last = Math.max(s.lastIndexOf("{"), s.lastIndexOf("}"));
  return `${plain(s.slice(0, first))}'${s.slice(first, last + 1).replace(/'/gu, "''")}'${plain(s.slice(last + 1))}`;
}

// A template whose text is not written where it is called: its values
// are numbered, as the compiler numbers them.
function ofTemplate(strings: TemplateStringsArray, values: readonly unknown[]): [string, string] {
  let message = "";
  strings.forEach((s, i) => {
    message += escape(s);
    if (i < values.length) message += `{${i}}`;
  });
  return [message, values.map((_, i) => String(i)).join(",")];
}

const isTemplate = (m: unknown): m is TemplateStringsArray =>
  Array.isArray(m) && Array.isArray((m as unknown as { raw?: unknown }).raw);

function ofDescriptor(m: unknown): string {
  if (m === null || typeof m !== "object") throw new TypeError("t(): the message is not a message msg made");
  const d = m as Partial<Record<keyof MessageDescriptor, unknown>>;
  const message = typeof d.message === "string" ? d.message : typeof d.id === "string" ? d.id : "";
  const key = typeof d.id === "string" ? d.id : message;
  const given = d.values && typeof d.values === "object" ? (d.values as Record<string, unknown>) : {};
  const names = Object.keys(given);
  return __ljos_message(
    message,
    typeof d.context === "string" ? d.context : "",
    key,
    names.join(","),
    ...names.map((name) => given[name]),
  );
}

/**
 * `` t`Hello ${name}` ``: the message in the UI language. The compiler
 * reads a message written where `t` is called; what reaches this function
 * is `t(m)` of a message `msg` made, or a template the compiler could not
 * see, whose values are numbered.
 */
export function t(m: TemplateStringsArray | MessageDescriptor, ...values: unknown[]): string {
  if (isTemplate(m)) {
    const [message, names] = ofTemplate(m, values);
    return __ljos_message(message, "", message, names, ...values);
  }
  return ofDescriptor(m);
}

/** `` msg`Open` ``: the message itself, for `t` to translate later. */
export function msg(
  m: TemplateStringsArray | { id?: string; message?: string; context?: string },
  ...values: unknown[]
): MessageDescriptor {
  if (isTemplate(m)) {
    const [message, names] = ofTemplate(m, values);
    return __ljos_msg(message, "", message, names, ...values);
  }
  if (m === null || typeof m !== "object") throw new TypeError("msg(): the message is not a template or a descriptor");
  return __ljos_msg(m.message ?? m.id ?? "", m.context ?? "", m.id ?? m.message ?? "", "");
}

const part = (name: string) =>
  function (): never {
    throw new Error(`${name}() is a part of a message: write it in t\`…\` or msg\`…\``);
  };

/** `plural(n, { one: "# file", other: "# files" })`, inside `t` or `msg`. */
export const plural: (n: number, forms: Record<string | number, string>) => string = part("plural");
/** `select(v, { admin: "Admin", other: "Member" })`, inside `t` or `msg`. */
export const select: (value: unknown, forms: Record<string, string>) => string = part("select");
/** `selectOrdinal(n, { one: "#st", other: "#th" })`, inside `t` or `msg`. */
export const selectOrdinal: (n: number, forms: Record<string | number, string>) => string = part("selectOrdinal");
