// `import Ljos.Observer` on the web: the Observer's window, the QML ljos-ui's
// `ljos observe` shows (copied by controls.js as `Observer`), and what it
// asks its questions through.
//
// Natively `InspectorClient` posts each call to the inspector a token file
// names, over HTTP, in another process. A page has no other process to ask:
// what it observes is mounted in the same page. So a root is served here,
// under a token (`serve(root)`, or `Inspector { target: root }` in QML), and a
// client given that token as its `tokenFile` is answered from the root
// itself, through `inspect(root)`, in the same shapes, the same errors and
// the same signal as the native client gets them. What a page cannot tell
// (other processes, mailboxes, traces of threads, what memory an object
// holds) is answered as the inspector refuses what it cannot do: with an
// error that says why, which the Observer shows where the answer would be.
//
// What the Observer charts is measured from outside the runtime, only while
// something is served, so that a page that never imports this module pays
// nothing (the size page and the idle runtime are as they were):
//
// - a pass is one task's changes to the served root's elements, seen by a
//   MutationObserver: a pass drawn. It started when the clock stepped (an
//   animation, in a frame, or a timer), when input came, or, when neither,
//   it is a message (a fetch answered, a script's call) and took no time
//   that can be told;
// - the clock is the runtime's one (QtQuick/animation/clock.js): its counts
//   live on `globalThis`, and while served they are read as they are written;
// - a line logged is counted as `console` is called.
//
// Nothing here polls. A watch is a promise answered when one of these
// counts moves, or when its wait is over: at rest no timer runs but the one
// the longest wait asks for.
import { untrack } from "#kernel";
import { flush, work } from "../../object.ts";
import type { QObject, QmlType, Slot } from "../../object.ts";
import { inspect } from "../../inspect.js";

// ----- What a served root is ------------------------------------------------

// What a tool answers: the inspector's own result, as JSON-RPC carries it.
interface Result {
  structuredContent: unknown;
  content: Content[];
  isError?: true;
}
type Content = { type: "text"; text: string } | { type: "image"; mimeType: string; data: string };

// What a client is told when a call never reached an inspector.
class Unreached extends Error {}

// Where the lines a served root logged come from: the page's console by
// default, or a host's own log of one example (`observed.js` on the site).
export interface LogSource {
  // The lines numbered `since` and on, oldest first, at most `limit`.
  lines(since: number, limit: number): { seq: number; line: LogLine }[];
  // How many lines there have been.
  count(): number;
  // Told of every line logged from now; returns what stops it.
  listen(told: () => void): () => void;
}
export interface LogLine {
  level: string;
  category: string;
  message: string;
  file: string | null;
  line: number | null;
}

export interface ServeOptions {
  logs?: LogSource;
  // What the root is called where the Observer names the application.
  title?: string;
}

// A root served: what a host keeps to swap the root (an edit made it again)
// and to stop serving it.
export interface Served {
  readonly token: string;
  readonly url: string;
  // The root is another now: a reload, as the Observer counts one.
  reload(root: QObject): void;
  close(): void;
}

// The counts a watch compares, as the native `app_watch` has them.
interface Counts {
  frames: number;
  paints: number;
  logs: number;
  reloads: number;
  traces: number;
  models: number;
  wakes: number;
  rests: number;
}
type Topic = keyof Counts;
const TOPICS: readonly Topic[] = ["frames", "paints", "logs", "reloads", "traces", "models", "wakes", "rests"];

// A pass as `app_frames` lists one.
interface Frame {
  frame: number;
  window: null;
  at_ms: number;
  woke: string[];
  asked_by: string[];
  thread_messages: number;
  scene_frames: number;
  total_us: number;
  passes: Record<"timers_us" | "animations_us" | "layout_us" | "create_us" | "scene_us" | "other_us", number>;
  bindings_us: null;
  binding_runs: number;
  text_us: null;
  text_layouts: number;
  render_us: null;
  present_us: null;
  paint: null;
}

// How many passes `app_frames` keeps, as the native ring does.
const KEPT_FRAMES = 600;
// A frame's budget at 60 Hz, which a pass over it overran.
const BUDGET_US = 16_667;
// Input is what started a pass only if the pass came soon after it.
const INPUT_MS = 100;
// The most a watch may wait and settle, as natively.
const MOST_WAIT_MS = 3_600_000;
const MOST_SETTLE_MS = 5_000;
const MOST_ITEMS = 16;

interface Watch {
  since: Partial<Counts>;
  items: Map<string, number>;
  // The client it is for (`holder`), or null.
  holder: string | null;
  settleMs: number;
  started: number;
  settling: ReturnType<typeof setTimeout> | null;
  waiting: ReturnType<typeof setTimeout> | null;
  answer: () => void;
}

interface State {
  token: string;
  root: QObject;
  title: string;
  logs: LogSource;
  counts: Counts;
  // Mutations seen inside each item followed, by handle.
  itemCounts: Map<string, number>;
  frames: Frame[];
  framesTotalUs: number;
  framesMaxUs: number;
  lastUs: number;
  overruns: number;
  recording: boolean;
  watches: Set<Watch>;
  // What the client edited, to say so and to take it back.
  edited: WeakMap<object, Set<string>>;
  observer: MutationObserver | null;
  unlisten: () => void;
  bornAt: number;
  // The runtime's work counts as the last pass left them.
  bindingRuns: number;
  textLayouts: number;
}

const served = new Map<string, State>();
let tokens = 0;

// ----- Handles ---------------------------------------------------------------

// An object as the answers name it, `@n`, the same for as long as it lives.
const handleOf = new WeakMap<object, string>();
const byHandle = new Map<string, WeakRef<QObject>>();
let handles = 0;

function handle(object: QObject): string {
  let named = handleOf.get(object);
  if (!named) {
    named = `@${++handles}`;
    handleOf.set(object, named);
    byHandle.set(named, new WeakRef(object));
  }
  return named;
}

function forget(): void {
  for (const [named, ref] of byHandle) {
    const object = ref.deref();
    if (!object || object.$destroyed || object.$gone) byHandle.delete(named);
  }
}

// ----- Measuring, while anything is served -----------------------------------

interface ClockCounts {
  frames: number;
  time: number;
  jobs: number;
}
const CLOCK = Symbol.for("ljos-web/clock");

// What was put over the page to measure it, and how to take it off again.
let hooked: (() => void) | null = null;
// What started the pass going on, and when.
let started: { cause: "animation" | "timer" | "input"; at: number } | null = null;
let inFrame = 0;

function hook(): void {
  if (hooked) return;
  const host = globalThis as unknown as Record<symbol, ClockCounts | undefined>;
  // The clock makes its counts with `??=`, so one made here first is the
  // one it counts in.
  const counted = (host[CLOCK] ??= { frames: 0, time: 0, jobs: 0 });
  let frames = counted.frames;
  let jobs = counted.jobs;
  // `counted.frames++` is the first thing a step of the clock does, and
  // what it moves is settled by the end of its task.
  Object.defineProperty(counted, "frames", {
    configurable: true,
    enumerable: true,
    get: () => frames,
    set(value: number) {
      frames = value;
      const at = performance.now();
      started = { cause: inFrame > 0 ? "animation" : "timer", at };
      queueMicrotask(() => stepped(at));
    },
  });
  Object.defineProperty(counted, "jobs", {
    configurable: true,
    enumerable: true,
    get: () => jobs,
    set(value: number) {
      const rested = jobs > 0 && value === 0;
      jobs = value;
      if (rested) for (const state of served.values()) bump(state, "rests");
    },
  });
  const raf = window.requestAnimationFrame;
  const framed: typeof window.requestAnimationFrame = (callback) =>
    raf.call(window, (time) => {
      inFrame++;
      try {
        callback(time);
      } finally {
        inFrame--;
      }
    });
  window.requestAnimationFrame = framed;
  const input = () => {
    started = { cause: "input", at: performance.now() };
  };
  const kinds = ["pointerdown", "pointerup", "pointermove", "keydown", "keyup", "wheel", "input"] as const;
  for (const kind of kinds) window.addEventListener(kind, input, { capture: true, passive: true });
  hooked = () => {
    Object.defineProperty(counted, "frames", { configurable: true, enumerable: true, writable: true, value: frames });
    Object.defineProperty(counted, "jobs", { configurable: true, enumerable: true, writable: true, value: jobs });
    if (window.requestAnimationFrame === framed) window.requestAnimationFrame = raf;
    for (const kind of kinds) window.removeEventListener(kind, input, { capture: true });
    started = null;
  };
}

function unhook(): void {
  if (served.size > 0 || !hooked) return;
  hooked();
  hooked = null;
}

function clockCounts(): ClockCounts {
  const counted = (globalThis as unknown as Record<symbol, ClockCounts | undefined>)[CLOCK];
  return counted ?? { frames: 0, time: 0, jobs: 0 };
}

// A step of the clock is over: what it changed in each root is its pass.
function stepped(at: number): void {
  const cause = started?.at === at ? started.cause : "timer";
  if (started?.at === at) started = null;
  for (const state of served.values()) {
    const records = state.observer?.takeRecords() ?? [];
    if (records.length) passed(state, records, cause, at);
  }
}

// What changed in a root outside a step: input's, or a message's.
function noticed(state: State, records: MutationRecord[]): void {
  const now = performance.now();
  const input = started?.cause === "input" && now - started.at < INPUT_MS ? started : null;
  if (input) started = null;
  passed(state, records, input ? "input" : "message", input ? input.at : now);
}

function passed(state: State, records: MutationRecord[], cause: string, at: number): void {
  const us = Math.max(0, Math.round((performance.now() - at) * 1000));
  const frame: Frame = {
    frame: state.counts.frames + 1,
    window: null,
    at_ms: Math.round(at - state.bornAt),
    woke: [cause],
    asked_by: [],
    thread_messages: 0,
    scene_frames: 1,
    total_us: us,
    // A pass is told whole, by what started it: the browser does not say
    // what of it was layout and what was script.
    passes: {
      timers_us: cause === "timer" ? us : 0,
      animations_us: cause === "animation" ? us : 0,
      layout_us: 0,
      create_us: 0,
      scene_us: 0,
      other_us: cause === "input" || cause === "message" ? us : 0,
    },
    // How long they took is not told: a clock read for each would cost
    // what they cost.
    bindings_us: null,
    binding_runs: work.bindingRuns - state.bindingRuns,
    text_us: null,
    text_layouts: work.textLayouts - state.textLayouts,
    render_us: null,
    present_us: null,
    paint: null,
  };
  state.bindingRuns = work.bindingRuns;
  state.textLayouts = work.textLayouts;
  state.frames.push(frame);
  if (state.frames.length > KEPT_FRAMES) state.frames.shift();
  state.framesTotalUs += us;
  state.framesMaxUs = Math.max(state.framesMaxUs, us);
  state.lastUs = us;
  if (us > BUDGET_US) state.overruns++;
  // An item followed counts the passes that changed something in it.
  const touched = new Set<string>();
  for (const named of state.itemCounts.keys()) {
    const node = byHandle.get(named)?.deref()?.$node;
    if (node && records.some((record) => node.contains(record.target))) touched.add(named);
  }
  for (const named of touched) state.itemCounts.set(named, (state.itemCounts.get(named) ?? 0) + 1);
  state.counts.frames++;
  state.counts.paints++;
  tellWatches(state);
}

function bump(state: State, topic: Topic): void {
  state.counts[topic]++;
  tellWatches(state);
}

function observe(state: State): void {
  state.observer?.disconnect();
  const node = (state.root.$contentItem ?? state.root).$node;
  if (!node) {
    state.observer = null;
    return;
  }
  const observer = new MutationObserver((records) => noticed(state, records));
  observer.observe(node, { subtree: true, childList: true, attributes: true, characterData: true });
  state.observer = observer;
}

// ----- Serving ---------------------------------------------------------------

// The page's console, as inspect.js keeps it: every line the page logged.
interface Kept {
  lines: [number, LogLine][];
  count: number;
}
const LEVELS = ["debug", "log", "info", "warn", "error"] as const;
let consoleListeners: Set<() => void> | null = null;
let unwrapConsole: (() => void) | null = null;

function pageLog(): LogSource {
  const kept = () => (console as unknown as { $inspected?: Kept }).$inspected ?? { lines: [], count: 0 };
  return {
    lines(since, limit) {
      return kept()
        .lines.filter(([seq]) => seq >= since)
        .slice(0, limit)
        .map(([seq, line]) => ({ seq, line }));
    },
    count: () => kept().count,
    listen(told) {
      if (!consoleListeners) {
        const listeners = new Set<() => void>();
        consoleListeners = listeners;
        const said = new Map(LEVELS.map((name) => [name, console[name]]));
        for (const name of LEVELS) {
          const before = said.get(name)!;
          const wrapped = (...args: unknown[]) => {
            before.apply(console, args);
            for (const listener of [...listeners]) listener();
          };
          console[name] = wrapped;
        }
        unwrapConsole = () => {
          for (const name of LEVELS) console[name] = said.get(name)!;
        };
      }
      const listeners = consoleListeners;
      listeners.add(told);
      return () => {
        listeners.delete(told);
        if (listeners.size === 0 && consoleListeners === listeners) {
          unwrapConsole?.();
          unwrapConsole = null;
          consoleListeners = null;
        }
      };
    },
  };
}

// Serves `root` to clients given the token it answers with: `page:1` and on.
export function serve(root: QObject, options: ServeOptions = {}): Served {
  const token = `page:${++tokens}`;
  hook();
  const logs = options.logs ?? pageLog();
  const state: State = {
    token,
    root,
    title: options.title ?? "",
    logs,
    counts: { frames: 0, paints: 0, logs: logs.count(), reloads: 0, traces: 0, models: 0, wakes: 0, rests: 0 },
    itemCounts: new Map(),
    frames: [],
    framesTotalUs: 0,
    framesMaxUs: 0,
    lastUs: 0,
    overruns: 0,
    recording: false,
    watches: new Set(),
    edited: new WeakMap(),
    observer: null,
    unlisten: () => {},
    bornAt: performance.now(),
    bindingRuns: work.bindingRuns,
    textLayouts: work.textLayouts,
  };
  state.unlisten = logs.listen(() => {
    state.counts.logs = logs.count();
    tellWatches(state);
  });
  served.set(token, state);
  observe(state);
  return {
    token,
    url: urlOf(token),
    reload(next) {
      if (!served.has(token)) return;
      state.root = next;
      state.edited = new WeakMap();
      observe(state);
      bump(state, "reloads");
    },
    close() {
      if (!served.delete(token)) return;
      state.observer?.disconnect();
      state.unlisten();
      for (const watch of [...state.watches]) watch.answer();
      unhook();
    },
  };
}

const urlOf = (token: string) => `page://${token.slice(token.indexOf(":") + 1)}`;

// ----- Answers -----------------------------------------------------------------

class Refused extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const answered = (structured: unknown, text?: string): Result => ({
  structuredContent: structured,
  content: [{ type: "text", text: text ?? JSON.stringify(structured) }],
});

function refusal(error: Refused): Result {
  const said = { error: { code: error.code, message: error.message } };
  return { isError: true, structuredContent: said, content: [{ type: "text", text: JSON.stringify(said) }] };
}

// Why a tool a page cannot answer is not answered.
const NOT_HERE: Record<string, string> = {
  app_trace: "an object's signals, changes and binding runs are written down by the engine of `ljos run`, and this page's runtime keeps no such record; the Objects page still reads and changes each property, and the Logs page has what the app said",
  app_audit: "the design audit runs in ljos-ui's inspector, which this page does not have; run the application with `ljos run` and audit it there",
};

type Args = Record<string, unknown>;
type Tool = (state: State, args: Args) => Result | Promise<Result>;

const TOOLS: Record<string, Tool> = {
  app_watch: (state, args) => watch(state, args),
  app_objects: (state, args) => objects(state, args),
  app_inspect: (state, args) => inspected(state, args),
  app_set_property: (state, args) => setProperty(state, args),
  app_get_property: (state, args) => getProperty(state, args),
  app_screenshot: (state, args) => screenshot(state, args),
  app_logs: (state, args) => logsOf(state, args),
  app_metrics: (state, args) => metrics(state, args),
  app_frames: (state, args) => frames(state, args),
  app_status: (state) => status(state),
  app_processes: (state, args) => processes(state, args),
};

async function answer(state: State, tool: string, args: Args): Promise<Result> {
  const why = NOT_HERE[tool];
  if (why) return refusal(new Refused("unsupported", `${tool} is not answered on the web: ${why}`));
  const run = TOOLS[tool];
  if (!run) return refusal(new Refused("not_found", `there is no tool \`${tool}\``));
  try {
    return await run(state, args);
  } catch (error) {
    if (error instanceof Refused) return refusal(error);
    return refusal(new Refused("internal", error instanceof Error ? error.message : String(error)));
  }
}

const number = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

// ----- app_watch ----------------------------------------------------------------

function countsOf(state: State, items: Iterable<string>): Record<string, unknown> {
  const counts: Record<string, unknown> = { ...state.counts };
  const followed: Record<string, number> = {};
  let any = false;
  for (const named of items) {
    followed[named] = state.itemCounts.get(named) ?? 0;
    any = true;
  }
  if (any) counts.items = followed;
  return counts;
}

function changedOf(state: State, watch: Watch): string[] {
  const changed: string[] = TOPICS.filter((topic) => watch.since[topic] !== undefined && watch.since[topic] !== state.counts[topic]);
  for (const [named, was] of watch.items) if ((state.itemCounts.get(named) ?? 0) !== was) changed.push("items");
  return [...new Set(changed)];
}

function tellWatches(state: State): void {
  for (const watch of state.watches) {
    if (watch.settling || changedOf(state, watch).length === 0) continue;
    // What comes soon after is told with it, as the native settle does.
    if (watch.settleMs > 0) watch.settling = setTimeout(watch.answer, watch.settleMs);
    else watch.answer();
  }
}

function rest(): Record<string, unknown> {
  const jobs = clockCounts().jobs;
  return { wake_in_ms: null, frame_owed: false, animating: jobs > 0, at_rest: jobs === 0, pointer: false };
}

function watch(state: State, args: Args): Promise<Result> {
  const since = (args.since ?? null) as (Partial<Counts> & { items?: Record<string, number> }) | null;
  const asked = Array.isArray(args.items) ? args.items.filter((item): item is string => typeof item === "string") : [];
  if (asked.length > MOST_ITEMS) throw new Refused("invalid_argument", `a watch follows at most ${MOST_ITEMS} items`);
  for (const named of asked) {
    if (!byHandle.get(named)?.deref()) throw new Refused("stale_ref", `\`${named}\` is gone: list the objects again`);
    if (!state.itemCounts.has(named)) state.itemCounts.set(named, 0);
  }
  const reply = (waited: number, settled: boolean, changed: string[]): Result =>
    answered({ counts: countsOf(state, asked), changed, waited, settled, rest: rest() });
  // No counts to compare with: what they are now.
  if (!since) return Promise.resolve(reply(0, false, []));
  const items = new Map<string, number>();
  for (const named of asked) items.set(named, since.items?.[named] ?? state.itemCounts.get(named) ?? 0);
  const wait = Math.min(Math.max(0, number(args.wait_ms, 10_000)), MOST_WAIT_MS);
  const settleMs = Math.min(Math.max(0, number(args.settle_ms, 0)), MOST_SETTLE_MS);
  const holder = typeof args.holder === "string" && args.holder !== "" ? args.holder : null;
  // A holder follows the application with one watch at a time: asked again,
  // it wants what it asks now, so the watch it had out is answered at once.
  // The Observer counts on it: an item picked is followed by a new watch
  // while the one following every pass is still out, and it asks again only
  // once no watch of its own is waiting.
  if (holder !== null) for (const earlier of [...state.watches]) if (earlier.holder === holder) earlier.answer();
  return new Promise((resolve) => {
    const watching: Watch = {
      since,
      items,
      holder,
      settleMs,
      started: performance.now(),
      settling: null,
      waiting: null,
      answer() {
        if (!state.watches.delete(watching)) return;
        if (watching.settling) clearTimeout(watching.settling);
        if (watching.waiting) clearTimeout(watching.waiting);
        const changed = changedOf(state, watching);
        resolve(reply(Math.round(performance.now() - watching.started), watching.settling !== null, changed));
      },
    };
    state.watches.add(watching);
    if (changedOf(state, watching).length > 0) watching.answer();
    else if (wait > 0) watching.waiting = setTimeout(watching.answer, wait);
    else watching.answer();
  });
}

// ----- app_objects ----------------------------------------------------------------

interface Row {
  object: QObject;
  depth: number;
  type: string;
  id: string;
  object_name: string;
  item: boolean;
  children: number;
  source?: { file: string; line: number } | null;
}

type Inspected = ReturnType<typeof inspect>;

function tree(state: State): { rows: Row[]; at: Inspected } {
  const at = inspect(state.root);
  flush();
  return { rows: at.outline().objects as Row[], at };
}

function rootItem(state: State): QObject {
  return state.root.$contentItem ?? state.root;
}

function bounds(state: State, object: QObject): [number, number, number, number] | undefined {
  if (!object.$node) return undefined;
  const shown = object as QObject & { width: number; height: number; mapToItem?: (to: QObject, x: number, y: number) => { x: number; y: number } };
  const at = shown.mapToItem?.(rootItem(state), 0, 0) ?? { x: 0, y: 0 };
  return [at.x, at.y, shown.width, shown.height];
}

function shownRow(state: State, row: Row, depth: number, hidden?: number): Record<string, unknown> {
  const object = row.object as QObject & { visible?: boolean };
  const shown: Record<string, unknown> = {
    handle: handle(object),
    depth,
    type: row.type,
    id: row.id || null,
    object_name: row.object_name || null,
    item: row.item,
    children: row.children,
    // The browser does not say what an object holds.
    bytes: null,
    at: row.source ? `${row.source.file}:${row.source.line}` : null,
  };
  if (row.item) {
    shown.visible = object.visible !== false;
    const box = bounds(state, object);
    if (box) shown.bounds = box;
  }
  if (hidden !== undefined) shown.hidden = hidden;
  return shown;
}

// A tree too big for one answer is gone on from where it stopped.
const cursors = new Map<string, { rows: Record<string, unknown>[]; at: number }>();
let cursorsMade = 0;

function objects(state: State, args: Args): Result {
  for (const mode of ["models", "model", "components", "component", "mark", "since_mark"]) {
    if (args[mode] !== undefined) {
      throw new Refused("unsupported", `app_objects \`${mode}\` is not answered on the web: the web runtime does not keep a register of its models, components and instances to list`);
    }
  }
  const max = Math.max(1, number(args.max, 3000));
  if (typeof args.cursor === "string") {
    const kept = cursors.get(args.cursor);
    if (!kept) throw new Refused("stale_ref", "the cursor is gone: ask for the tree again");
    cursors.delete(args.cursor);
    return page(kept.rows, kept.at, max);
  }
  forget();
  const { rows } = tree(state);
  let from = 0;
  let end = rows.length;
  if (typeof args.root === "string") {
    const object = target(state, args.root);
    from = rows.findIndex((row) => row.object === object);
    if (from < 0) throw new Refused("not_found", `\`${args.root}\` is not in the tree`);
    end = from + 1;
    while (end < rows.length && rows[end]!.depth > rows[from]!.depth) end++;
  }
  const base = rows[from]?.depth ?? 0;
  const deepest = typeof args.depth === "number" ? args.depth : Infinity;
  const shown: Record<string, unknown>[] = [];
  for (let at = from; at < end; at++) {
    const row = rows[at]!;
    const depth = row.depth - base;
    if (depth > deepest) continue;
    shown.push(shownRow(state, row, depth, depth === deepest && row.children > 0 ? row.children : undefined));
  }
  return page(shown, 0, max);
}

function page(rows: Record<string, unknown>[], at: number, max: number): Result {
  const part = rows.slice(at, at + max);
  const more = at + max < rows.length;
  const structured: Record<string, unknown> = { objects: part, truncated: more };
  if (more) {
    const cursor = `c${++cursorsMade}`;
    cursors.set(cursor, { rows, at: at + max });
    // A cursor nobody goes on with is let go of.
    if (cursors.size > 8) cursors.delete(cursors.keys().next().value!);
    structured.next_cursor = cursor;
  }
  return answered(structured, `${part.length} objects${more ? ", more to come" : ""}`);
}

// ----- Targets and properties -------------------------------------------------------

// What a target names: a handle, `id=name`, `#objectName`, or an id.
function target(state: State, named: unknown): QObject {
  if (typeof named !== "string" || named === "") throw new Refused("invalid_argument", "`target` is to be a handle, `id=name`, `#objectName` or an id");
  if (named.startsWith("@")) {
    const object = byHandle.get(named)?.deref();
    if (!object || object.$destroyed || object.$gone) throw new Refused("stale_ref", `\`${named}\` is gone: list the objects again`);
    return object;
  }
  const { rows } = tree(state);
  const id = named.startsWith("id=") ? named.slice(3) : named.startsWith("#") ? null : named;
  const name = named.startsWith("#") ? named.slice(1) : null;
  const found = rows.filter((row) => (id !== null ? row.id === id : row.object_name === name));
  if (found.length === 0 && name !== null) found.push(...rows.filter((row) => row.id === name));
  if (found.length === 0) throw new Refused("not_found", `no object is \`${named}\``);
  if (found.length > 1) throw new Refused("ambiguous", `${found.length} objects are \`${named}\`: name one by its handle`);
  return found[0]!.object;
}

interface Property {
  name: string;
  read: () => unknown;
  write: (value: unknown) => void;
  slot: Slot | undefined;
  type: string;
}

const TYPE_NAMES: Record<string, string> = { QString: "string", QColor: "color", double: "real" };

function typeName(slotted: Slot | undefined, value: unknown): string {
  const kind = slotted?.kind?.type;
  if (kind) return TYPE_NAMES[kind] ?? kind;
  if (typeof value === "number") return "real";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "string") return "string";
  return "var";
}

// An object's properties, those of its types and its own, each once, in
// the order its types declare them, the type it is first.
function propertiesOf(object: QObject): Property[] {
  const seen = new Set<string>();
  const found: Property[] = [];
  const types: readonly QmlType[] = [...object.$type.chain].reverse();
  const dynamic = object as unknown as Record<string, unknown>;
  for (const type of types) {
    for (const name of Object.keys(type.spec.properties ?? {})) {
      if (seen.has(name) || name.startsWith("$")) continue;
      seen.add(name);
      const members = object.$type.groups[name];
      if (members) {
        for (const member of members) {
          const group = () => dynamic[name] as Record<string, unknown> | null | undefined;
          found.push({
            name: `${name}.${member}`,
            read: () => group()?.[member],
            write: (value) => {
              const held = group();
              if (held) held[member] = value;
            },
            slot: undefined,
            type: typeName(undefined, group()?.[member]),
          });
        }
        continue;
      }
      // The slot there is when asked: reading a property makes its slot,
      // so one nothing had read yet (a binding nobody uses) is told as
      // what it is once the Observer reads it, and a write or a Revert is
      // of the slot that read made.
      const value = dynamic[name];
      found.push({
        name,
        read: () => dynamic[name],
        write: (value) => {
          dynamic[name] = value;
        },
        get slot() {
          return object.$slots[name];
        },
        type: typeName(object.$slots[name], value),
      });
    }
  }
  return found;
}

function provenance(slotted: Slot | undefined): string {
  if (!slotted) return "default";
  if (slotted.shown) return "animated";
  if (slotted.assigned) return "assigned";
  if (slotted.bound) return "bound";
  if (slotted.placed !== undefined) return "host";
  if (slotted.given !== undefined) return "assigned";
  return "default";
}

function valueText(value: unknown): { value: string | null; handle?: string; items?: string[] } {
  if (value === undefined || value === null) return { value: null };
  if (typeof value === "string") return { value };
  if (typeof value === "number" || typeof value === "boolean") return { value: String(value) };
  const object = value as QObject;
  if (object.$type) {
    const id = object.$props?.$id;
    return { value: `${object.$type.typeName}${typeof id === "string" && id ? `#${id}` : ""}`, handle: handle(object) };
  }
  if (Array.isArray(value) && value.length > 0 && value.every((each) => (each as QObject)?.$type)) {
    return { value: `[${value.length} objects]`, items: value.map((each) => handle(each as QObject)) };
  }
  const text = value as { toString?: () => string };
  if (typeof text.toString === "function" && text.toString !== Object.prototype.toString) return { value: text.toString() };
  try {
    return { value: JSON.stringify(value) };
  } catch {
    return { value: String(value) };
  }
}

function inspected(state: State, args: Args): Result {
  const object = target(state, args.target);
  flush();
  const { rows } = tree(state);
  const row = rows.find((each) => each.object === object);
  const edited = state.edited.get(object);
  let omitted = 0;
  const properties: Record<string, unknown>[] = [];
  for (const property of propertiesOf(object)) {
    const said = provenance(property.slot);
    const mine = edited?.has(property.name) === true;
    if (said === "default" && !mine && args.all !== true) {
      omitted++;
      continue;
    }
    const shown: Record<string, unknown> = { name: property.name, type: property.type, ...valueText(property.read()), provenance: said };
    if (mine) {
      shown.assigned_by = "devtools";
      shown.binding_kept = Boolean(property.slot?.bound);
    }
    properties.push(shown);
  }
  const item = object as QObject & { visible?: boolean; enabled?: boolean; activeFocus?: boolean };
  const structured: Record<string, unknown> = {
    ref: handle(object),
    type: row?.type ?? object.$type.typeName,
    types: [...object.$type.chain].reverse().map((type) => type.typeName),
    id: row?.id || null,
    object_name: row?.object_name || null,
    source: row?.source ?? null,
    state: { visible: item.visible !== false, enabled: item.enabled !== false, focus: item.activeFocus === true },
    properties,
    omitted,
    truncated: false,
  };
  const box = bounds(state, object);
  structured.geometry = box ? { x: box[0], y: box[1], width: box[2], height: box[3] } : null;
  if (args.bindings === true) structured.bindings = [];
  return answered(structured, `${structured.type}${row?.id ? `#${row.id}` : ""}: ${properties.length} properties`);
}

function propertyOf(object: QObject, name: unknown): Property {
  if (typeof name !== "string" || name === "") throw new Refused("invalid_argument", "`property` is to be a property's name");
  const property = propertiesOf(object).find((each) => each.name === name);
  if (!property) throw new Refused("not_found", `the object has no property \`${name}\``);
  return property;
}

function setProperty(state: State, args: Args): Result {
  const object = target(state, args.target);
  const property = propertyOf(object, args.property);
  const previous = valueText(property.read()).value;
  if (args.binding !== undefined) {
    throw new Refused(
      "unsupported",
      "a binding typed in the Observer is not made on the web: the page's QML was compiled ahead of time, and an expression would need the compiler in the page; give a value instead",
    );
  }
  if (args.revert === true) {
    const slotted = property.slot;
    if (!slotted) throw new Refused("not_actionable", `\`${property.name}\` has nothing to go back to`);
    slotted.reset();
    flush();
    state.edited.get(object)?.delete(property.name);
    const restored = slotted.bound ? "binding" : "value";
    return answered({ property: property.name, value: valueText(property.read()).value, previous, restored });
  }
  if (!("value" in args)) throw new Refused("invalid_argument", "give `value`, `binding` or `revert`");
  try {
    property.write(args.value);
  } catch (error) {
    throw new Refused("invalid_argument", error instanceof Error ? error.message : String(error));
  }
  flush();
  // An assignment covers a binding and keeps it under it, so that Revert
  // brings it back: `keep_binding` is how the web runtime always assigns.
  let mine = state.edited.get(object);
  if (!mine) state.edited.set(object, (mine = new Set()));
  mine.add(property.name);
  const bound = Boolean(property.slot?.bound);
  return answered({ property: property.name, value: valueText(property.read()).value, previous, bound, binding_kept: bound });
}

function getProperty(state: State, args: Args): Result {
  const object = target(state, args.target);
  const property = propertyOf(object, args.property);
  flush();
  return answered({ property: property.name, type: property.type, ...valueText(property.read()), provenance: provenance(property.slot) });
}

// ----- app_screenshot -----------------------------------------------------------

function base64(bytes: Uint8Array): string {
  let text = "";
  for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(text);
}

async function screenshot(state: State, args: Args): Promise<Result> {
  const at = inspect(state.root);
  const options: { target?: QObject; max_size?: number } = {};
  if (args.target !== undefined && args.target !== null) options.target = target(state, args.target);
  if (typeof args.max_size === "number") options.max_size = args.max_size;
  const shot = (await at.screenshot(options)) as { png?: Uint8Array; width?: number; height?: number; scale?: number; bytes?: number; area?: number[]; masked?: unknown; error?: string; message?: string };
  if (!shot.png) throw new Refused(shot.error ?? "internal", shot.message ?? "no picture was taken");
  const structured = { width: shot.width, height: shot.height, scale: shot.scale, bytes: shot.bytes, area: shot.area, masked: shot.masked ?? [] };
  return {
    structuredContent: structured,
    content: [
      { type: "text", text: `${shot.width}×${shot.height} PNG` },
      { type: "image", mimeType: "image/png", data: base64(shot.png) },
    ],
  };
}

// ----- app_logs, app_metrics, app_frames, app_status, app_processes -----------------

function logsOf(state: State, args: Args): Result {
  const limit = Math.max(1, Math.min(number(args.limit, 100), 1000));
  const since = Math.max(0, number(args.since, 0));
  const total = state.logs.count();
  const lines = state.logs.lines(since, limit + 1);
  const truncated = lines.length > limit;
  const kept = lines.slice(0, limit);
  const entries = kept.map(({ seq, line }) => ({ seq, ...line }));
  const next = kept.length ? kept.at(-1)!.seq + 1 : Math.max(since, total);
  return answered({ entries, count: entries.length, total, truncated, next_since: next }, `${entries.length} lines`);
}

function quantiles(values: number[]): { p50: number; p95: number; max: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (share: number) => sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0;
  return { p50: at(0.5), p95: at(0.95), max: sorted.at(-1) ?? 0 };
}

function metrics(state: State, args: Args): Result {
  if (args.memory !== undefined) {
    throw new Refused("unsupported", "what memory an object holds is not measured on the web: the browser does not tell a page that; its memory panel does");
  }
  const { rows } = tree(state);
  const recent = state.frames.slice(-120);
  return answered({
    frames: { count: state.counts.frames, total_us: state.framesTotalUs, last_us: state.lastUs, max_us: state.framesMaxUs, overruns: state.overruns },
    recent: { frames: recent.length, budget_us: BUDGET_US, total_us: quantiles(recent.map((frame) => frame.total_us)) },
    objects: rows.length,
    paint: { presented: state.counts.paints, presented_in_part: 0, unchanged: 0, painter: "dom" },
  });
}

const FRAME_MODES = ["wakes", "wake", "bindings", "growth", "export"];

function frames(state: State, args: Args): Result {
  for (const mode of FRAME_MODES) {
    if (args[mode] !== undefined) {
      throw new Refused("unsupported", `app_frames \`${mode}\` is not answered on the web: the web runtime does not record its wakes, bindings and growth; the browser's performance panel does`);
    }
  }
  if (typeof args.record === "boolean") state.recording = args.record;
  const since = number(args.since, 0);
  const max = Math.max(1, number(args.max, 600));
  const after = state.frames.filter((frame) => frame.frame >= since);
  const listed = after.slice(0, max);
  const next = listed.length ? listed.at(-1)!.frame + 1 : Math.max(since, state.counts.frames + 1);
  const kept = state.frames.length;
  const dropped = Math.max(0, state.counts.frames - kept);
  const part = (pick: (frame: Frame) => number) => quantiles(listed.map(pick));
  const summary = listed.length
    ? {
        total_us: part((frame) => frame.total_us),
        timers_us: part((frame) => frame.passes.timers_us),
        animations_us: part((frame) => frame.passes.animations_us),
        layout_us: part((frame) => frame.passes.layout_us),
        scene_us: part((frame) => frame.passes.scene_us),
      }
    : null;
  return answered(
    { recording: state.recording, frames: listed, next_since: next, more: after.length > listed.length, dropped, kept, summary },
    `${listed.length} passes`,
  );
}

function kindOf(object: QObject): "timer" | "animation" | null {
  const names = object.$type.chain.map((type) => type.typeName);
  if (names.includes("Timer")) return "timer";
  if (names.some((name) => name.endsWith("Animation") || name === "Animator")) return "animation";
  return null;
}

function processes(state: State, args: Args): Result {
  const kind = typeof args.kind === "string" ? args.kind : null;
  if (kind && kind !== "thread" && kind !== "timer" && kind !== "animation") {
    throw new Refused("unsupported", `app_processes \`${kind}\` is not answered on the web: the application runs on this page's one thread, with no mailboxes, supervisors or wakers beyond it`);
  }
  const rows: Record<string, unknown>[] = [];
  if (!kind || kind === "thread") {
    rows.push({
      kind: "thread",
      name: "main",
      role: "ui",
      tid: null,
      state: clockCounts().jobs > 0 ? "busy" : "idle",
      work_us: state.framesTotalUs,
      wakeups: state.counts.frames,
      preempted: null,
    });
  }
  if (!kind || kind === "timer" || kind === "animation") {
    for (const row of tree(state).rows) {
      const made = kindOf(row.object);
      if (!made || (kind && made !== kind)) continue;
      const timed = row.object as QObject & { running?: boolean; interval?: number; repeat?: boolean };
      const named = row.id || row.object_name || row.type;
      const locator = row.id ? `id=${row.id}` : handle(row.object);
      rows.push(
        made === "timer"
          ? { kind: "timer", name: named, handle: handle(row.object), locator, state: timed.running ? "waiting" : "frozen", interval_ms: timed.interval ?? null, repeat: timed.repeat === true, due_in_us: null, wakeups: null }
          : { kind: "animation", name: named, handle: handle(row.object), locator, state: timed.running ? "running" : "stopped" },
      );
    }
  }
  const structured: Record<string, unknown> = { processes: rows };
  // A page has no process id of its own to give: the number it serves the
  // application under (`page://N`) is what names the one observed, as a
  // pid does for an application `ljos observe` attaches to.
  if (!kind) structured.process = { pid: Number(state.token.slice(state.token.indexOf(":") + 1)), threads: 1, not_measured: ["rss_bytes", "cpu_us", "wakeups"] };
  return answered(structured, `${rows.length} rows`);
}

function status(state: State): Result {
  const item = rootItem(state) as QObject & { width?: number; height?: number };
  const { rows } = tree(state);
  const media = (query: string) => typeof matchMedia === "function" && matchMedia(query).matches;
  return answered({
    windows: [
      {
        title: state.title,
        width: item.width ?? 0,
        height: item.height ?? 0,
        scale: globalThis.devicePixelRatio ?? 1,
        visible: true,
        appearance: { color_scheme: media("(prefers-color-scheme: dark)") ? "dark" : "light", reduced_motion: media("(prefers-reduced-motion: reduce)"), font_scale: 1 },
        focus: typeof document !== "undefined" && document.hasFocus(),
      },
    ],
    window_count: 1,
    inspected: "primary_window_only",
    clock: "system",
    reload_generation: state.counts.reloads,
    objects: rows.length,
    animations: rows.filter((row) => kindOf(row.object) === "animation").length,
    capabilities: Object.keys(TOOLS),
  });
}

// ----- What the QML types ask of it ---------------------------------------------
//
// `Inspector` and `InspectorClient` are QML files of the module
// (`Inspector.qml`, `InspectorClient.qml` here, which `controls.js` names in
// its `qmldir`), so that what compiles against them is checked against
// what they declare, as the native client's members are; what they do is
// these functions (`inspecting.mjs`). What a native type has readonly
// (`url`, `connected`, …) each keeps in an object of its own, `last`, which
// only these write.

interface Serving extends QObject {
  target: QObject | null;
  logs: LogSource | null;
  title: string;
  last: QObject & { tokenFile: string; url: string };
}

const serving = new WeakMap<Serving, { complete: boolean; served: Served | null }>();

// `Inspector { target: item }`: serves `target` while it is set, under the
// token `tokenFile` says, which an `InspectorClient` is given. A new target
// is a reload of the one served; the Inspector gone, nothing is. `logs`
// and `title` are as `serve` takes them, read as the target is first
// served. Called once it is complete, and as its target changes.
export function follow(inspector: Serving, completed = false): void {
  untrack(() => {
    let held = serving.get(inspector);
    if (!held) serving.set(inspector, (held = { complete: false, served: null }));
    if (completed) held.complete = true;
    // A target set before the object is complete is served as it completes.
    if (!held.complete) return;
    const next = inspector.target;
    if (!next) {
      held.served?.close();
      held.served = null;
    } else if (held.served) held.served.reload(next);
    else held.served = serve(next, { ...(inspector.logs ? { logs: inspector.logs } : {}), title: inspector.title });
    const token = held.served?.token ?? "";
    const url = held.served?.url ?? "";
    if (inspector.last.tokenFile !== token) inspector.last.tokenFile = token;
    if (inspector.last.url !== url) inspector.last.url = url;
  });
}

// The Inspector gone: what it served is let go of.
export function release(inspector: Serving): void {
  const held = serving.get(inspector);
  held?.served?.close();
  serving.delete(inspector);
}

interface Client extends QObject {
  tokenFile: string;
  clientName: string;
  last: QObject & { url: string; connected: boolean; error: string; pending: number };
  answered: (serial: number, tool: string, ok: boolean, result: string) => void;
}

const serials = new WeakMap<Client, number>();

// The client the Observer asks through, as natively: `call(tool, arguments)`
// returns a serial at once, and `answered(serial, tool, ok, result)` comes
// later with the tool's result as JSON text, or why there is none.
export function call(client: Client, tool: unknown, argumentsText: unknown): number {
  const serial = (serials.get(client) ?? 0) + 1;
  serials.set(client, serial);
  untrack(() => (client.last.pending = client.last.pending + 1));
  const name = String(tool);
  void ask(client, name, argumentsText).then(
    (result) =>
      finish(
        client,
        serial,
        name,
        result.isError
          ? {
              ok: false,
              text: result.content
                .filter((c) => c.type === "text")
                .map((c) => (c as { text: string }).text)
                .join("\n"),
            }
          : { ok: true, text: JSON.stringify(result) },
        true,
      ),
    (error: unknown) => finish(client, serial, name, { ok: false, text: error instanceof Error ? error.message : String(error) }, !(error instanceof Unreached)),
  );
  return serial;
}

// Where a rule's guide (`docs/design/<page>#<code>`, as the audit gives it)
// can be read, as natively.
export function guideUrl(guide: unknown): string {
  return `https://github.com/olafura/ljos-ui/blob/main/${String(guide)}`;
}

async function ask(client: Client, tool: string, argumentsText: unknown): Promise<Result> {
  // Never inside the call: QML connects to `answered` once it has the serial.
  await Promise.resolve();
  // The token as it is when the call is answered, as a native client reads
  // its token file when it connects: an Observer made in the same pass as
  // the inspector it is given asks before that inspector is served.
  const token = untrack(() => String(client.tokenFile));
  const state = served.get(token);
  if (!state) throw new Unreached(token ? `nothing on this page is served as \`${token}\`` : "no inspector is given: `tokenFile` is empty");
  const url = urlOf(token);
  if (client.last.url !== url) client.last.url = url;
  let args: Args;
  try {
    const text = typeof argumentsText === "string" ? argumentsText.trim() : "";
    const parsed: unknown = text === "" ? {} : JSON.parse(text);
    args = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Args) : {};
  } catch (error) {
    throw new Unreached(`the arguments are not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return answer(state, tool, args);
}

function finish(client: Client, serial: number, tool: string, result: { ok: boolean; text: string }, reached: boolean): void {
  if (client.$destroyed || client.$gone) return;
  const last = client.last;
  if (last.connected !== reached) last.connected = reached;
  const why = reached ? "" : result.text;
  if (last.error !== why) last.error = why;
  last.pending = Math.max(0, last.pending - 1);
  client.answered(serial, tool, result.ok, result.text);
}
