// The `Qt` object every QML file can see, and the functions that are there
// beside it: `qsTr`, `print`, `"%1".arg()`.
import { allowedUrl } from "../guard.js";
import { failed } from "../object.ts";
import { color, equal, hsla, hsva, rgba } from "../QtQuick/color.ts";
import { application, font, inputMethod, styleHints } from "./application.ts";
import { formatDate, formatDateTimeOf, formatTime, locale } from "./locale.ts";
import { enums } from "./namespace.ts";
import { general, Matrix4x4, Point, Quaternion, Rect, Size, Vector2d, Vector3d, Vector4d } from "./values.ts";
import { signal } from "#kernel";

// What marks the function `Qt.binding` returns: a slot assigned one takes it
// as a binding. A registered symbol, so the kernel needs nothing from here.
export const BINDING = Symbol.for("ljos-web.binding");

function need(args: readonly unknown[], count: number): void {
  if (args.length < count) throw new Error("Insufficient arguments");
}

// A colour, or null where Qt answers null: for a name that is no colour.
function colour(value: unknown) {
  const made = color(value);
  return made.valid ? made : null;
}

// Qt's MD5 of a string's UTF-8, in hexadecimal.
const SHIFTS = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const SINES = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 2 ** 32));

function md5(text: unknown): string {
  const bytes = new TextEncoder().encode(String(text));
  const padded = new Uint8Array((((bytes.length + 8) >>> 6) + 1) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bytes.length << 3, true);
  view.setUint32(padded.length - 4, Math.floor(bytes.length / 2 ** 29), true);
  const state: [number, number, number, number] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let block = 0; block < padded.length; block += 64) {
    let [a, b, c, d] = state;
    for (let step = 0; step < 64; step++) {
      const round = step >> 4;
      let mixed: number;
      let word: number;
      if (round === 0) [mixed, word] = [(b & c) | (~b & d), step];
      else if (round === 1) [mixed, word] = [(d & b) | (~d & c), (5 * step + 1) % 16];
      else if (round === 2) [mixed, word] = [b ^ c ^ d, (3 * step + 5) % 16];
      else [mixed, word] = [c ^ (b | ~d), (7 * step) % 16];
      const sum = (a + mixed + SINES[step]! + view.getUint32(block + word * 4, true)) | 0;
      const shift = SHIFTS[round * 4 + (step % 4)]!;
      [a, d, c, b] = [d, c, b, (b + ((sum << shift) | (sum >>> (32 - shift)))) | 0];
    }
    state[0] = (state[0] + a) | 0;
    state[1] = (state[1] + b) | 0;
    state[2] = (state[2] + c) | 0;
    state[3] = (state[3] + d) | 0;
  }
  const out = new DataView(new ArrayBuffer(16));
  state.forEach((word, index) => out.setUint32(index * 4, word, true));
  return Array.from(new Uint8Array(out.buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// One turn of the event loop from now, each function once however often it
// was asked for, with the arguments it was last given.
type Call = (...args: unknown[]) => unknown;
const later = new Map<Call, unknown[]>();

function callLater(callback: Call, ...args: unknown[]): void {
  if (!later.size) {
    queueMicrotask(() => {
      const calls = [...later];
      later.clear();
      for (const [call, given] of calls) call(...given);
    });
  }
  later.delete(callback);
  later.set(callback, args);
}

const [uiLanguage, setUiLanguage] = signal(globalThis.navigator?.language ?? "en");

// What `Qt.binding` returns: a function marked as a binding.
type Bound = ((this: unknown) => unknown) & { [BINDING]?: boolean };

const methods = {
  rgba(...args: unknown[]) {
    need(args, 3);
    return rgba(...(args as Parameters<typeof rgba>));
  },
  hsla(...args: unknown[]) {
    need(args, 3);
    return hsla(...(args as Parameters<typeof hsla>));
  },
  hsva(...args: unknown[]) {
    need(args, 3);
    return hsva(...(args as Parameters<typeof hsva>));
  },
  color(name: unknown) {
    const made = color(name);
    if (!made.valid) throw new Error(`"${name}" is not a valid color name`);
    return made;
  },
  lighter: (base: unknown, factor?: number) => colour(base)?.lighter(factor) ?? null,
  darker: (base: unknown, factor?: number) => colour(base)?.darker(factor) ?? null,
  alpha: (base: unknown, value: number) => colour(base)?.alpha(value) ?? null,
  tint(base: unknown, over: unknown) {
    const under = colour(base);
    return under && colour(over) ? under.tint(over) : null;
  },
  colorEqual(a: unknown, b: unknown): boolean {
    if (!color(a).valid || !color(b).valid) throw new Error("Qt.colorEqual(): Invalid color name");
    return equal(a, b);
  },

  point(...args: [x: number, y: number]): Point {
    need(args, 2);
    return new Point(args[0], args[1]);
  },
  size(...args: [width: number, height: number]): Size {
    need(args, 2);
    return new Size(args[0], args[1]);
  },
  rect(...args: [x: number, y: number, width: number, height: number]): Rect {
    need(args, 4);
    return new Rect(...args);
  },
  vector2d(...args: [x: number, y: number]): Vector2d {
    need(args, 2);
    return new Vector2d(...args);
  },
  vector3d(...args: [x: number, y: number, z: number]): Vector3d {
    need(args, 3);
    return new Vector3d(...args);
  },
  vector4d(...args: [x: number, y: number, z: number, w: number]): Vector4d {
    need(args, 4);
    return new Vector4d(...args);
  },
  quaternion(...args: [scalar: number, x: number, y: number, z: number]): Quaternion {
    need(args, 4);
    return new Quaternion(...args);
  },
  // No arguments for the identity, or its sixteen cells row by row, which
  // may come as one array.
  matrix4x4(...args: number[] | [cells: number[]]): Matrix4x4 {
    if (!args.length) return new Matrix4x4();
    const values = (args.length === 1 && Array.isArray(args[0]) ? args[0] : args) as number[];
    if (values.length !== 16) throw new Error(values.length < 16 && args.length === 1 ? "Qt.matrix4x4(): Invalid argument: not a valid matrix4x4 values array" : "Too many arguments");
    return new Matrix4x4(values);
  },
  font,

  // A URL is a string here. Relative ones are resolved where they are used,
  // against the file that wrote them: a property that takes a URL does it,
  // so `resolvedUrl` only has to when it is told what against.
  url: (url: unknown): unknown => url,
  resolvedUrl(url: string, base?: string | URL): string {
    if (url === "" || base === undefined) return url;
    try {
      return new URL(url, base).href;
    } catch {
      return url;
    }
  },
  openUrlExternally(url: unknown): boolean {
    const to = allowedUrl(String(url));
    if (!to) return false;
    window.open(to, "_blank", "noopener"); // guarded
    return true;
  },

  formatDate,
  formatTime,
  formatDateTime: formatDateTimeOf,
  locale,

  // `x = Qt.binding(function() { return y * 2 })`: assigning what this
  // returns binds the property again.
  binding(compute: unknown): Bound {
    if (typeof compute !== "function") throw new Error("binding(): argument (binding expression) must be a function");
    const bound: Bound = function (this: unknown) {
      return compute.call(this);
    };
    bound[BINDING] = true;
    return bound;
  },
  callLater,

  // A page cannot end: the application says that it was asked to.
  quit(): void {
    const app = application();
    app.aboutToQuit();
    app.quit();
  },
  exit(code = 0): void {
    const app = application();
    app.aboutToQuit();
    app.exit(code);
  },

  // QML is compiled ahead of time here: there is nothing to compile a file
  // or a string with once the program runs.
  createComponent(url: unknown, name?: unknown) {
    // A type of a module, by their names: the compiler made the component
    // of one there is, so this is one there is not.
    if (typeof name === "string") return failed(`<Unknown File>: Module "${url}" contains no type named "${name}"\n`);
    console.warn(`Qt.createComponent(${JSON.stringify(url)}): QML is compiled ahead of time; declare a Component instead`);
    return null;
  },
  createQmlObject(): null {
    console.warn("Qt.createQmlObject(): QML is compiled ahead of time; declare a Component instead");
    return null;
  },

  isQtObject(...args: unknown[]): boolean {
    need(args, 1);
    const [value] = args;
    return value === Qt || (value != null && typeof value === "object" && (value as { $type?: unknown }).$type !== undefined);
  },
  md5,
  // Of the text's UTF-8, as Qt's are.
  btoa(text: unknown): string {
    return btoa(String.fromCharCode(...new TextEncoder().encode(String(text))));
  },
  atob(text: unknown): string {
    try {
      return new TextDecoder().decode(Uint8Array.from(atob(String(text)), (char) => char.charCodeAt(0)));
    } catch {
      return "";
    }
  },
};

// `Qt` is filled in below: its enums, by name and each on its own, and
// what it reads from the application.
type QtNamespace = typeof methods & {
  LoadingMode: Readonly<{ Asynchronous: number; Synchronous: number }>;
  readonly platform: Readonly<{ os: string; pluginName: string }>;
  readonly application: ReturnType<typeof application>;
  readonly styleHints: ReturnType<typeof styleHints>;
  readonly inputMethod: ReturnType<typeof inputMethod>;
  uiLanguage: string;
} & Record<string, unknown>;

export const Qt = {} as QtNamespace;
// `Qt.AlignLeft`, and `Qt.AlignmentFlag.AlignLeft`.
for (const [name, members] of Object.entries(enums)) {
  Object.assign(Qt, members);
  Qt[name] = Object.freeze(members);
}
Qt.LoadingMode = Object.freeze({ Asynchronous: 0, Synchronous: 1 });
Object.assign(Qt, Qt.LoadingMode, methods);
Object.defineProperties(Qt, {
  platform: { value: Object.freeze({ os: "wasm", pluginName: "wasm" }), enumerable: true },
  application: { get: application, enumerable: true },
  styleHints: { get: styleHints, enumerable: true },
  inputMethod: { get: inputMethod, enumerable: true },
  uiLanguage: { get: uiLanguage, set: (language: string) => void setUiLanguage(language), enumerable: true },
});

// How `arg` and `%n` write a value: a whole number as one, any other as
// C's `%g` would.
function text(value: unknown, localised: boolean): string {
  if (typeof value === "boolean") value = value ? 1 : 0;
  if (typeof value !== "number") return String(value);
  if (localised) return locale().toString(value);
  return Number.isInteger(value) && Math.abs(value) < 2 ** 31 ? String(value) : general(value);
}

const MARKER = /%(L?)(\d{1,2})/g;

// `"%1 of %2".arg(done).arg(all)`: each call fills the lowest-numbered
// marker left, wherever it stands and however often. QML puts this on
// String itself, and programs count on it.
function arg(this: unknown, ...args: unknown[]): string {
  if (args.length !== 1) throw new Error("String.arg(): Invalid arguments");
  const whole = String(this);
  let lowest = 100;
  for (const [, , number] of whole.matchAll(MARKER)) lowest = Math.min(lowest, Number(number));
  if (lowest === 100) return whole;
  return whole.replace(MARKER, (marker, localised, number) => (Number(number) === lowest ? text(args[0], localised !== "") : marker));
}

if (!("arg" in String.prototype)) {
  Object.defineProperty(String.prototype, "arg", { value: arg, writable: true, configurable: true, enumerable: false });
}

// `%n` in a translated string is the number it is about.
function counted(source: unknown, n?: unknown): string {
  if (typeof source !== "string") throw new Error("qsTr(): argument (sourceText) must be a string");
  if (n === undefined) return source;
  return source.replace(/%(L?)n/g, (_, localised) => text(Number(n), localised !== ""));
}

// A string is its own translation: there are no catalogues yet.
export const qsTr = (source: unknown, disambiguation?: unknown, n?: unknown): string => counted(source, n);
export const qsTrId = (id: unknown, n?: unknown): string => counted(id, n);
export const qsTranslate = (context: unknown, source: unknown, disambiguation?: unknown, n?: unknown): string => counted(source, n);
export const QT_TR_NOOP = <T>(source: T): T => source;
export const QT_TRID_NOOP = <T>(id: T): T => id;
export const QT_TRANSLATE_NOOP = <T>(context: unknown, source: T): T => source;
export const qsTrNoOp = QT_TR_NOOP;
export const qsTrIdNoOp = QT_TRID_NOOP;
export const qsTranslateNoOp = QT_TRANSLATE_NOOP;

export const print = (...args: unknown[]): void => console.log(...args);
// The browser collects when it likes.
export const gc = (): void => {};
