// The QML object model, on Solid's signals.
//
// A QML object is a plain JavaScript object whose properties are accessors.
// Behind each is a slot: what the object was assigned, else what its creator
// bound (the Solid prop of the same name), else the type's default. Reading
// one tracks it like any signal, so a binding that reads `other.width` is
// re-evaluated when that width changes, whatever made it change.
//
// A type is a Solid component: called with props, it returns the object. The
// compiler emits `<Rectangle color="red"/>`, Solid turns that into
// `createComponent(Rectangle, { color: "red" })`, and nothing here interprets
// QML: names and scopes were settled when the file was compiled.
import { createEffect, createMemo, createRenderEffect, createRoot, createSignal, flush as drain, getObserver, getOwner, onCleanup, runWithOwner } from "solid-js";
import { Color, color } from "./QtQuick/color.js";
// Which graph is under the slots: Solid's signals, or Ljós's own graph in
// wasm (`kernel/wasm.js`), as the build's `ljos-wasm-kernel` condition says.
import { WASM, binding, cell, followed, read as follow, placed as typeOwn, signal as counted, touch, untrack } from "#kernel";
import type { Accessor, Owner, Setter } from "solid-js";

// What the object model is to the types and pages built on it.

// A handler of a signal, or anything connected to one. Its arguments are
// whatever the signal is emitted with, so it is checked as a method is:
// `(mouse: MouseEvent) => void` is one.
export type Handler = { bivarianceHack(...args: unknown[]): unknown }["bivarianceHack"];
// A function that takes what it is given as a method would: a type made from
// another's is still one, though its `adopt` takes only its own objects.
type Method<A extends unknown[], R> = { bivarianceHack(...args: A): R }["bivarianceHack"];

// A signal is the function that emits it.
export interface Signal {
  (...args: unknown[]): void;
  connect(listener: Handler): void;
  disconnect(listener: Handler): void;
}

// What `onChange` tells first, as the watch begins: the value then, and
// where to put a handler that is to be told later, while objects are made.
export type First = (value: unknown, firsts: (() => unknown)[] | undefined) => void;

// `widthChanged`: a property's changes, which nothing watches until
// something hears of them.
export interface ChangeSignal extends Signal {
  watch(first?: First): void;
}

// Who is told when a handler or a binding of an object throws, in place of
// the page.
export type Boundary = (error: unknown, self: QObject) => void;

// What `mount` and `hydrate` are told, and pass on to the root.
export interface MountOptions {
  fill?: boolean;
  reloadable?: boolean;
  [option: string]: unknown;
}

// A QML object: what every type makes. Its properties are its type's; these
// are what the runtime keeps on each, hidden.
export interface QObject {
  readonly $type: QmlType;
  readonly $props: Props;
  readonly $owner: Owner | null;
  readonly $parent: QObject | null;
  readonly $slots: Record<string, Slot | undefined>;
  readonly $groups: Record<string, object | undefined>;
  readonly $signals: Record<string, Signal | undefined>;
  // Followed by whoever read the object before it existed, and moved once
  // it does.
  readonly $track: Accessor<number>;
  readonly $touch: Setter<number>;
  readonly $id?: string;
  readonly $fault?: Boundary;
  readonly $born?: QObject[];
  readonly $row?: number;
  readonly $attached?: Record<string, QObject | undefined>;
  readonly $replaced?: Record<string, Handler | undefined>;
  readonly $declares?: string[];
  readonly $destroyed?: boolean;
  readonly $gone?: boolean;
  readonly $dispose?: () => void;
  readonly $destruction?: () => void;
  // What a type gives its objects.
  $node?: HTMLElement | SVGElement | null;
  $contentItem?: QObject | null;
  $written?: () => void;
  $add?: (child: QObject) => void;
  $remove?: (child: QObject) => void;
  $mounted?: (element: Element, options: MountOptions) => void;
  $block?: QObject;
}

// An object read by a name only known when the program runs.
export type Dynamic = QObject & { [key: string]: unknown };
const dynamic = (self: QObject): Dynamic => self as Dynamic;

// What an object declares of its own: `Item { property int hours; signal ticked }`.
export interface Declared {
  readonly properties?: PropertySpecs;
  readonly signals?: readonly string[];
}

// `property alias text: label.text`: the object, and the path in it.
export type AliasPath = readonly [target: AliasTarget, ...path: string[]];
export type AliasTarget = { [key: string]: unknown; readonly $type?: QmlType; readonly $track?: () => unknown };

// What an object is made with: its props, by name, and these that the
// compiler and the runtime give.
export interface Props {
  [key: string]: unknown;
  $given?: Props;
  $declare?: Declared | readonly Declared[];
  $self?: QObject;
  $made?: string[];
  $is?: QmlType | readonly QmlType[];
  $attach?: readonly QmlType[];
  $functions?: Record<string, unknown>;
  $aliases?: Record<string, AliasPath>;
  $default?: readonly [name: string, list: boolean];
  $levels?: Props[];
  $holding?: unknown;
  $context?: Context;
  $index?: number;
  $attachee?: QObject;
  children?: unknown;
  Component$onCompleted?: () => unknown;
  Component$onDestruction?: () => unknown;
}

// What a type's `properties` say of each: a default, or one of `typed`,
// `derived`, `group` and `alone`.
export type PropertySpecs = Readonly<Record<string, unknown>>;
export type Enums = Readonly<Record<string, unknown>>;

// What a property of a type holds, from what its type says of it.
type Widen<V> = V extends string ? string : V extends number ? number : V extends boolean ? boolean : V;
export type ValueOf<D> =
  D extends Typed<infer V> ? V : D extends Derived<infer V> ? V : D extends Alone<infer V> ? ValueOf<V> : D extends Group<infer G> ? GroupOf<G> : Widen<D>;
export type GroupOf<G> = { -readonly [K in keyof G]: ValueOf<G[K]> };
export type PropertiesOf<P> = { -readonly [K in keyof P]: ValueOf<P[K]> };
type ChangesOf<P> = { readonly [K in keyof P & string as `${K}Changed`]: ChangeSignal };
type SignalsOf<S extends string> = { readonly [K in S]: Signal };

// What an object of a type is: its base's, its own properties and their
// changes, its signals and its methods.
export type Instance<B extends QObject, P, S extends string, M> = B & PropertiesOf<P> & ChangesOf<P> & SignalsOf<S> & M;

// `resolve: { x: (self, own) => ... }`.
export type Resolve = (self: Dynamic, own: () => unknown) => unknown;

// What `defineType` is told: see there.
export interface TypeSpec<I extends QObject = QObject, P = PropertySpecs, S extends string = string, M = object, E = Enums> {
  readonly properties?: P | undefined;
  readonly signals?: readonly S[] | undefined;
  readonly methods?: M & ThisType<I>;
  readonly enums?: E;
  readonly resolve?: Readonly<Record<string, Resolve>>;
  setup?(self: I, props: Props): void;
  adopt?(self: I, props: Props): void;
  readonly attached?: QmlType;
}

// Makes the slot of a property on an object, the first time it is asked for.
export interface SlotMaker {
  (self: QObject): Slot;
  kind?: Kind | undefined;
}

// A type: called with props, it makes the object.
export interface QmlType<I extends QObject = QObject> {
  (props?: Props): I;
  [Symbol.hasInstance](object: unknown): object is I;
  typeName: string;
  base: QmlType | null;
  spec: TypeSpec<I>;
  proto: object;
  slots: Record<string, SlotMaker | undefined>;
  groups: Record<string, readonly string[] | undefined>;
  chain: readonly QmlType[];
  enums: Enums;
  adopt: Method<[self: I, props: Props], void> | undefined;
  attached?: (self: QObject) => QObject | undefined;
}

// What a property's type makes of what it is given: the value, or that it
// is refused, or that it is taken no notice of.
export interface Kind {
  (value: unknown): unknown;
  type: string;
  any?: boolean;
  made?: (value: unknown) => unknown;
}

// What ends a computation's run in a value: a binding, as the slots hold one.
interface Bound<T = unknown> {
  (): T;
  start(): () => T;
  begin(): () => T;
  busy(): boolean;
}

// A binding guarded against what cannot be evaluated yet.
interface Guard<T = unknown> {
  (): T;
  failing: boolean;
}

// Solid refuses a write from a component's body or a computation; an object
// is assigned to from wherever its QML says.
const WRITABLE = { ownedWrite: true };
// A binding gives a value, never a promise of one.
const SYNC = { sync: true };
// What `Qt.binding(f)` marks its function with: assigning one binds.
const BINDING: unique symbol = Symbol.for("ljos-web.binding");
// A function `Qt.binding` marked.
type Rebinding = (() => unknown) & { readonly [BINDING]: unknown };
const isBinding = (value: unknown): value is Rebinding =>
  typeof value === "function" && Boolean((value as Partial<Rebinding>)[BINDING]);

const versioned = () => createSignal(0, WRITABLE);

const hidden = <T extends object>(object: T, key: string, value: unknown): T =>
  Object.defineProperty(object, key, { value, writable: true, configurable: true });

// What an object is before its type has run: every property reads as
// undefined, and whoever read it is told when the object exists. Ids are
// declared before anything is created, so a binding may meet one early.
const pending: object = new Proxy(Object.create(null), {
  get(_, key, self: QObject) {
    if (typeof key === "string" && key[0] !== "$") {
      early++;
      self.$track();
    }
    return undefined;
  },
  has: () => false,
});

// How many times one was read.
let early = 0;

// The object an `id` names, made before the type that fills it in runs.
// The id is kept for a reload, which knows an object by it (`reload.js`).
export function $object(id?: string): QObject {
  const self: QObject = Object.create(pending);
  const [track, touch] = counted(0, getOwner());
  hidden(self, "$track", track);
  hidden(self, "$touch", touch);
  if (id) hidden(self, "$id", id);
  return self;
}

// A property whose default is computed from the object: `width` is
// `implicitWidth` until something says otherwise.
const DERIVED = Symbol("derived");
export interface Derived<V = unknown> {
  readonly [DERIVED]: (self: never) => V;
}
export const derived = <V, I extends QObject = Dynamic>(compute: (self: I) => V): Derived<V> => ({ [DERIVED]: compute });
// Each of these reads its mark, as a property is read: what a Proxy says it has.
const isDerived = (initial: unknown): initial is Derived =>
  Boolean((initial as Partial<Derived> | null | undefined)?.[DERIVED]);
// What a derived default is, of the object.
const derive$ = (initial: unknown, self: QObject): unknown =>
  isDerived(initial) ? (initial[DERIVED] as (self: QObject) => unknown)(self) : initial;

// `anchors`, `font`, `border`: properties under one name. `anchors.fill` is
// bound as the prop `anchors$fill`.
const GROUP = Symbol("group");
export interface Group<G extends PropertySpecs = PropertySpecs> {
  readonly [GROUP]: G;
}
export const group = <G extends PropertySpecs>(properties: G): Group<G> => ({ [GROUP]: properties });
const isGroup = (initial: unknown): initial is Group =>
  Boolean((initial as Partial<Group> | null | undefined)?.[GROUP]);

// A member of a group that is a second name for another member of it
// (a font's `size` for its `pixelSize`): what a whole value given to
// the group says by that name is not read, because the member it names
// reads the whole value already, and the two must never disagree on
// the one object once that member is written to.
const ALONE = Symbol("alone");
export interface Alone<V = unknown> {
  readonly [ALONE]: V;
}
export const alone = <V>(initial: V): Alone<V> => ({ [ALONE]: initial });
const isAlone = (initial: unknown): initial is Alone =>
  (initial as Partial<Alone> | null | undefined)?.[ALONE] !== undefined;

// A property of a type: `property int hours` is an int, whatever it is
// given, and what it is given becomes one as Qt makes it one. `typed(int, 0)`
// is such a property that is 0 until something says otherwise. What cannot
// become one is refused: an assignment throws, as Qt's does, and a binding is
// told of and leaves the property what it was.
const TYPED = Symbol("typed");
const REFUSED = Symbol("refused");
// What a property is given and takes no notice of, silently: it stays what
// it was, as an Item stays where it is when its `x` is given NaN.
const KEPT = Symbol("kept");
export interface Typed<V = unknown> {
  readonly [TYPED]: Kind;
  readonly initial: V;
}
export const typed = <V>(kind: Kind, initial: V): Typed<V> => ({ [TYPED]: kind, initial });
const isTyped = (initial: unknown): initial is Typed =>
  Boolean((initial as Partial<Typed> | null | undefined)?.[TYPED]);

// A number that is one: where an item is and how big. Qt's setters return
// at once from a NaN, so a binding that has yet to make sense (a size worked
// out from a picture that is still loading) leaves the item as it was. All
// else is taken as it is, nothing too: that is how a size is given back to
// what the item would be of itself.
function place(value: unknown): unknown {
  return value !== value && typeof value === "number" ? KEPT : value;
}
place.type = "double";
place.any = true;

// A number in a string, as Qt reads one: all of it, and in tens.
const NUMERAL = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

// A number is cut to 32 bits, as JavaScript's `| 0` cuts it; a string is
// read and rounded.
function int(value: unknown): number | typeof REFUSED {
  switch (typeof value) {
    case "number":
      return value | 0;
    case "boolean":
      return value ? 1 : 0;
    case "string": {
      const text = value.trim();
      if (!NUMERAL.test(text)) return REFUSED;
      const number = Number(text);
      if (!Number.isFinite(number)) return REFUSED;
      const rounded = number < 0 ? -Math.round(-number) : Math.round(number);
      return Math.abs(rounded) >= 2 ** 31 ? -(2 ** 31) : rounded | 0;
    }
    default:
      return REFUSED;
  }
}
int.type = "int";

// How big a font is, in pixels: a whole number that is more than nothing,
// the nearest one to what it is given. Qt's font takes no notice of a size
// that is not, and stays as big as it was; what is no number at all (the NaN
// of a sum with something missing in it) cannot be one.
function pixels(value: unknown): number | typeof REFUSED | typeof KEPT {
  if (typeof value === "number" && !Number.isFinite(value)) return REFUSED;
  const made = typeof value === "number" ? Math.round(value) : int(value);
  return made === REFUSED || made > 0 ? made : KEPT;
}
pixels.type = "int";

// And in points, which need not be whole.
function points(value: unknown): number | typeof REFUSED | typeof KEPT {
  const made = real(value);
  return made === REFUSED || made > 0 ? made : KEPT;
}
points.type = "double";

// Whatever JavaScript makes a number of, so a string that is no number is
// not refused: it is NaN.
function real(value: unknown): number | typeof REFUSED {
  if (typeof value === "number") return value;
  if (typeof value === "symbol" || typeof value === "bigint") return REFUSED;
  try {
    return Number(value);
  } catch {
    return NaN;
  }
}
real.type = "double";

// A share of the whole, as an opacity is: no less than none of it and no
// more than all.
function share(value: unknown): number | typeof REFUSED {
  const made = real(value);
  return made === REFUSED ? made : made < 0 ? 0 : made > 1 ? 1 : made;
}
share.type = "double";

const bool = (value: unknown): boolean => Boolean(value);
bool.type = "bool";

// A number as Qt writes one into a string: the shorter of the plain and the
// scientific, whose exponent has two digits at least. One that could be an
// int is written as one. (Qt writes a whole number it holds as a double the
// other way, `1e+05`: whether it does is not to be seen from here.)
function numeral(value: number): string {
  if (!Number.isFinite(value)) return Number.isNaN(value) ? "nan" : value > 0 ? "inf" : "-inf";
  const plain = String(value);
  if (Number.isInteger(value) && Math.abs(value) < 2 ** 31) return plain;
  const [mantissa, exponent] = value.toExponential().split("e");
  const power = Number(exponent);
  const scientific = `${mantissa}e${power < 0 ? "-" : "+"}${String(Math.abs(power)).padStart(2, "0")}`;
  return plain.includes("e") || scientific.length < plain.length ? scientific : plain;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = (number: number): string => String(number).padStart(2, "0");

// A date as Qt writes one: `Thu Jan 1 01:00:00 1970 GMT+0100`.
function dated(date: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  const offset = -date.getTimezoneOffset();
  const zone = `${offset < 0 ? "-" : "+"}${two(Math.trunc(Math.abs(offset) / 60))}${two(Math.abs(offset) % 60)}`;
  const time = `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
  return `${DAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${date.getDate()} ${time} ${date.getFullYear()} GMT${zone}`;
}

// Numbers, colours, dates and nothing at all have a text; an object has
// none. A list has the text of the one thing in it.
// A list written to a string is a list of letters to Qt: the first of a
// string, the one a number is the code of.
function letter(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 1);
  if (Array.isArray(value)) return value.length ? letter(value[0]) : "";
  return String.fromCharCode(typeof value === "number" || typeof value === "boolean" ? Number(value) : 0);
}

function string(value: unknown): string | typeof REFUSED {
  switch (typeof value) {
    case "string":
      return value;
    case "number":
      return numeral(value);
    case "boolean":
      return String(value);
    case "object": {
      if (value === null) return "";
      if (Array.isArray(value)) return value.map(letter).join("");
      if (value instanceof Color) return String(value);
      if (value instanceof Date) return dated(value);
      return REFUSED;
    }
    default:
      return REFUSED;
  }
}
string.type = "QString";

// A colour is a value, whatever it was written as; what is no colour is the
// colour that is not one.
const tint = (value: unknown): Color => color(value);
tint.type = "QColor";

// What Qt calls the value it refuses.
function named(value: unknown): string {
  if (value === undefined) return "[undefined]";
  if (value === null) return "std::nullptr_t";
  switch (typeof value) {
    case "string":
      return "QString";
    case "number":
      return Number.isInteger(value) ? "int" : "double";
    case "boolean":
      return "bool";
    case "function":
      return "JavaScript function";
    default:
      if (value instanceof Color) return "QColor";
      if (value instanceof Date) return "QDateTime";
      return (value as { $type?: unknown } | null)?.$type ? "QObject*" : "QJSValue";
  }
}

// For a type that says how a property of its own is typed:
// `typed(kinds.int, -1)`.
export const kinds: Readonly<Record<"int" | "real" | "share" | "bool" | "string" | "color" | "place" | "pixels" | "points", Kind>> = {
  int,
  real,
  share,
  bool,
  string,
  color: tint,
  place,
  pixels,
  points,
};

// What the compiler declares a property of a file as.
export const $int = typed(int, 0);
export const $real = typed(real, 0);
export const $bool = typed(bool, false);
export const $string = typed(string, "");
export const $color = typed(tint, color(""));

// A binding's value as the property's type has it. What the type refuses
// leaves the property as it was: what the binding last gave it, or `last`,
// what it was given before it had the binding.
function converted(key: string, kind: Kind, compute: () => unknown, last?: unknown): () => unknown {
  return () => {
    const value = compute();
    if (value === undefined) return value;
    const made = kind(value);
    if (made === KEPT) return last;
    if (made !== REFUSED) return (last = made);
    console.warn(`${key.replaceAll("$", ".")}: Unable to assign ${named(value)} to ${kind.type}`);
    return last;
  };
}

const next = (version: number): number => version + 1;

// An effect's callback runs while Solid settles what changed, and what it
// assigns is settled by the same flush: it must not ask for another.
let settling = 0;
// How many of those callbacks are running: Solid's own flush does nothing
// inside one, and says so.
let applying = 0;
function settled<A extends unknown[], T>(work: (...args: A) => T, ...args: A): T {
  settling++;
  applying++;
  try {
    return work(...args);
  } finally {
    settling--;
    applying--;
  }
}

// What a program is told of (a property that changed, a signal, an object
// that is complete) it is told once what changed has settled: a handler that
// assigns finds what depends on the assignment up to date, as it does in QML,
// and inside Solid's flush nothing can be. So what is found out in a flush is
// told after it.
let told: (() => unknown)[] = [];
let asked = false;

// Whoever flushed tells; this is for a flush nobody here asked for.
function ask() {
  if (asked) return;
  asked = true;
  queueMicrotask(() => {
    asked = false;
    tell();
  });
}

function after(work: () => unknown): void {
  told.push(work);
  ask();
}

// After all there is to tell, and all that telling it brings: what Qt tells
// of last, as a Loader that it has loaded once `item` and `status` changed.
let late: (() => unknown)[] = [];
export function last(work: () => unknown): void {
  late.push(work);
  ask();
}

// Now, unless a flush is on.
function soon(work: () => unknown): void {
  if (settling) after(work);
  else untrack(work);
}

// What a handler changes is told of before the next handler is: its own
// flush tells, and this goes on where it was.
let telling = 0;
function tell() {
  telling++;
  try {
    for (;;) {
      if (told.length === 0) {
        if (telling > 1 || late.length === 0) return;
        told = late;
        late = [];
      }
      const mine = told;
      told = [];
      let index = 0;
      try {
        for (; index < mine.length; index++) untrack(mine[index] as () => unknown);
      } finally {
        if (index < mine.length) told.unshift(...mine.slice(index + 1));
      }
    }
  } finally {
    telling--;
  }
}

// Solid's `flush`, and then what it found to tell. Inside an effect's
// callback the flush that is on settles what is changed there.
export function flush(): void {
  if (!applying) drain();
  tell();
}

// What a type's method does once it has changed something, so that what
// depends on the change is up to date when it returns, as it is in QML.
export function settle(): void {
  if (!settling) flush();
}

// Whether a flush is on, where `settle()` settles nothing: for what cannot
// go on until what it changed has settled.
export const flushing = (): boolean => settling > 0;

// What `work` emits and changes is told of once it is done, what it emitted
// first: for what Qt tells of before it tells of the change that made it.
export function gather<T>(work: () => T): T {
  if (settling) return work();
  settling++;
  try {
    return work();
  } finally {
    settling--;
    flush();
  }
}

// A value an object holds that a program reads the members of, as a node's
// `position`, is that object's still in the program's hands: `p.x` is what
// the node has now. What a property is given of it, by an assignment or a
// binding, is the value as it was then (`$copy`), as in Qt.
const own = (value: unknown): unknown =>
  value !== null && typeof value === "object" && typeof (value as { $copy?: unknown }).$copy === "function"
    ? (value as { $copy(): unknown }).$copy()
    : value;

// A binding that cannot be evaluated, as `game.over` before there is a
// game, is told of and leaves the property what it was: QML's rule, which
// programs written for it lean on. Only what asking too much of a value
// throws is taken so: any other error is the runtime's, or of a type it does
// not have.
//
// It is told of once what changed has settled, and not at all where the
// object ended in the meantime: a delegate whose row went with what it read
// (`text: list[index].label` under `model: list.length`) is destroyed in Qt
// before its binding is asked, and here in the same flush as it is.
//
// And not while objects are being made: Qt keeps the error until the ones
// being made all are, and has none to tell of where the binding could be
// evaluated by then, as `stack.currentItem.title` can once the stack has its
// first item. So it is asked again then (unless it is not `pure`: what makes
// objects would make them twice).
interface Failure {
  ended: boolean;
  kept: boolean;
  again: boolean;
  error: unknown;
}

function guarded(key: string, compute: () => unknown, pure = true, self?: QObject): Guard {
  let last: unknown;
  let ran = false;
  let failed: Failure | null = null;
  const guard: Guard = Object.assign(() => {
    // Evaluated again, so not ended: what cleaned up was this. One kept for
    // later is spoken for by this evaluation.
    if (failed?.kept) failed.again = true;
    else if (failed) failed.ended = false;
    failed = null;
    guard.failing = false;
    const before = early;
    try {
      const value = own(compute());
      // A binding that gives its object something new changed a property
      // of it as a write does: a Controller there is told so
      // (Ljos/Core/controller.js).
      if (ran && !Object.is(value, last)) self?.$written?.();
      ran = true;
      return (last = value);
    } catch (error) {
      if (!(error instanceof TypeError)) {
        // Under a boundary it is the boundary's; a binding's throw would
        // otherwise stop the page's whole reactive graph.
        const boundary = self?.$fault;
        if (!boundary) throw error;
        boundary(error, self);
        guard.failing = true;
        return last;
      }
      guard.failing = true;
      // Nothing to tell of what met an object that is not made yet: Qt
      // evaluates no binding until all of them are, and this one is
      // evaluated again when that one is.
      if (early === before) {
        const failure: Failure = (failed = { ended: false, kept: creating > 0, again: false, error });
        if (getOwner()) onCleanup(() => (failure.ended = true));
        const tell = () => {
          if (failure.ended || failure.again) return;
          if (failure.kept && pure) {
            try {
              untrack(compute);
              return;
            } catch (error) {
              if (!(error instanceof TypeError)) return;
              failure.error = error;
            }
          }
          console.warn(`${key.replaceAll("$", ".")}: ${failure.error}`);
        };
        if (failure.kept) kept.push(tell);
        else after(tell);
      }
      return last;
    }
    // Whether it could not be evaluated when last asked: it then has nothing
    // new to give.
  }, { failing: false });
  return guard;
}

// The objects a property is given (`background: Rectangle {}`) are made once,
// by a binding that reads nothing. Solid would still evaluate it again: what
// is made reads, outside a flush, values written since the last one, and
// whatever computation that happens under is run again by the flush that
// carries them. So they are made under an owner of their own, which is no
// computation, and end when the binding does.
export function apart<T>(make: () => T): () => T {
  return () => {
    const owner = getOwner();
    return runWithOwner(null, () =>
      createRoot((dispose) => {
        if (owner) runWithOwner(owner, () => onCleanup(dispose));
        return make();
      }),
    );
  };
}

// A value computed from others and kept until one of them changes, which what
// it is computed from may ask for: `sourceSize.width: height` on a picture as
// high as it is loaded, `a.width: b.width + 1` where `b.width: a.width`. A
// loop, which ends where it began as Qt ends it: whatever asks for the value
// while it is computed gets what it had, and is told when that has changed,
// once. What it then makes of it is not told of again; the value itself is
// never told. `first` is what it had before it was ever computed.
//
// A loop may also close once everything was computed: a property bound again
// by a handler, `layout = Qt.binding(() => window.width < 480 ? ...)`, to what
// depends on it. So each value knows which values it was computed from, and
// one that asks for a value computed from itself gets what that one has, as
// above. Such values are a ring, and a change goes round a ring once: the
// value that began it is, as Qt has it, still telling of its change when what
// the change made of the others comes back to it, and stays what it is.
// (Qt would compute it again for what it had read before; here, for what it
// read of what the change made.) Only a binding begins a change so: what a
// type works out for itself, a picture's size, is computed whenever asked.
export function looped<T>(owner: Owner | null, compute: () => T, first?: T): Bound<T> {
  return ringed(owner, compute, first, false);
}

// A binding given later than the object was made: what a state binds a
// property to while it is in it.
export function bound<T>(owner: Owner | null, compute: () => T, first?: T): Bound<T> {
  return ringed(owner, compute, first, true);
}

// Where what an evaluation of the graph's makes is held: an owner that never
// ends and so never ends it. The graph evaluates as a write reaches it, and
// a layout writes where its items go in an effect's callback, where Solid's
// development build refuses a root with no owner at all. Ended, a root is
// taken off its owner, so nothing piles up here.
const PARKED: Owner | null = WASM ? (runWithOwner(null, () => createRoot(() => getOwner())) ?? null) : null;

// A binding on the wasm kernel's graph, which decides when it is out of
// date and where a loop ends: one that asks for its own value while it is
// computed gets what it had, as the graph gives any binding it is running.
// What is read through the same interface as `ringed`'s.
function graphed<T>(owner: Owner | null, compute: () => T, first?: T, own = false): Bound<T> {
  let held = first as T;
  let index: number | undefined;
  let evaluating = false;
  let done = false;
  // What an evaluation made (an effect, an object a binding gives) is its
  // own, and ends once the next evaluation is over, as what a memo makes
  // does: under whatever owner was current when the graph ran it, it would
  // outlive it and pile up. Not at once: what ends may write, and a write
  // inside the evaluation would run it again.
  let made: (() => void) | null = null;
  const run = () => {
    const before = held;
    const spent = made;
    if (spent) after(spent);
    evaluating = true;
    try {
      held = runWithOwner(PARKED, () =>
        createRoot((dispose) => {
          made = dispose;
          return compute();
        }),
      ) as T;
    } finally {
      evaluating = false;
    }
    done = true;
    return !Object.is(before, held);
  };
  const get = () => {
    follow(index as number, owner);
    return held;
  };
  // Made, and evaluated, as it is taken: as Solid's memo is.
  const start = () => {
    if (index === undefined) {
      if (owner) runWithOwner(owner, () => onCleanup(() => made?.()));
      index = binding(owner, run);
      if (own) typeOwn(index);
      untrack(get);
    }
    return get;
  };
  const read = Object.assign(
    () => {
      if (evaluating) {
        // As an object named by an id is not made yet, a value that is still
        // being computed for the first time is not.
        if (!done) early++;
        // The graph is still told: the read closes a loop it has to end, and
        // the reader is run again once the value is there.
        follow(index as number, owner);
        return held;
      }
      return read.start()();
    },
    { start, begin: start, busy: () => evaluating },
  );
  return read;
}

// A value worked out from properties, for what keeps one outside a slot:
// Solid's memo on the Solid kernel, a node of the graph on the wasm one,
// where a binding reading a Solid memo would not see it change.
export function memo<T>(compute: () => T, options: { sync?: boolean } = SYNC): Accessor<T> {
  if (!WASM) return createMemo(compute, options);
  const read = graphed(getOwner(), compute);
  read.start();
  return read;
}

// What `ringed` keeps of a value: see there.
type Observer = ReturnType<typeof getObserver>;
interface Ring {
  node: Observer;
  from: Set<Ring> | null;
  fresh: Set<Ring> | null;
  outer: Ring | null;
  done: boolean;
  asked: boolean;
  at: number;
  checked: number;
  ring: boolean;
  wave: number;
  began: number;
  heard: number;
  own: boolean;
}

function ringed<T>(owner: Owner | null, compute: () => T, first: T | undefined, binding: boolean): Bound<T> {
  if (WASM) return graphed(owner, compute, first, !binding);
  let memo: Accessor<T> | undefined;
  let held = first as T;
  let evaluating = false;
  // Who asked while it was computed, and asks for what it had ever since:
  // asking for the value itself would close the loop.
  let back: WeakSet<object> | null = null;
  let track: Accessor<number> | null = null;
  let bump: Setter<number> | null = null;
  let echoing = false;
  // Bound by an assignment: a change, where what a property is first given
  // is not.
  let beginning = false;
  const record: Ring = {
    node: null,
    // What it was computed from, and what it has read while being computed.
    from: null,
    fresh: null,
    // What is being computed with it, while it is.
    outer: null,
    done: false,
    asked: false,
    // When it last changed, and when it was last computed.
    at: 0,
    checked: 0,
    ring: false,
    // The change its value came of, and the one it began itself.
    wave: 0,
    began: 0,
    heard: 0,
    own: false,
  };
  const echo = () => {
    echoing = true;
    try {
      bump!(next);
      drain();
    } finally {
      echoing = false;
    }
    tell();
  };
  const evaluate = () => {
    record.node = getObserver();
    const before = held;
    let value: T;
    record.outer = evaluated;
    evaluated = record;
    evaluating = true;
    record.heard = 0;
    record.own = false;
    try {
      value = compute();
    } finally {
      evaluating = false;
      evaluated = record.outer;
      record.outer = null;
      // What it read this time is what it is computed from.
      const spent = record.from;
      record.from = record.fresh;
      record.fresh = spent;
      spent?.clear();
      record.checked = clock;
    }
    if (record.own) return held;
    held = value;
    const changed = !Object.is(before, held);
    if (!record.done) {
      record.done = true;
      record.at = ++clock;
      if (beginning) {
        record.ring = true;
        record.wave = record.began = ++waves;
      } else if (record.ring) record.wave = record.heard;
    } else if (changed) {
      record.at = ++clock;
      if (record.ring) {
        record.wave = record.heard || (binding ? ++waves : 0);
        record.began = record.heard ? 0 : record.wave;
      }
    }
    if (back && !echoing && changed) after(echo);
    return held;
  };
  // What the value being computed makes of this one, where both are of a
  // ring: whether it is computed again for a change it began itself.
  const hear = (asking: Ring) => {
    if (!asking.ring || !record.ring || record.at <= asking.checked || !record.wave) return;
    if (record.wave === asking.began) asking.own = true;
    else asking.heard = record.wave;
  };
  const weak = (reader: object, asking: Ring | null) => {
    if (asking) hear(asking);
    if (!back) {
      back = new WeakSet();
      [track, bump] = createSignal(0, WRITABLE);
      // Nothing computes a value that nothing asks for, and one that is
      // only asked for what it had is to say when that has changed.
      after(() => runWithOwner(owner, () => createRenderEffect(() => read.start()(), () => {})));
    }
    back.add(reader);
    track!();
    return held;
  };
  const read: Bound<T> = Object.assign(() => {
    const reader = getObserver();
    const asking = reader && evaluated !== null && evaluated.node === reader ? evaluated : null;
    if (evaluating) {
      // What it is first computed to be is not made yet, as an object named
      // by an id is not: `contentItem.width` in what `contentItem` is given.
      if (!record.done) early++;
      if (reader === record.node) return held;
      if (!reader) return held;
      // All that is being computed between the two is of the ring.
      for (let inner = asking; inner; inner = inner === record ? null : inner.outer) inner.ring = true;
      return weak(reader, asking);
    }
    if (reader && back?.has(reader)) return weak(reader, asking);
    if (!asking) return read.start()();
    // Only what it did not read before can close a ring, and only around
    // what something was computed from.
    if (asking.done && asking.asked && !asking.from?.has(record) && !asking.fresh?.has(record)) {
      if (between(record, asking)) {
        // A value just given is the change that goes round.
        if (record.at > asking.checked && !record.began) record.wave = record.began = ++waves;
        return weak(reader!, asking);
      }
    }
    (asking.fresh ??= new Set()).add(record);
    record.asked = true;
    const value = read.start()();
    hear(asking);
    return value;
  }, {
    // Evaluated when first read, unless begun before.
    start: () => (memo ??= runWithOwner(owner, () => createMemo(evaluate, SYNC))),
    // The same for a binding that an assignment gives.
    begin: () => {
      beginning = true;
      return read.start();
    },
    busy: () => evaluating,
  });
  return read;
}

// The value being computed, innermost.
let evaluated: Ring | null = null;
// Counts the changes of values, and the changes that began of themselves.
let clock = 0;
let waves = 0;

// Whether `goal` asking for `start` would close a ring: everything on a way
// from `start` to `goal`, through what each was computed from, is of it then.
function between(start: Ring, goal: Ring): boolean {
  const leads = new Map<Ring, boolean>([
    [goal, true],
    [start, false],
  ]);
  const path = [start];
  const rest = [sources(start)];
  while (path.length) {
    const step = rest[rest.length - 1]!.next();
    if (step.done) {
      rest.pop();
      const record = path.pop()!;
      if (path.length && leads.get(record)) leads.set(path[path.length - 1]!, true);
      continue;
    }
    const known = leads.get(step.value);
    if (known) leads.set(path[path.length - 1]!, true);
    else if (known === undefined) {
      leads.set(step.value, false);
      path.push(step.value);
      rest.push(sources(step.value));
    }
  }
  if (!leads.get(start)) return false;
  for (const [record, led] of leads) if (led) record.ring = true;
  return true;
}

function* sources(record: Ring): Generator<Ring, void, undefined> {
  if (record.from) yield* record.from;
  if (record.fresh) yield* record.fresh;
}

// The fields are the constructor's to make, in the order it makes them:
// declared, not defined, so that a slot is made as it always was.
class Slot {
  declare alone: boolean;
  declare self: QObject;
  declare key: string;
  declare initial: unknown;
  declare resolve: Resolve | undefined;
  declare kind: Kind | undefined;
  declare whole: string | undefined;
  declare member: string | undefined;
  declare bound: Bound | null;
  declare given: unknown;
  declare assigned: boolean;
  declare value: unknown;
  declare placed: unknown;
  declare over: boolean;
  declare shown: (() => unknown) | null;
  declare layers: Layer[] | null;
  declare version: Accessor<number> | null;
  declare bump: Setter<number> | null;
  declare cell: number | undefined;
  declare given$: (() => unknown) | null;

  constructor(
    self: QObject,
    key: string,
    initial?: unknown,
    resolve?: Resolve,
    whole?: string,
    member?: string,
    kind?: Kind,
    alone?: boolean,
  ) {
    this.alone = alone === true;
    this.self = self;
    this.key = key;
    this.initial = initial;
    this.resolve = resolve;
    // What makes a value one of the property's type, when it has one.
    this.kind = kind;
    // For a property of a group, the group and its name in it: `font` and
    // `bold` for `font.bold`, which `font: other.font` gives too.
    this.whole = whole;
    this.member = member;
    this.bound = null;
    this.given = undefined;
    this.assigned = false;
    this.value = undefined;
    // Set by whatever lays the object out: a positioner, a layout, a view.
    // An assignment is over it until it is laid out somewhere else.
    this.placed = undefined;
    this.over = false;
    // Set by a Behavior: what is shown while the value it follows moves.
    this.shown = null;
    // What is put over all the property has of its own (a theme over a
    // module's value), the last on top: taken off, what was under it is
    // what the property has again.
    this.layers = null;
    // A slot has no signal of its own until something follows it: most
    // properties are read once as an object is made, and never again.
    this.version = null;
    this.bump = null;
    // The same on the wasm kernel: the number of its node.
    this.cell = undefined;
    this.given$ = resolve ? () => this.own() : null;
    // A binding is evaluated as it is taken, and may read the property it
    // is for: the slot is there to be found before it is.
    self.$slots[key] = this;
    this.take(self.$props, key);
  }

  // What the object's creator gave the property: `props[key]`.
  take(props: Props, key: string): void {
    const self = this.self;
    const descriptor = Object.getOwnPropertyDescriptor(props, key);
    // A binding: evaluated when first read and again when what it read
    // changes, however many readers there are. An item it makes
    // (`background: Rectangle {}`) is made as a child of this one, or of
    // the content item of a window.
    // What it reads of its own property, itself or through another's
    // binding, is what the property had.
    const kind = this.kind;
    // A kind may make what it is given into its value inside the object
    // (`QtQuick/Templates/parts.js`).
    const given = kind?.made ? () => (kind.made as (value: unknown) => unknown)(props[key]) : () => props[key];
    const make = () => complete(() => inside(self.$contentItem ?? (self.$node ? self : null), given));
    const made = props.$made?.includes(key);
    const compute = descriptor?.get ? guarded(key, made ? apart(make) : make, !made, self) : null;
    this.bound = compute ? ringed(self.$owner, kind ? converted(key, kind, compute, this.given) : compute, undefined, true) : null;
    this.given = descriptor && !descriptor.get ? this.made(descriptor.value) : undefined;
    this.bound?.start();
  }

  // The same from somewhere else: what an instance binds to an alias is a
  // binding of the property the alias names.
  bind(props: Props, key: string): void {
    this.take(props, key);
    this.assigned = false;
    this.value = undefined;
    this.changed();
  }

  // Has whoever is reading told when the property changes.
  follow(): void {
    if (WASM) {
      if (this.cell === undefined) {
        if (!followed()) return;
        this.cell = cell(this.self.$owner ?? null);
      }
      follow(this.cell, this.self.$owner ?? null);
      return;
    }
    if (!this.version) {
      if (!getObserver()) return;
      // The signal is the object's, not of the computation that happens to
      // be the first to read the property.
      [this.version, this.bump] = runWithOwner(this.self.$owner ?? null, versioned);
    }
    this.version();
  }

  get(): unknown {
    this.follow();
    return this.shown ? this.shown() : this.target();
  }

  // What the property was given, before its type has its say.
  asked(): unknown {
    this.follow();
    return this.own();
  }

  // The value the property has, whatever is animating towards it.
  target(): unknown {
    return this.resolve ? this.resolve(dynamic(this.self), this.given$!) : this.own();
  }

  own(): unknown {
    if (this.placed !== undefined && !this.over) {
      if (typeof this.placed !== "function") return this.placed;
      // Placed by what something else is, as wide as a share of its box:
      // asked each time, and nothing where it has no say.
      const placed = (this.placed as () => unknown)();
      if (placed !== undefined) return placed;
    }
    if (this.layers) return this.layers.at(-1)!.read();
    return this.base();
  }

  // What the property has of its own, under whatever is over it.
  base(): unknown {
    const back = this.assigned && this.back();
    if (this.assigned && !back) return this.value;
    let value = back ? undefined : this.bound ? this.bound() : this.given;
    if (value === undefined && this.whole && !this.alone) {
      value = (slot(this.self, this.whole)!.get() as Record<string, unknown> | null | undefined)?.[this.member as string];
    }
    if (value === undefined) value = derive$(this.initial, this.self);
    return value;
  }

  // Given nothing where nothing is what gives it back: `width = undefined`
  // is no binding any more and no width of its own, so the implicit one.
  back(): boolean {
    return this.value === undefined && this.kind?.any === true;
  }

  // Whether something gave the property a value: a border is drawn only
  // when its width or colour was set.
  explicit(): boolean {
    this.follow();
    if (this.layers) return true;
    if (this.assigned) return !this.back();
    return (this.bound ? this.bound() : this.given) !== undefined || this.bound?.busy?.() === true;
  }

  changed(): void {
    // A Controller that handles `updated` is told its host was written to
    // (Ljos/Core/controller.js); nothing is asked of any other object.
    this.self.$written?.();
    if (WASM) {
      if (this.cell !== undefined) touch(this.cell);
      return;
    }
    this.bump?.(next);
  }

  // An assignment: it replaces the binding, as in QML, and what depends on
  // the property is up to date when it returns.
  set(value: unknown): void {
    if (this.write(own(value))) settle();
  }

  // The same without settling what depends on it: for a type's own writes,
  // which an animation makes every frame.
  write(value: unknown): boolean {
    if (isBinding(value)) return this.rebind(value);
    if (this.kind) {
      const made = value === undefined && !this.kind.any ? REFUSED : this.kind(value);
      if (made === KEPT) return false;
      if (made === REFUSED) throw Object.assign(new Error(`Cannot assign ${named(value)} to ${this.kind.type}`), { refused: true });
      value = made;
    }
    // Where an object was put, it is until what laid it out puts it
    // somewhere else: a row that is dragged stays where it was dragged to
    // until its view lays its rows out again, as in Qt. (Qt puts every row
    // back then, and this only those that are to be elsewhere.) How big it
    // is is not its own to say: a layout that sized it sizes it again.
    if (this.placed !== undefined && !this.over && (this.key === "x" || this.key === "y")) this.over = true;
    // Over what is on top, as in Ljós: what was under it comes back as it
    // was when it is taken off.
    else if (this.layers) return this.layers.at(-1)!.put({ value }), true;
    else if (this.assigned && Object.is(this.value, value)) return false;
    this.assigned = true;
    this.value = value;
    this.changed();
    return true;
  }

  // `x = Qt.binding(f)`: bound again, by an assignment. `this` in `f` is
  // the object.
  rebind(compute: Rebinding): boolean {
    const self = this.self;
    if (this.layers) {
      this.layers.at(-1)!.put({ binding: () => compute.call(self) });
      return true;
    }
    // What it reads of its own property, itself or through another's
    // binding, is what the property had.
    const had = untrack(() => this.own());
    const guard = guarded(this.key, () => compute.call(self), true, self);
    this.bound = ringed(self.$owner, this.kind ? converted(this.key, this.kind, guard) : guard, had, true);
    this.bound.begin();
    this.assigned = false;
    this.value = undefined;
    this.changed();
    return true;
  }

  // What the property is given without a binding, as its type has it; what
  // cannot be of the type is as good as nothing.
  made(value: unknown): unknown {
    if (!this.kind || value === undefined) return value;
    const made = this.kind(value);
    return made === REFUSED || made === KEPT ? undefined : made;
  }

  // What a parent or a view gives the object: a default, not an assignment.
  provide(value: unknown): void {
    value = this.made(value);
    if (Object.is(this.given, value)) return;
    this.given = value;
    this.changed();
  }

  place(value: unknown): void {
    if (Object.is(this.placed, value)) return;
    this.placed = value;
    this.over = false;
    this.changed();
  }

  // Back to the binding, or to the default.
  reset(): void {
    if (!this.assigned) return;
    this.assigned = false;
    this.value = undefined;
    this.changed();
  }
}

// One layer over a slot: a value, or a binding of its own that may read what
// is under it.
export type { Slot };

// What a layer is given: a value, or a binding that may read what is under it.
export interface LayerContent {
  value?: unknown;
  binding?: ((below: () => unknown) => unknown) | undefined;
}

class Layer {
  declare slot: Slot;
  declare value: unknown;
  declare bound: Bound | null;
  declare end: (() => void) | null;

  constructor(slot: Slot) {
    this.slot = slot;
    this.value = undefined;
    this.bound = null;
    this.end = null;
  }

  read(): unknown {
    return this.bound ? this.bound() : this.value;
  }

  // What is under this layer, for a binding over it: a variant the theme
  // does not give is the module's own.
  below(): unknown {
    const layers = this.slot.layers!;
    const at = layers.indexOf(this);
    return at > 0 ? layers[at - 1]!.read() : this.slot.base();
  }

  put({ value, binding }: LayerContent): void {
    this.drop();
    const slot = this.slot;
    if (binding) {
      const below = () => this.below();
      // Its own root: the layer may be taken off long before the object ends.
      runWithOwner(null, () =>
        createRoot((end) => {
          this.end = end;
          const guard = guarded(slot.key, () => binding(below), true, slot.self);
          this.bound = ringed(getOwner(), slot.kind ? converted(slot.key, slot.kind, guard) : guard, undefined, true);
          this.bound.start();
        }),
      );
    } else this.value = slot.made(value);
    slot.changed();
  }

  drop(): void {
    this.end?.();
    this.end = null;
    this.bound = null;
    this.value = undefined;
  }
}

// Puts `content` over what the property `key` of `self` has, whatever that
// is: `{ value }`, or `{ binding: (below) => ... }`, which is followed as any
// binding is and may read what is under it. Nothing is made again and the
// object keeps its state; what reads the property follows. Gives what
// changes the layer (`set(content)`) and what takes it off (`remove()`),
// after which the property has what it had under it.
export interface Override {
  set(content: LayerContent): void;
  remove(): void;
}

export function override(self: QObject, key: string, content: LayerContent): Override {
  const at = slot(self, key);
  if (!at) throw new Error(`${self.$type?.typeName ?? "object"} has no property ${key.replaceAll("$", ".")}`);
  const layer = new Layer(at);
  (at.layers ??= []).push(layer);
  layer.put(content);
  settle();
  return {
    set(content) {
      if (!at.layers?.includes(layer)) return;
      layer.put(content);
      settle();
    },
    remove() {
      const index = at.layers?.indexOf(layer) ?? -1;
      if (index < 0) return;
      layer.drop();
      at.layers!.splice(index, 1);
      if (at.layers!.length === 0) at.layers = null;
      at.changed();
      settle();
    },
  };
}

// The slot of a property (`slot(item, "x")`, `slot(item, "anchors$fill")`):
// for types that animate, place or provide it.
export function slot(self: QObject, key: string): Slot | undefined {
  return self.$slots[key] ?? self.$type.slots[key]?.(self);
}

function defineProperty(Type: QmlType, proto: object, name: string, initial: unknown): void {
  const resolve = Type.spec.resolve?.[name];
  // A type that says a property of its base's again says what it is until
  // told otherwise, not what kind of thing it is.
  const kind = (isTyped(initial) ? initial[TYPED] : undefined) ?? Type.slots[name]?.kind;
  if (isTyped(initial)) initial = initial.initial;
  const make: SlotMaker = (self) => (self.$slots[name] = new Slot(self, name, initial, resolve, undefined, undefined, kind));
  make.kind = kind;
  Type.slots[name] = make;
  Object.defineProperty(proto, name, {
    get(this: QObject) {
      return (this.$slots[name] ?? make(this)).get();
    },
    set(this: QObject, value: unknown) {
      (this.$slots[name] ?? make(this)).set(value);
    },
    enumerable: true,
    configurable: true,
  });
  defineChange(proto, name);
}

// Takes an object out of where it was and puts it where it is to be, among
// the children of each (`$add`, `$remove`), unless it is there already.
function rehome(self: QObject, old: QObject | null | undefined, parent: QObject | null | undefined): void {
  if (old !== parent) old?.$remove?.(self);
  if (parent?.$add && !(untrack(() => dynamic(parent).children) as QObject[] | undefined)?.includes(self)) parent.$add(self);
}

// `parent`, of a type whose objects are inside one another: one a program
// gives another parent is from then on among that one's children.
export function parental(Type: QmlType): void {
  const { get } = Object.getOwnPropertyDescriptor(Type.proto, "parent") as { get: (this: QObject) => QObject | null };
  Object.defineProperty(Type.proto, "parent", {
    get,
    set(this: QObject, value: unknown) {
      const old = untrack(() => get.call(this));
      if (!slot(this, "parent")!.write(value)) return;
      rehome(this, old, untrack(() => get.call(this)));
      settle();
    },
    enumerable: true,
    configurable: true,
  });
}

// The same for one whose `parent` is bound, whenever what it is bound to
// changes. `declared` is where it was made, which is where it is until then.
export function parented(self: QObject, props: Props, declared: (self: QObject) => QObject | null | undefined): void {
  if (!("parent" in props)) return;
  let among: QObject | null | undefined;
  effect(
    () => dynamic(self).parent as QObject | null | undefined,
    (parent) => {
      rehome(self, among === undefined ? declared(self) : among, parent);
      among = parent ?? null;
    },
  );
}

// `widthChanged`: a property's changes are a signal like any other, to emit
// and to connect to.
function defineChange(object: object, name: string): void {
  const changed = `${name}Changed`;
  Object.defineProperty(object, changed, {
    get(this: QObject) {
      return (this.$signals[changed] ??= changes(this, name));
    },
    configurable: true,
  });
}

function changes(self: QObject, name: string): ChangeSignal {
  const handler = handlerName(`${name}Changed`);
  const emit = signal(handling(self, handler), self) as ChangeSignal;
  const { connect } = emit;
  let watched = false;
  // Nothing watches a property nobody hears of. `first` is told what the
  // property is when the watch begins.
  emit.watch = (first) => {
    if (watched) return;
    watched = true;
    runWithOwner(self.$owner, () => onChange(self, name, emit, first));
  };
  emit.connect = (listener) => {
    emit.watch();
    connect(listener);
  };
  return emit;
}

function defineGroup(Type: QmlType, proto: object, name: string, properties: PropertySpecs): void {
  const view = {};
  for (let [property, given] of Object.entries(properties)) {
    const key = `${name}$${property}`;
    const resolve = Type.spec.resolve?.[key];
    const byItself = isAlone(given);
    if (byItself) given = (given as Alone)[ALONE];
    const kind = isTyped(given) ? given[TYPED] : undefined;
    const initial = isTyped(given) ? given.initial : given;
    const make = (self: QObject) => (self.$slots[key] = new Slot(self, key, initial, resolve, name, property, kind, byItself));
    Type.slots[key] = make;
    Object.defineProperty(view, property, {
      get(this: { $self: QObject }) {
        return (this.$self.$slots[key] ?? make(this.$self)).get();
      },
      set(this: { $self: QObject }, value: unknown) {
        (this.$self.$slots[key] ?? make(this.$self)).set(value);
      },
      enumerable: true,
    });
  }
  // The group as one value: what `font: other.font` binds, and what
  // assigning to `font` sets.
  const make = (self: QObject) => (self.$slots[name] = new Slot(self, name));
  Type.slots[name] = make;
  Object.defineProperty(proto, name, {
    get(this: QObject) {
      return (this.$groups[name] ??= Object.create(view, { $self: { value: this } }));
    },
    set(this: QObject, value: unknown) {
      (this.$slots[name] ?? make(this)).set(value);
    },
    enumerable: true,
    configurable: true,
  });
  Type.groups[name] = Object.keys(properties);
  defineChange(proto, name);
}

const handlerName = (name: string): string => `on${name[0]!.toUpperCase()}${name.slice(1)}`;

// The handler a signal runs: what the object was given, or what a state put
// in its place for as long as the state is the item's.
const handling = (self: QObject, handler: string) => (): Handler | undefined =>
  self.$replaced && handler in self.$replaced ? self.$replaced[handler] : (untrack(() => self.$props[handler]) as Handler | undefined);

// Puts `run` in the place of the handler of a signal, `onClicked`; nothing
// puts the object's own back.
export function replace(self: QObject, handler: string, run?: Handler | null): void {
  if (!self.$replaced) hidden(self, "$replaced", {});
  if (run) self.$replaced![handler] = run;
  else delete self.$replaced![handler];
  // A property's changes are told of from when somebody hears of them.
  (dynamic(self)[handler[2]!.toLowerCase() + handler.slice(3)] as Partial<ChangeSignal>).watch?.();
}

// What a handler throws stops that handler and is told of, as Qt warns of
// it: whoever emitted the signal goes on, and so do the handlers after it.
export function heard(handler: Handler, args: readonly unknown[] = [], self?: QObject): unknown {
  try {
    return handler(...args);
  } catch (error) {
    const boundary = self?.$fault;
    if (boundary) boundary(error, self);
    else reportError(error);
  }
  return undefined;
}

// What objects made now are under: whoever is told when a handler of one
// throws, in place of the page (a ShellLoader, which shows its fallback).
// Objects made under none report to the page, as before.
let fault: Boundary | null = null;
export function bounded<T>(boundary: Boundary, make: () => T): T {
  const outer = fault;
  fault = boundary;
  try {
    return make();
  } finally {
    fault = outer;
  }
}

// A signal is the function that emits it: `clicked(mouse)` runs the handler
// the object was given (`onClicked`) and whatever was connected since.
export function signal(given?: (() => Handler | null | undefined) | null, self?: QObject): Signal {
  const listeners = new Set<Handler>();
  const emit = ((...args: unknown[]) =>
    soon(() => {
      const handler = given?.();
      if (handler) heard(handler, args, self);
      for (const listener of [...listeners]) heard(listener, args, self);
    })) as Signal;
  emit.connect = (listener) => void listeners.add(listener);
  emit.disconnect = (listener) => void listeners.delete(listener);
  return emit;
}

function defineSignal(proto: object, name: string): void {
  const handler = handlerName(name);
  Object.defineProperty(proto, name, {
    get(this: QObject) {
      return (this.$signals[name] ??= signal(handling(this, handler), this));
    },
    enumerable: true,
    configurable: true,
  });
}

// `defineType("Rectangle", Item, { properties, signals, methods, enums,
// resolve, setup, adopt, attached })`.
//
// - `properties`: defaults by name; `derived(self => ...)` for one computed
//   from the object, `group({ ... })` for `anchors`, `font` and the like.
// - `signals`: names. `methods`: functions and accessors, `this` the object.
// - `enums`: `Text.Raised` and friends, set on the type itself.
// - `resolve`: `{ x: (self, own) => ... }` decides a property's value over
//   what it was given, which `own()` returns: anchors over `x`.
// - `setup(self, props)`: runs once per object, base type first, before the
//   object has children. This is where a visual type makes its DOM node
//   (`self.$node`) and its effects, with `effect`. It reads no property: the
//   objects a binding names may not exist yet.
// - `adopt(self, props)`: takes the objects declared inside this one,
//   `contents(props)`. The most derived type's is the one that runs.
// - `attached`: the type of `Type.attached(object)`, for `ListView.view` or
//   `Layout.fillWidth`. Its props are the object's `Type$name` ones.
export function defineType<
  B extends QObject = QObject,
  P extends PropertySpecs = {},
  S extends string = never,
  M extends object = {},
  E extends Enums = {},
>(name: string, base: QmlType<B> | null, spec: TypeSpec<Instance<B, P, S, M>, P, S, M, E> = {}): QmlType<Instance<B, P, S, M>> & E {
  type I = Instance<B, P, S, M>;
  const Type = ((props?: Props) => create(Type, props ?? {}) as I) as QmlType<I> & E;
  const proto: object = Object.create(base ? base.proto : Object.prototype);
  Type.enums = { ...base?.enums, ...spec.enums };
  Object.assign(Type, Type.enums);
  Type.typeName = name;
  Type.base = base;
  Type.spec = spec;
  Type.proto = proto;
  Type.slots = Object.create(base ? base.slots : null);
  Type.groups = Object.create(base ? base.groups : null);
  Type.chain = base ? [...base.chain, Type] : [Type];
  Type.adopt = spec.adopt ?? base?.adopt;
  for (const [property, initial] of Object.entries(spec.properties ?? {})) {
    if (isGroup(initial)) defineGroup(Type, proto, property, initial[GROUP]);
    else defineProperty(Type, proto, property, initial);
  }
  for (const signalName of spec.signals ?? []) defineSignal(proto, signalName);
  if (spec.methods) Object.defineProperties(proto, Object.getOwnPropertyDescriptors(spec.methods));
  const { attached } = spec;
  if (attached) Type.attached = (self) => attach(name, attached, self);
  Object.defineProperty(Type, Symbol.hasInstance, { value: isA });
  return Type;
}

// `item instanceof Shape`: the object is of the type, or of one that extends
// it. A component (`Tile.qml`) finds this through the type of its root, and
// its objects are the ones it made.
function isA(this: QmlType, object: unknown): boolean {
  const type = (object as Partial<QObject> | null | undefined)?.$type;
  if (!type) return false;
  if (Object.hasOwn(this, "chain")) return type.chain.includes(this);
  const made = (object as QObject).$props.$is;
  return Array.isArray(made) ? made.includes(this) : made === this;
}

// What waits for the tree being created: QML makes every object of a
// component before it evaluates a binding, so that one may name any other.
// `Component.onCompleted` handlers wait for the bindings too.
type Works = (() => unknown)[];
let waiting: Works | null = null;
let watches: ((firsts: Works) => void)[] | null = null;
let completions: (Works & { first?: Works }) | null = null;
// The objects properties hold (`header: ToolBar {}`), still to be made.
let holding: Works | null = null;
// The item whose children are being created.
let parent: QObject | null | undefined = null;
// How many creations are under way, one in the work of another, and the
// bindings that could not be evaluated in them: told of when all are done.
let creating = 0;
let kept: Works = [];

// Runs `work` once the objects being created all exist; now, if none are.
export function whenComplete(work: () => unknown): unknown {
  if (!waiting) return work();
  const owner = getOwner();
  waiting.push(() => runWithOwner(owner, work));
  return undefined;
}

// Runs `work` when the objects being created are told that they are
// complete, and before any `Component.onCompleted` of theirs: so Qt tells
// one that listens to its own completion as to a signal.
export function whenCompleted(work: () => unknown): unknown {
  if (!completions) return untrack(work);
  (completions.first ??= []).push(() => untrack(work));
  return undefined;
}

// Runs `work` as the objects being created are told that they are
// complete, after the `Component.onCompleted` of whatever holds the object
// being made now: a Controller is attached to a host that is complete.
export function whenToldComplete(work: () => unknown): unknown {
  if (!completions) return untrack(work);
  completions.push(() => untrack(work));
  return undefined;
}

// Runs `work` once they exist and before anything that waits for that: what
// an object makes of itself as it is completed (a Loader its item) is there
// for whatever looks at it then, the layout it is in for one.
export function whenMade(work: () => unknown): unknown {
  if (!holding) return work();
  const owner = getOwner();
  holding.push(() => runWithOwner(owner, work));
  return undefined;
}

// Runs `work` once nothing is being made any more, not the object a property
// holds either, which is made as the property is asked for and is not what
// the property has until it is: for what an object makes that may name
// whatever holds it, as the effect of the layer of a control's background
// does the control's `background`. Qt gives a property its object before it
// completes it.
export function whenHeld(work: () => unknown): void {
  if (creating > 0) kept.push(work);
  else after(work);
}

// A render effect that waits likewise: `compute` reads properties, `apply`
// writes what it returned to the DOM.
export function effect<T>(compute: () => T, apply: (value: T, previous?: T) => unknown): void {
  whenComplete(() => createRenderEffect(compute, (...args: [T, T?]) => settled(apply, ...args) as undefined));
}

function complete<T>(make: () => T): T {
  if (waiting) return make();
  const works: Works = (waiting = []);
  const watched: ((firsts: Works) => void)[] = (watches = []);
  const handlers: Works & { first?: Works } = (completions = []);
  const held: Works = (holding = []);
  let made: T;
  creating++;
  try {
    try {
      made = make();
    } finally {
      waiting = watches = completions = holding = null;
    }
    // Each is complete before what holds it has anything to do with it.
    for (const hold of held) hold();
    for (const work of works) work();
    // What changes from here on is a change: everything is as it was made.
    const firsts: Works = [];
    for (const watch of watched) watch(firsts);
    for (const handler of firsts) soon(handler);
    // What the objects make of each other once they are made, as a row of
    // where its items are and how wide that makes it, they have made before
    // any is told that it is complete.
    if (handlers.length > 0 || handlers.first) settle();
    for (const handler of handlers.first ?? []) soon(handler);
    // `Component.onCompleted`, as Qt tells of it: of the object made last
    // first, so of one before those in it, and of those the last first.
    for (let index = handlers.length - 1; index >= 0; index--) soon(handlers[index]!);
  } finally {
    if (--creating === 0) {
      for (const tell of kept) after(tell);
      kept = [];
    }
  }
  return made;
}

// The object what is being made now is made inside.
export const currentParent = (): QObject | null | undefined => parent;

// Creates objects as children of `item`: `parent` is theirs from the start.
export function inside<T>(item: QObject | null | undefined, make: () => T): T {
  const outer = parent;
  parent = item;
  try {
    return make();
  } finally {
    parent = outer;
  }
}

// A component's root is two things at once: the object its file describes
// and the instance somebody wrote (`Clock { city: "Oslo" }`). `own` is what
// the file binds, `given` what the instance does, which wins; a handler both
// have is run for both, the file's first.
export function inherit(own: Props, given: Props): Props {
  if (given.$given) given = inherit(given, given.$given);
  const props: Props = {};
  for (const key of Object.keys(own)) {
    if (key !== "$given") Object.defineProperty(props, key, Object.getOwnPropertyDescriptor(own, key)!);
  }
  for (const key of Object.keys(given)) {
    // Its children are put where the component says, and the object itself
    // is the one the component made.
    // What it finds names in is its own context, not the one it was made in.
    if (key === "children" || key === "$self" || key === "$given" || key === "$context") continue;
    const descriptor = Object.getOwnPropertyDescriptor(given, key)!;
    // What both say is put in place of what the file said, which may be
    // there as something computed (`$attach` of `T.Overlay`) that nothing
    // can be assigned to.
    const put = (value: unknown) => Object.defineProperty(props, key, { value, writable: true, enumerable: true, configurable: true });
    if (!(key in own)) Object.defineProperty(props, key, descriptor);
    else if (key === "$declare") put([own.$declare, given.$declare].flat());
    else if (key === "$is") put([own.$is, given.$is].flat());
    else if (key === "$attach" || key === "$made") put([...new Set([...(own[key] as readonly unknown[]), ...(given[key] as readonly unknown[])])]);
    else if (key === "$functions" || key === "$aliases") put({ ...own[key], ...given[key] });
    else if (HANDLER.test(key)) {
      put((...args: unknown[]) => {
        (own[key] as Handler | undefined)?.(...args);
        return (given[key] as Handler | undefined)?.(...args);
      });
    } else Object.defineProperty(props, key, descriptor);
  }
  // `default property list<QtObject> things`: what is written inside an
  // instance is the value of the property, not children of the object.
  if (own.$default && "children" in given && !given.$holding) {
    const [name, list] = own.$default;
    const get = () => {
      const made = untrack(() => flatten(given.children, []));
      return list ? made : (made.at(-1) ?? null);
    };
    Object.defineProperty(props, name, { get, enumerable: true, configurable: true });
    props.$made = [...(props.$made ?? []), name];
  }
  // Who gave what, the component's own file first.
  hidden(props, "$levels", [own, ...(given.$levels ?? [given])]);
  return props;
}

// `onClicked`, `Keys$onPressed`, `Component$onCompleted`.
const HANDLER = /^(\w+\$)?on[A-Z_]/;

// The type of an object that declares properties and signals of its own:
// `Item { property int hours; signal ticked }`. One per declaration, however
// many objects are made from it.
const derivations = new WeakMap<QmlType, WeakMap<Declared, QmlType>>();
function derive(Type: QmlType, declared: Declared | readonly Declared[]): QmlType {
  if (isList(declared)) return declared.reduce(derive, Type);
  let derivedTypes = derivations.get(Type);
  if (!derivedTypes) derivations.set(Type, (derivedTypes = new WeakMap()));
  let Derived: QmlType | undefined = derivedTypes.get(declared);
  if (!Derived) {
    Derived = defineType(Type.typeName, Type, { properties: declared.properties, signals: declared.signals });
    if (Type.attached) Derived.attached = Type.attached;
    derivedTypes.set(declared, Derived);
  }
  return Derived;
}

// `property alias text: label.text`: the property is another object's.
// `Array.isArray`, of a list that is read only.
const isList = <T>(value: T | readonly T[]): value is readonly T[] => Array.isArray(value);

type Held = Record<string, unknown> | null | undefined;

function defineAlias(self: QObject, name: string, [target, ...path]: AliasPath): void {
  const last = path.at(-1) as string;
  const holder = (): Held => path.slice(0, -1).reduce<Held>((object, member) => object?.[member] as Held, target);
  // What the instance gives the alias is the target's once everything is
  // made. A binding read before that reads what was given, as in Qt, where
  // none is read until then.
  const given = path.length > 0 && name in self.$props;
  const [early, setEarly] = given ? counted(true, getOwner()) : [];
  // A binding like any other: one that cannot be evaluated yet is told of.
  const binding = given ? guarded(name, () => self.$props[name]) : null;
  Object.defineProperty(self, name, {
    get: path.length
      ? () => (early?.() ? binding!() : holder()?.[last])
      : // A Component is what it is from the start; an object, once made.
        () => (target.$type || !target.$track ? target : (target.$track(), null)),
    set(value: unknown) {
      const object = holder();
      if (path.length && object) object[last] = value;
    },
    enumerable: true,
    configurable: true,
  });
  defineChange(self, name);
  if (!given) return;
  // What the instance binds to the alias is the target's binding.
  const key = path.join("$");
  whenComplete(() => {
    setEarly!(false);
    const aliased = target.$type && slot(target as unknown as QObject, key);
    if (aliased) return aliased.bind(self.$props, name);
    // An alias of an alias, or of an object made later: assigned instead.
    // Assigned when what is bound changes, not whenever it is worked out.
    createRenderEffect(
      createMemo(binding!),
      (value) =>
        settled(() => {
          const object = holder();
          // A binding that could not be evaluated has nothing to assign.
          if (!object || (value === undefined && binding!.failing)) return;
          // It is a binding all the same: a value the property cannot hold
          // leaves it what it held, and is told of.
          try {
            object[last] = value;
          } catch (error) {
            if (!(error as { refused?: boolean }).refused) throw error;
            console.warn(`${name}: ${(error as Error).message.replace("Cannot", "Unable to")}`);
          }
        }),
    );
  });
}

// What an object says of the object one of its properties holds is that
// object's: a handler of its signal (`toolbar.onBackClicked: ...`), a binding
// of its property (`stack.initialItem: Home { }`). `name` is the path from
// `holder`, `key` the prop.
function through(holder: QObject, props: Props, key: string, name: string): void {
  const at = name.indexOf("$");
  const head = name.slice(0, at);
  // An alias of a group (`property alias sourceSize: image.sourceSize`):
  // what is said of it is said of the group, of the object that has it.
  const [aliased, ...path] = holder.$props?.$aliases?.[head] ?? [];
  if (path.length) return onto(aliased, props, key, [...path, name.slice(at + 1)].join("$"));
  onto(untrack(() => dynamic(holder)[head]), props, key, name.slice(at + 1));
}

// Whether `value` is an object a type made.
const isObject = (value: unknown): value is Dynamic => Boolean((value as Partial<QObject> | null | undefined)?.$type);

function onto(target: unknown, props: Props, key: string, rest: string): void {
  // A group is the object's own, and its type's to read.
  if (!isObject(target)) return;
  // What the object was made with, it has.
  const given = Object.getOwnPropertyDescriptor(props, key)!;
  const had = Object.getOwnPropertyDescriptor(target.$props, rest);
  if (had && had.get === given.get && had.value === given.value) return;
  const handled = /^on([A-Z_])(\w*)$/.exec(rest);
  if (handled) return connect(target, handled[1]!.toLowerCase() + handled[2]!, (...args: unknown[]) => (props[key] as Handler | undefined)?.(...args));
  const held = slot(target, rest);
  if (held) return held.bind(props, key);
  if (rest.includes("$")) return through(target, props, key, rest);
  // An alias: assigned.
  if (!(rest in target)) return;
  const binding = guarded(key, () => props[key]);
  createRenderEffect(binding, (value) =>
    settled(() => {
      // A binding that could not be evaluated has nothing to assign.
      if (value !== undefined || !binding.failing) target[rest] = value;
    }),
  );
}

// What type is being made now, while its setups run: a prerender
// writes it in an element's hydration key with the making's number,
// and hydration expects it of the same making, so that a page made
// differently is told apart where its elements are all `<div>`s.
// Held where the prerender's document reads it as it makes an
// element (`server/dom.js`), which is not in a page.
const MAKING_KIND = Symbol.for("ljos-web.making-kind");
let makingKind = "";
const kindNow = (kind: string): void => {
  makingKind = kind;
  (globalThis as Record<symbol, unknown>)[MAKING_KIND] = kind;
};

function create(Type: QmlType, props: Props): QObject {
  if (props.$given) props = inherit(props, props.$given);
  if (props.$declare) Type = derive(Type, props.$declare);
  const self = props.$self ?? $object();
  const outerKind = makingKind;
  kindNow(Type.typeName ?? "");
  try {
    return complete(() => {
      Object.setPrototypeOf(self, Type.proto);
      hidden(self, "$type", Type);
      hidden(self, "$props", props);
      hidden(self, "$owner", getOwner());
      hidden(self, "$parent", parent);
      // What is made later inside an object bounded (a Repeater's delegate, a
      // Loader's item) is bounded as it is.
      const boundary = fault ?? parent?.$fault;
      if (boundary) hidden(self, "$fault", boundary);
      // A root that may be reloaded knows what was made in what, so that a
      // reload can tell which object of the new tree is which of the old.
      const born = parent ? parent.$born : making;
      if (born) record(self, born);
      hidden(self, "$slots", Object.create(null));
      hidden(self, "$groups", Object.create(null));
      hidden(self, "$signals", Object.create(null));
      // `function tick() { }`: what the object's QML declares it can do.
      if (props.$functions) {
        for (const [name, declared] of Object.entries(props.$functions)) hidden(self, name, declared);
      }
      for (const type of Type.chain) type.spec.setup?.(self, props);
      if (props.$aliases) {
        for (const [name, path] of Object.entries(props.$aliases)) defineAlias(self, name, path);
      }
      // `toolbar.onBackClicked`, `stack.initialItem`: said of the object a
      // property holds, and done before that object's own work on completion.
      for (const key of Object.keys(props)) {
        const at = key.indexOf("$");
        if (at > 0 && key[0]! >= "a" && key[0]! <= "z" && !(key in Type.slots)) whenComplete(() => through(self, props, key, key));
      }
      if (Type.adopt && "children" in props) Type.adopt(self, props);
      for (const key of Object.keys(props)) {
        // `onWidthChanged`: a handler of a property's changes, not of a signal.
        const property = /^on([A-Z]\w*)Changed$/.exec(key)?.[1];
        if (!property) continue;
        const name = property[0]!.toLowerCase() + property.slice(1);
        const changed = () => dynamic(self)[`${name}Changed`] as ChangeSignal;
        if (name in Type.slots) changed().watch((value, firsts) => first(self, name, key, value, firsts));
        else if (props.$aliases?.[name]) changed().watch();
      }
      // `Keys.onPressed`, `Layout.fillWidth`: the attached object is what does
      // something about them, so it has to exist.
      if (props.$attach) {
        whenComplete(() => {
          for (const type of props.$attach!) type.attached?.(self);
        });
      }
      const completed = props.Component$onCompleted;
      if (completed) completions!.push(() => heard(() => untrack(completed), undefined, self));
      // An object a property holds is made with the rest, whoever reads it:
      // a state entered from the start may change what is in it.
      if (props.$made) {
        const owner = getOwner();
        holding!.push(() =>
          runWithOwner(owner, () => {
            for (const name of props.$made!) untrack(() => dynamic(self)[name]);
          }),
        );
      }
      const destruction = props.Component$onDestruction;
      if (destruction) {
        // Told once: when `destroy()` ends the object, or what owns it ends.
        const tell = () => {
          if (self.$gone) return;
          hidden(self, "$gone", true);
          destruction();
        };
        hidden(self, "$destruction", tell);
        onCleanup(tell);
      }
      // Whoever read the object before it existed reads it again.
      if (props.$self) self.$touch(next);
      return self;
    });
  } finally {
    kindNow(outerKind);
  }
}

// What a reloadable root has made, in the order it was made, under what it
// was made in: what goes is taken out, so a view scrolled a long way holds
// only the delegates it shows.
let making: QObject[] | null = null;
function record(self: QObject, born: QObject[]): void {
  hidden(self, "$born", []);
  born.push(self);
  if (getOwner()) onCleanup(() => born.splice(born.indexOf(self) >>> 0, 1));
}

// The objects declared inside one, created now: its `children` prop,
// flattened. With `item`, they are created as its children.
export function contents(props: Props, item?: QObject | null): QObject[] {
  const made = untrack(() => (item ? inside(item, () => flatten(props.children, [])) : flatten(props.children, [])));
  return made;
}

// A component puts its instance's children among its own
// (`{$props.children}`), which Solid hands over as a function.
function flatten(made: unknown, into: QObject[]): QObject[] {
  if (made == null) return into;
  if (Array.isArray(made)) for (const child of made) flatten(child, into);
  else if (typeof made === "function" && !(made as { $component?: unknown }).$component && !(made as { proto?: unknown }).proto) flatten((made as () => unknown)(), into);
  else into.push(made as QObject);
  return into;
}

// Runs `handler` when the property changes from what it is now, or from what
// it is once the objects being created all are.
export function onChange(self: QObject, name: string, handler: Handler, first?: First): void {
  const owner = getOwner();
  // `fontChanged`: a group is the one object whatever is in it, and changes
  // when anything in it does.
  const members = self.$type?.groups[name];
  const read = members
    ? () => members.map((member) => (dynamic(self)[name] as Record<string, unknown>)[member])
    : () => dynamic(self)[name];
  const same = members
    ? (value: unknown, last: unknown) => (value as unknown[]).every((member, index) => Object.is(member, (last as unknown[])[index]))
    : Object.is;
  const watch = (firsts?: Works) => {
    let last = untrack(read);
    first?.(last, firsts);
    runWithOwner(owner, () =>
      createEffect(
        read,
        (value) => {
          // Reading it again is not a change: what it was computed from may
          // have changed and left it as it was.
          if (same(value, last)) return;
          last = value;
          after(() => heard(handler, undefined, self));
        },
      ),
    );
  };
  if (watches) watches.push(watch);
  else watch();
}

// What an object is given as it is made is a change to whoever heard of the
// property already: the handlers of the component it is made from, not one
// written next to the value. A binding is evaluated when all of them hear.
// Qt tells of every step from the default to the value; this of the last.
function first(self: QObject, name: string, key: string, value: unknown, firsts: Works | undefined): void {
  const levels = self.$props.$levels ?? [self.$props];
  const top = levels.findLastIndex((level) => Object.hasOwn(level, name));
  if (top < 0) return;
  const given = Object.getOwnPropertyDescriptor(levels[top]!, name)!;
  // An object declared for the property (`footer: ToolBar {}`) is there as a
  // value is, and no binding.
  const bound = given.get && !levels[top]!.$made?.includes(name);
  const initial = slot(self, name)!.initial;
  let before = isDerived(initial) ? untrack(() => derive$(initial, self)) : initial;
  levels.forEach((level, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(level, name);
    if (descriptor && !descriptor.get) before = descriptor.value;
    const handler = (Object.hasOwn(level, key) ? level[key] : null) as (() => unknown) | null;
    if (!handler || (!bound && top <= index)) return;
    if (Object.is(given.get ? value : given.value, before)) return;
    if (firsts) firsts.push(handler);
    else soon(handler);
  });
}

// `target.onSignal` from outside the object: a signal it emits, or the change
// of one of its properties (`widthChanged`).
export function connect(target: QObject, name: string, listener: Handler): void {
  const emitted = dynamic(target)[name] as Signal | null | undefined;
  if (typeof emitted?.connect === "function") {
    emitted.connect(listener);
    onCleanup(() => emitted.disconnect(listener));
    return;
  }
  const property = /^(\w+)Changed$/.exec(name)?.[1];
  if (property && property in target) onChange(target, property, listener);
}

function attach(name: string, Attached: QmlType, self: QObject | null | undefined): QObject | undefined {
  if (!self?.$props) return undefined;
  if (!self.$attached) hidden(self, "$attached", Object.create(null));
  const all = self.$attached!;
  if (all[name]) return all[name];
  // The object's `ListView$onAdd` is the attached object's `onAdd`.
  const prefix = `${name}$`;
  const props: Props = {};
  for (const key of Object.keys(self.$props)) {
    if (!key.startsWith(prefix)) continue;
    Object.defineProperty(props, key.slice(prefix.length), Object.getOwnPropertyDescriptor(self.$props, key)!);
  }
  hidden(props, "$attachee", self);
  // It is the object's before it is made: what it tells of once it is, as
  // `Layout.onRowChanged` of a `Layout.row` that is bound, may ask for it.
  hidden(props, "$self", (all[name] = $object()));
  runWithOwner(self.$owner, () => untrack(() => Attached(props)));
  return all[name];
}

// What a `Component` is at run time: a function from what its object is
// given (a delegate's `index` and roles) to the object.
// A `Component`: what makes an object, and what QML asks of one.
export interface Component {
  (props?: Props): QObject | null;
  $component: true;
  status: number;
  progress: number;
  errorString(): string;
  statusChanged: Signal;
  progressChanged: Signal;
  createObject(item?: QObject | null, properties?: Record<string, unknown> | null): QObject | null;
  $file?: File;
}

// What a QML file's module exports: its root's type.
export type File = (props?: Props) => QObject | null;

export function $component(file: File): Component {
  const make = file as Component;
  make.$component = true;
  // `Component.Ready`: it was compiled before the program ran, so there is
  // nothing to wait for and nothing to tell of.
  make.status = 1;
  make.progress = 1;
  make.errorString = () => "";
  make.statusChanged = make.progressChanged = silent;
  make.createObject = (item, properties) => {
    // What it is given it has before it is complete: a Behavior on one of
    // them starts from there, and animates nothing to get there.
    const given = (data?: Props) => {
      const object = make(data) as Dynamic;
      for (const [name, value] of Object.entries(properties ?? {})) {
        if (name in object) object[name] = value;
      }
      return object;
    };
    const { object, dispose } = instantiate(given, properties ?? {}, item);
    hidden(object as QObject, "$dispose", dispose);
    item?.$add?.(object as QObject);
    return object;
  };
  return make;
}

// A signal nothing ever emits.
const silent: Signal = Object.assign(() => {}, { connect() {}, disconnect() {} });

// A QML file as a `Component`: what `Qt.createComponent("Block.qml")` and
// `source: "Block.qml"` are, the compiler having imported the file. `File` is
// what the file's module exports.
// What it makes finds names in `context`, the one of the object that named
// the file, when the compiler gives one.
const files = new WeakMap<File, WeakMap<object, Component>>();
const nowhere = {};
export function $file(File: File, context?: Context | null): Component {
  let made = files.get(File);
  if (!made) files.set(File, (made = new WeakMap()));
  let component = made.get(context ?? nowhere);
  if (!component) {
    const make = context ? (properties?: Props) => File(within(properties, context)) : (properties?: Props) => File(properties);
    made.set(context ?? nowhere, (component = $component(make)));
    // Whose file it is, for what says where a fault in it is.
    component.$file = File;
  }
  return component;
}

// What a component is given, and the context it is made in.
function within(properties: Props | undefined, context: Context): Props {
  const props: Props = { $context: context };
  for (const key of Object.keys(properties ?? {})) {
    if (key !== "$context") Object.defineProperty(props, key, Object.getOwnPropertyDescriptor(properties!, key)!);
  }
  return props;
}

// A path that is only known when the program runs, looked up among the files
// the compiler found it could name: `table` has, for each path from the
// directory of the module at `base`, a function that gives what the file
// exports. The result is `find(path, required)`: the file's component, and
// for a path that names none of them the path as it is, or with `required`
// (`Qt.createComponent`) a component that says so. `context` as for `$file`.
export function $files(
  table: Readonly<Record<string, () => File>>,
  base: string | URL,
): (path: unknown, required?: boolean, context?: Context | null) => unknown {
  const directory = new URL(".", base).href;
  return (path, required, context) => {
    // A component already: a path the compiler knew.
    if (typeof path !== "string") return path;
    let key = path.startsWith(directory) ? path.slice(directory.length) : path;
    while (key.startsWith("./")) key = key.slice(2);
    if (Object.hasOwn(table, key)) return $file(table[key]!(), context);
    return required ? missing($url(path, base)) : path;
  };
}

// `Component.Error`: what Qt makes of a file that is not there.
function missing(url: string): Component {
  return failed(`${url}: No such file or directory\n`);
}

// And of anything else it can make no component of, which is what `said`
// tells.
export function failed(said: string): Component {
  const component = $component(() => null);
  component.status = 3;
  component.progress = 0;
  component.errorString = () => said;
  component.createObject = () => {
    console.warn(`QQmlComponent: Component is not ready: ${said.trimEnd()}`);
    return null;
  };
  return component;
}

// QML finds a name by walking contexts: a component's own, then the one of
// whatever made it. The compiler does the first part; where a project uses
// an id of another component, the rest is done here. A context is a
// component's ids and its root, and the context it was made in.
export interface Context {
  readonly outer: Context | null | undefined;
  readonly root: object;
  readonly ids: (() => Record<string, unknown>) | undefined;
}

export function $context(outer: Context | null | undefined, root: object, ids?: () => Record<string, unknown>): Context {
  return { outer, root, ids };
}

// What `name` is to an object made in `context`: an id or a property of the
// root of the nearest component around it that has one, or something the
// program was given for every context.
export function $lookup(context: Context, name: string): unknown {
  for (let around = context.outer; around; around = around.outer) {
    const ids = around.ids?.();
    if (ids && name in ids) return ids[name];
    if (name in around.root) return (around.root as Record<string, unknown>)[name];
  }
  return globals[name];
}

// What every context has: the context properties a host sets.
export const globals: Record<string, unknown> = Object.create(null);

// `pragma Singleton`: the one object of a file, made the first time anything
// asks for it and kept for as long as the page. It is nobody's child, and
// nothing that ends takes it along. `keys` are the enums the file declares.
export function $singleton<K extends object>(Component: (props: Props) => unknown, keys: K, name?: string): (() => QObject) & K {
  let object: QObject | undefined;
  const get = () => {
    if (object) return object;
    // There before it is filled in: what is in the file may name it.
    const filled = (object = $object());
    runWithOwner(null, () =>
      createRoot(() => untrack(() => complete(() => inside(null, () => Component({ $self: filled }))))),
    );
    if (name) {
      singletons.set(name, object);
      for (const listener of watchers) listener(name, object);
    }
    return object;
  };
  return Object.assign(get, keys);
}

// The singletons whose module names them (`Ljos.Design.Colors`), once made:
// what a page reaches from outside its QML. A file that is loaded again
// makes its singleton again, and is told again.
const singletons = new Map<string, QObject>();
const watchers = new Set<(name: string, object: QObject) => void>();
// Tells `listener(name, object)` of each made so far and each made later.
export function watchSingletons(listener: (name: string, object: QObject) => void): () => boolean {
  watchers.add(listener);
  for (const [name, object] of singletons) listener(name, object);
  return () => watchers.delete(listener);
}

// `source: path`, where the path is not known until the program runs: taken
// from the file it is written in, as a literal is when it is compiled.
export function $url<T>(value: T, base?: string | URL): T | string {
  if (typeof value !== "string" || value === "") return value;
  try {
    return new URL(value, base).href;
  } catch {
    return value;
  }
}

// A type of Qt's that this runtime does not have yet. It is there to be
// named, since a style of Qt's names every control there is, and says what
// it is when something is made of it or read off it. One that is QML of
// Qt's own is absent where that module of Qt's is not `installed`: the build
// reads such a type out of Qt.
export function absent(module: string, name: string, installed = true): () => never {
  const fail = (): never => {
    throw new Error(
      installed ? `${module}: ${name} is not in ljos-web yet` : `${module}: ${name} is QML of Qt's own, and Qt's ${module} is not installed here`,
    );
  };
  return new Proxy(fail, {
    // What is asked of any function, and what the runtime asks of any value
    // to learn what it is, is answered as a function answers.
    get: (target, key) =>
      typeof key === "symbol" || key in Function.prototype || key === "then" || key[0] === "$" ? (Reflect.get(target, key) as unknown) : fail(),
  });
}

// Which of the modules a module of Qt's can be the build chose: for
// `QtQuick.Controls` the style, `QtQuick.Controls.Material`. The build says.
export const chosen = new Map<string, string>();

// `qrc:/…`: a file Qt keeps inside a program or one of its plugins, as the
// pictures of a style of Qt Quick Controls are. A build says which there are
// and where the browser has them; `located` is what a type loads a source by.
export const resources = new Map<string, string>();

// What a module that names one says: the file `address` is, is at `url`.
export function $resource(address: string, url: string): void {
  resources.set(address, url);
}

// `file:pictures/one.png`, which does not say from where: a file beside the
// program as it runs, in the directory it was started in. A program that
// names one has put it there itself, downloaded or written, and what stands
// in for that part of it says where the files of `directory` are instead.
const places: [directory: string, url: string][] = [];
export function beside(directory: string, url: string | URL): void {
  const whole = (name: string) => (name.endsWith("/") ? name : `${name}/`);
  places.push([whole(directory.replace(/^file:/, "")), whole(String(url))]);
  // The directory furthest in is the one a file is of.
  places.sort(([one], [other]) => other.length - one.length);
}

export function located(url: string): string {
  if (/^(qrc)?:\//.test(url)) return resources.get(url.replace(/^(qrc)?:\/+/, "qrc:/")) ?? url;
  const path = /^file:(?!\/)(.*)$/s.exec(url)?.[1];
  const place = path === undefined ? undefined : places.find(([directory]) => path.startsWith(directory));
  return place ? place[1] + (path as string).slice(place[0].length) : url;
}

// What a scene still waits for, a file being read or a picture decoded, is
// not on the page yet. `busy()` is how many of those there are, for a host
// that wants the scene as it will be: what takes a picture of it.
let awaiting = 0;
export const busy = (): number => awaiting;

export function awaited<T>(promise: Promise<T>): Promise<T> {
  awaiting++;
  const over = () => void awaiting--;
  promise.then(over, over);
  return promise;
}

// Whether what is being made was asked for while the page runs, not written
// in the tree: a delegate, a loaded item, what `createObject` makes.
let instantiating = 0;
export const madeOnDemand = (): boolean => instantiating > 0;

// Creates a component's object apart from the tree that asked for it: a
// delegate, a loaded item. `dispose` destroys it; so does the end of `owner`.
export interface Instantiated {
  object: QObject | null;
  dispose: () => void;
}

export function instantiate(
  component: (data?: Props) => QObject | null,
  data?: Props,
  item?: QObject | null,
  owner: Owner | null = item?.$owner ?? getOwner(),
): Instantiated {
  return runWithOwner(owner, () =>
    createRoot((dispose) => {
      try {
        instantiating++;
        let object: QObject | null;
        try {
          object = untrack(() => complete(() => inside(item ?? null, () => component(data))));
        } finally {
          instantiating--;
        }
        // A view's row is what a reload knows its delegate by.
        if (object?.$born && typeof data?.$index === "number") hidden(object, "$row", data.$index);
        return { object, dispose };
      } catch (error) {
        // What was made before it threw has no one else to end it.
        dispose();
        throw error;
      }
    }),
  );
}

// The roots in the page that a reload may carry state across, and whether
// a root is one unless `mount` is told: in a dev server, once a compiled
// file has said it can be reloaded (`$hot`).
// What a page's root is made from: a component's module, and the theme the
// build found for it.
export type Mountable = ((props: Props) => QObject) & { $theme?: { apply(): void } };

export interface Root {
  object: QObject;
  dispose: () => void;
  within: <T>(act: () => T) => T;
}

// A root `reload` may give a new component.
export interface Mounted {
  object: QObject;
  Component: Mountable;
  element: Element;
  props: Props;
  options: MountOptions;
  root: Root;
  dispose: () => void;
}

export const mounted = new Set<Mounted>();
let hot = false;
export const $hot = (): void => void (hot = true);

// A component's object, apart from the page: `reload.js` makes the new root
// with it before the old one goes.
export function made(Component: Mountable, props: Props, reloadable?: boolean): Root {
  // The theme the build found for the entry, or none: the page's theme is
  // the last mounted entry's.
  Component?.$theme?.apply();
  return createRoot((dispose) => {
    const outer = making;
    making = reloadable ? [] : null;
    try {
      const declared = untrack(() => complete(() => Component(props)));
      // A shell whose root is a held block shows the block, not the note of
      // where it is placed.
      const object = declared?.$block ?? declared;
      // What is done with the object once it is in the page (a Window
      // told where it is, the keyboard given back) is the root's too.
      const owner = getOwner();
      return { object, dispose, within: <T>(act: () => T) => runWithOwner(owner, act) };
    } catch (error) {
      dispose();
      throw error;
    } finally {
      making = outer;
    }
  });
}

// Puts a component's object in the page. A Window is told what it was put
// in and with what `options`: it fills the element, or with
// `{ fill: false }` gives it the size its QML says. Any other root keeps the
// size its QML says unless `{ fill: true }` lays it out at the element's,
// following the element from then on. With
// `{ reloadable: true }` (the default in a dev server) `reload` can give it
// a new component and keep its state.
export function mount(Component: Mountable, element: Element, props: Props = {}, options: MountOptions = {}): Root | Mounted {
  const reloadable = options.reloadable ?? hot;
  const root = made(Component, props, reloadable);
  element.classList.add("q-scene");
  if (root.object.$node) element.append(root.object.$node);
  root.within(() => root.object.$mounted?.(element, options));
  if (!reloadable) return root;
  const handle: Mounted = {
    object: root.object,
    Component,
    element,
    props,
    options,
    root,
    dispose: () => {
      mounted.delete(handle);
      handle.root.dispose();
    },
  };
  mounted.add(handle);
  return handle;
}

// Puts a component's object in the page over what a prerender of it
// wrote there (`renderToString` of `ljos-web/server`), taking the
// prerendered elements over instead of making the page again: while
// the root is made, each element a type asks the document for is the
// prerendered one of that making's number and type (its key is
// `number:Type`, since most elements are `<div>`s and a count alone
// cannot tell a shifted one from its own), and the effects that then
// run write to it as they always did. A reader who was reading the
// page keeps the very nodes they had; only what the browser measures
// or paints differently is settled, in place.
//
// An element whose number the making never asks for, or asks for by
// another tag or for another type — the page made differently here
// than it was prerendered — is a mismatch: it is told of once, no
// element after it is taken over either (from there no number can
// be trusted to name the same making), what was not taken over is
// taken out and told of, and the page goes on as a mount would have
// made it. Nothing prerendered in `element` is a plain mount. That the
// page was hydrated, `element` says (`data-ljos-hydrated`), so that
// what waits for the live page need not guess.
export function hydrate(Component: Mountable, element: Element, props: Props = {}, options: MountOptions = {}): Root | Mounted {
  const marked = element.querySelectorAll("[data-hk]");
  if (marked.length === 0) return mount(Component, element, props, options);
  const keyed = (node: Element): [number: number, kind: string] => {
    const said = node.getAttribute("data-hk") ?? "";
    const at = said.indexOf(":");
    return at < 0 ? [Number(said), ""] : [Number(said.slice(0, at)), said.slice(at + 1)];
  };
  const waiting = new Map(
    [...marked]
      .map((node): [number, string, Element] => [...keyed(node), node])
      .map(([number, kind, node]): [number, { kind: string; node: Element }] => [number, { kind, node }]),
  );
  // A canvas is no making in the count, on either side (dom.js): the
  // measuring canvas is made at whatever making first measures, which
  // an anchored text's layout read decides differently here than the
  // prerender decided it. The prerendered ones are taken out below;
  // what paints into a canvas paints when the page runs.
  const staleCanvases = [...element.querySelectorAll("canvas")];
  const document = element.ownerDocument;
  let made = 0;
  let told = false;
  const take = (tag: string): Element | null => {
    if (String(tag).toLowerCase() === "canvas") return null;
    // Once the makings have parted, no later number can be trusted to
    // name the same making: the rest is made again, and what was
    // prerendered of it is taken out below.
    if (told) return null;
    const held = waiting.get(++made);
    if (!held) return null;
    const { kind, node } = held;
    // A making outside any type's setup (a measuring canvas, a bench)
    // has no type to expect, on either side: where the key names one
    // and this making is another's, the counts have parted, however
    // alike the tags are.
    const off =
      node.localName !== String(tag).toLowerCase() ? `a <${String(tag).toLowerCase()}> where the prerendered page has a <${node.localName}>` : kind && makingKind && kind !== makingKind ? `an element for ${makingKind} where the prerendered page has one for ${kind}` : null;
    if (off) {
      told = true;
      console.warn(`ljos-web: hydration mismatch: the page asks for ${off} (element ${made}); what does not match is made again`);
      return null;
    }
    waiting.delete(made);
    node.removeAttribute("data-hk");
    return node;
  };
  const createElement = document.createElement.bind(document);
  const createElementNS = document.createElementNS.bind(document);
  document.createElement = ((tag: string, given?: ElementCreationOptions) => take(tag) ?? createElement(tag, given)) as Document["createElement"];
  document.createElementNS = ((namespace: string | null, tag: string, given?: ElementCreationOptions) =>
    take(tag) ?? createElementNS(namespace, tag, given)) as Document["createElementNS"];
  try {
    const root = mount(Component, element, props, options);
    // What no type took over is not the page's: a part the prerender
    // had and this making does not. It is told of, as a mismatch is,
    // unless that parting was already told of.
    if (waiting.size > 0) {
      if (!told) console.warn(`ljos-web: hydration mismatch: ${waiting.size} prerendered element${waiting.size === 1 ? "" : "s"} the page did not ask for; what does not match is made again`);
      for (const { node } of waiting.values()) node.remove();
    }
    for (const node of staleCanvases) node.remove();
    element.setAttribute("data-ljos-hydrated", "true");
    return root;
  } finally {
    delete (document as Partial<Document>).createElement;
    delete (document as Partial<Document>).createElementNS;
  }
}

// What a component declares, put on its root object so that it can be
// reached through it: `{ name: [get, set] }` for a property, a function for
// a function or a signal. The properties' names are kept, as the type's
// are, for a Controller that follows its host (Ljos/Core/controller.js).
export function $define(self: QObject, members: Readonly<Record<string, unknown>>): QObject {
  for (const [name, member] of Object.entries(members)) {
    const property = Array.isArray(member);
    const accessors = member as [get: () => unknown, set: (value: unknown) => void];
    const descriptor = property
      ? { get: accessors[0], set: accessors[1], enumerable: true, configurable: true }
      : { value: member, enumerable: true, configurable: true };
    Object.defineProperty(self, name, descriptor);
    if (property) {
      if (!Object.hasOwn(self, "$declares")) hidden(self, "$declares", []);
      self.$declares!.push(name);
    }
  }
  return self;
}

// A declared property that something assigns to. Like a slot: the assignment
// replaces the binding, a read right after it sees the new value, and so
// does everything that depends on it.
export function $signal(initial: unknown): [get: () => unknown, set: (given: unknown) => unknown] {
  const binding = typeof initial === "function";
  const owner = getOwner();
  const [version, bump] = counted(0, owner);
  let assigned = !binding;
  let value = binding ? undefined : initial;
  // Made when first read: by then what the binding names exists.
  let bound: Bound | undefined;
  const get = (): unknown => {
    version();
    if (assigned) return value;
    bound ??= ringed(owner, initial as () => unknown, undefined, true);
    return bound();
  };
  const set = (given: unknown): unknown => {
    if (assigned && Object.is(value, given)) return given;
    if (isBinding(given)) {
      // `count = Qt.binding(f)`: the binding is replaced, not the value.
      bound = ringed(owner, () => given(), untrack(get), true);
      bound.begin();
      assigned = false;
      value = undefined;
    } else {
      assigned = true;
      value = given;
    }
    bump(next);
    settle();
    return given;
  };
  return [get, set];
}

export const QtObject = defineType("QtObject", null, {
  properties: { objectName: "" },
  methods: {
    // Gone once what asked is done, or `delay` milliseconds on: out of what
    // it is in, and told of its destruction. One that a component made by
    // `createObject` stops there; what one written in a file does goes on
    // until what the file made ends.
    destroy(delay = 0): void {
      if (this.$destroyed) return;
      hidden(this, "$destroyed", true);
      setTimeout(() => {
        ((dynamic(this).parent as QObject | null | undefined) ?? this.$parent)?.$remove?.(this);
        this.$destruction?.();
        this.$dispose?.();
        flush();
      }, delay);
    },
    // True of everything the object has, as in Qt: a property of its type's
    // is its own, and so is the handler of a signal.
    hasOwnProperty(name: unknown): boolean {
      if (typeof name !== "string" || name[0] === "$") return false;
      if (name in this) return true;
      const signal = /^on([A-Z])(\w*)$/.exec(name);
      return (
        signal !== null &&
        typeof (dynamic(this)[signal[1]!.toLowerCase() + signal[2]!] as Partial<Signal> | undefined)?.connect === "function"
      );
    },
  },
});

// What `import LocalModule as X` names: a table of the module's files, each
// read when it is used, as a file of the module may be loading this one.
export function $namespace(members: Readonly<Record<string, () => unknown>>): Record<string, unknown> {
  const table: Record<string, unknown> = {};
  for (const [name, member] of Object.entries(members)) Object.defineProperty(table, name, { get: member, enumerable: true });
  return table;
}
