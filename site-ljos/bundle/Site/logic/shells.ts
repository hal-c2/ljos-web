// What the shells' scripts (../shells.js) answer, narrowed for the files
// in Ljós's API that read it: a shell's source, a compile's answer, the
// place a panel stands centred in.

// A shell's QML as shell-sources.json holds it. `none` is the shell that
// has not come (yet): no file.
export interface Source {
  readonly file: string;
  readonly text: string;
  readonly rich: string;
}

export const none: Source = { file: "", text: "", rich: "" };

function textIn(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberIn(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

// The shells by name, as `sources` answered them.
export type Shells = { readonly [name: string]: unknown };

function shellsIn(all: unknown): Shells {
  if (typeof all === "object" && all !== null && "shells" in all) {
    const shells = all.shells;
    if (typeof shells === "object" && shells !== null) return shells;
  }
  return {};
}

// The named shell's source in what `sources` answered, or `none`.
export function sourceOf(all: unknown, name: string): Source {
  const one = shellsIn(all)[name];
  if (typeof one !== "object" || one === null || !("file" in one) || typeof one.file !== "string") return none;
  return { file: one.file, text: "text" in one ? textIn(one.text) : "", rich: "rich" in one ? textIn(one.rich) : "" };
}

// What the compiler says is wrong, where.
export interface Diagnostic {
  readonly file: string;
  readonly text: string;
  readonly message: string;
  readonly line: number;
  readonly column: number;
  readonly endLine: number | undefined;
  readonly endColumn: number | undefined;
}

function diagnostic(one: unknown): Diagnostic {
  if (typeof one !== "object" || one === null)
    return { file: "", text: "", message: "", line: 0, column: 0, endLine: undefined, endColumn: undefined };
  return {
    file: "file" in one ? textIn(one.file) : "",
    text: "text" in one ? textIn(one.text) : "",
    message: "message" in one ? textIn(one.message) : "",
    line: ("line" in one ? numberIn(one.line) : undefined) ?? 0,
    column: ("column" in one ? numberIn(one.column) : undefined) ?? 0,
    endLine: "endLine" in one ? numberIn(one.endLine) : undefined,
    endColumn: "endColumn" in one ? numberIn(one.endColumn) : undefined,
  };
}

// The diagnostics a compile answered, or undefined for one that made a shell.
export function diagnosticsOf(made: unknown): readonly Diagnostic[] | undefined {
  if (typeof made !== "object" || made === null || !("diagnostics" in made)) return undefined;
  const all = made.diagnostics;
  return Array.isArray(all) ? all.map(diagnostic) : undefined;
}

// The shell a compile made.
export function shellOf(made: unknown): unknown {
  return typeof made === "object" && made !== null && "shell" in made ? made.shell : undefined;
}

// Why a load failed, as a reader is told: an Error's message, or what
// was thrown when it is a word or a number.
export function whyOf(why: unknown): string {
  if (typeof why === "object" && why !== null && "message" in why && typeof why.message === "string") return why.message;
  if (typeof why === "string") return why;
  if (typeof why === "number" || typeof why === "boolean") return String(why);
  return "unknown error";
}

// What a panel stands centred in.
export interface Box {
  readonly width: number;
  readonly height: number;
}

export function isBox(v: unknown): v is Box {
  return typeof v === "object" && v !== null && "width" in v && typeof v.width === "number" && "height" in v && typeof v.height === "number";
}

// What the reader wrote in each shell's QML, by its file.
export type Drafts = { [file: string]: string };

// A shell a reader may pick, as Preferences lists them.
export interface Choice {
  readonly name: string;
  readonly label: string;
  readonly about: string;
}

function choice(one: unknown): Choice {
  if (typeof one !== "object" || one === null) return { name: "", label: "", about: "" };
  return {
    name: "name" in one ? textIn(one.name) : "",
    label: "label" in one ? textIn(one.label) : "",
    about: "about" in one ? textIn(one.about) : "",
  };
}

export function choicesIn(shells: unknown): readonly Choice[] {
  return Array.isArray(shells) ? shells.map(choice) : [];
}
