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
import { flush, isGroup, native, work } from "../../object.ts";
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
  binding_runs: number | null;
  text_us: null;
  text_layouts: number | null;
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
  // `settled` when what changed was given its settle time to say more.
  answer: (settled?: boolean) => void;
}

// What the property had before the Observer's first edit of it, and what
// that edit (or the last of them) left it with: a Revert gives back the one
// only while the other is still there.
interface Edit {
  assigned: boolean;
  value: unknown;
  left: unknown;
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
  edited: WeakMap<object, Map<string, Edit>>;
  // The objects this application's answers named, each with the reload it
  // was named in: a handle is the page's, but a client asks only of the
  // application its token serves. One named before the last reload is
  // stale, as natively a reload makes every handle stale, even when the
  // object is still there; named again, it is the application's again.
  owned: WeakMap<object, number>;
  // When each item followed was last asked of, by handle: one no watch has
  // asked of for a while is no longer counted.
  itemAsked: Map<string, number>;
  // A tree too big for one answer is gone on from where it stopped.
  cursors: Map<string, { rows: Record<string, unknown>[]; at: number }>;
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
// How many handles the page may keep before those of objects gone are let
// go of: twice what was kept after the last time, so that minting one
// costs as much as ever on the whole, whatever asks for it.
let sweepAt = 64;

function handle(object: QObject): string {
  let named = handleOf.get(object);
  if (!named) {
    if (byHandle.size >= sweepAt) {
      forget();
      sweepAt = Math.max(64, byHandle.size * 2);
    }
    named = `@${++handles}`;
    handleOf.set(object, named);
    byHandle.set(named, new WeakRef(object));
  }
  return named;
}

// How many handles the page keeps, of objects there or gone.
export function heldHandles(): number {
  return byHandle.size;
}

// How many items what is served as `token` still follows for watches.
export function followedItems(token: string): number {
  return served.get(token)?.itemCounts.size ?? 0;
}

// A handle in an answer of `state`'s: the object is then one its client may
// ask of.
function handed(state: State, object: QObject): string {
  state.owned.set(object, state.counts.reloads);
  return handle(object);
}

// What a handle names, if it is one of `state`'s and still there.
function owned(state: State, named: string): QObject {
  const object = byHandle.get(named)?.deref();
  if (!object || object.$destroyed || object.$gone) throw new Refused("stale_ref", `\`${named}\` is gone: list the objects again`);
  const at = state.owned.get(object);
  if (at === undefined) throw new Refused("not_found", `\`${named}\` is no object of this application: list its objects`);
  if (at !== state.counts.reloads) throw new Refused("stale_ref", `\`${named}\` was named before the application was reloaded: list its objects again`);
  return object;
}

// Lets go of the handles of objects that are gone: as handles are minted,
// and as the tree is listed again.
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

// What the runtime counted so far is no one root's once the roots served
// change: each that is still served counts from here.
function rebase(): void {
  for (const each of served.values()) {
    each.bindingRuns = work.bindingRuns;
    each.textLayouts = work.textLayouts;
  }
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

// What changed in a root outside a step: input's, or a message's. A step
// of the clock not yet over (`started` is its until `stepped` runs) is what
// the records are of, whichever comes first: something that changed the
// page just before the step, in the same task, had them delivered before
// the step's own microtask, and with them what the step changed. What is
// delivered together is one pass, and a pass the clock stepped in is the
// clock's.
function noticed(state: State, records: MutationRecord[]): void {
  if (started && started.cause !== "input") {
    passed(state, records, started.cause, started.at);
    return;
  }
  const now = performance.now();
  const input = started?.cause === "input" && now - started.at < INPUT_MS ? started : null;
  // Every root the input changed has its records delivered in this one
  // checkpoint, each to its own observer: the input is each of theirs, and
  // let go of once they all were told, before it could name later work.
  if (input) queueMicrotask(() => {
    if (started === input) started = null;
  });
  passed(state, records, input ? "input" : "message", input ? input.at : now);
}

function passed(state: State, records: MutationRecord[], cause: string, at: number): void {
  const us = Math.max(0, Math.round((performance.now() - at) * 1000));
  const alone = served.size === 1;
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
    // The runtime counts the page's work, not each application's: with
    // more than one served, what ran is not told as any one's.
    binding_runs: alone ? work.bindingRuns - state.bindingRuns : null,
    text_us: null,
    text_layouts: alone ? work.textLayouts - state.textLayouts : null,
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
  // An item followed counts the passes that changed something in it; one no
  // watch follows any more is let go of first, as a pass is when it is
  // looked for.
  if (state.itemCounts.size > 0) unfollow(state, performance.now());
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
        const wrappers = new Map<(typeof LEVELS)[number], (...args: unknown[]) => void>();
        for (const name of LEVELS) {
          const before = said.get(name)!;
          const wrapped = (...args: unknown[]) => {
            before.apply(console, args);
            for (const listener of [...listeners]) listener();
          };
          wrappers.set(name, wrapped);
          console[name] = wrapped;
        }
        // Only a method that is still this wrapper is given back: one
        // something wrapped over it since keeps calling this one, which
        // then tells no listener.
        unwrapConsole = () => {
          for (const name of LEVELS) if (console[name] === wrappers.get(name)) console[name] = said.get(name)!;
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
    owned: new WeakMap(),
    itemAsked: new Map(),
    cursors: new Map(),
    observer: null,
    unlisten: () => {},
    bornAt: performance.now(),
    bindingRuns: work.bindingRuns,
    textLayouts: work.textLayouts,
  };
  try {
    state.unlisten = logs.listen(() => {
      state.counts.logs = logs.count();
      tellWatches(state);
    });
  } catch (error) {
    // Nothing is served: the page's hooks go again unless another root
    // still needs them.
    unhook();
    throw error;
  }
  served.set(token, state);
  rebase();
  observe(state);
  return {
    token,
    url: urlOf(token),
    reload(next) {
      if (!served.has(token)) return;
      state.root = next;
      state.edited = new WeakMap();
      state.itemCounts.clear();
      state.itemAsked.clear();
      state.cursors.clear();
      observe(state);
      bump(state, "reloads");
    },
    close() {
      if (!served.delete(token)) return;
      rebase();
      state.observer?.disconnect();
      // A log that fails to stop telling still leaves the root closed: its
      // watches answered and the page's hooks gone with the last one.
      try {
        state.unlisten();
      } finally {
        for (const watch of [...state.watches]) watch.answer();
        unhook();
      }
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
  app_click: (state, args) => clicked(state, args),
  app_find: (state, args) => found(state, args),
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
    if (watch.settleMs > 0) watch.settling = setTimeout(() => watch.answer(true), watch.settleMs);
    else watch.answer();
  }
}

function rest(): Record<string, unknown> {
  const jobs = clockCounts().jobs;
  return { wake_in_ms: null, frame_owed: false, animating: jobs > 0, at_rest: jobs === 0, pointer: false };
}

// An item no watch has asked of for this long, and none waits on, is no
// longer counted: every pass looks for the items followed in what it changed.
const FOLLOWED_MS = 60_000;

function unfollow(state: State, now: number): void {
  const waited = new Set<string>();
  for (const watching of state.watches) for (const named of watching.items.keys()) waited.add(named);
  for (const [named, at] of state.itemAsked) {
    if (now - at < FOLLOWED_MS || waited.has(named)) continue;
    state.itemAsked.delete(named);
    state.itemCounts.delete(named);
  }
}

function watch(state: State, args: Args): Promise<Result> {
  const since = (args.since ?? null) as (Partial<Counts> & { items?: Record<string, number> }) | null;
  const asked = Array.isArray(args.items) ? args.items.filter((item): item is string => typeof item === "string") : [];
  if (asked.length > MOST_ITEMS) throw new Refused("invalid_argument", `a watch follows at most ${MOST_ITEMS} items`);
  for (const named of asked) owned(state, named);
  const now = performance.now();
  for (const named of asked) {
    if (!state.itemCounts.has(named)) state.itemCounts.set(named, 0);
    state.itemAsked.set(named, now);
  }
  unfollow(state, now);
  const holder = typeof args.holder === "string" && args.holder !== "" ? args.holder : null;
  // A holder follows the application with one watch at a time: asked again,
  // it wants what it asks now, so the watch it had out is answered at once,
  // a question with no counts to compare with included. The Observer counts
  // on it: an item picked is followed by a new watch while the one following
  // every pass is still out, and it asks again only once no watch of its
  // own is waiting.
  if (holder !== null) for (const earlier of [...state.watches]) if (earlier.holder === holder) earlier.answer();
  const reply = (waited: number, settled: boolean, changed: string[]): Result =>
    answered({ counts: countsOf(state, asked), changed, waited, settled, rest: rest() });
  // No counts to compare with: what they are now.
  if (!since) return Promise.resolve(reply(0, false, []));
  const items = new Map<string, number>();
  for (const named of asked) items.set(named, since.items?.[named] ?? state.itemCounts.get(named) ?? 0);
  const wait = Math.min(Math.max(0, number(args.wait_ms, 10_000)), MOST_WAIT_MS);
  const settleMs = Math.min(Math.max(0, number(args.settle_ms, 0)), MOST_SETTLE_MS);
  return new Promise((resolve) => {
    const watching: Watch = {
      since,
      items,
      holder,
      settleMs,
      started: performance.now(),
      settling: null,
      waiting: null,
      answer(settled = false) {
        if (!state.watches.delete(watching)) return;
        if (watching.settling) clearTimeout(watching.settling);
        if (watching.waiting) clearTimeout(watching.waiting);
        const changed = changedOf(state, watching);
        resolve(reply(Math.round(performance.now() - watching.started), settled, changed));
      },
    };
    state.watches.add(watching);
    if (changedOf(state, watching).length > 0) watching.answer();
    else if (wait > 0) watching.waiting = setTimeout(() => watching.answer(), wait);
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
  const object = row.object;
  const shown: Record<string, unknown> = {
    handle: handed(state, object),
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
    // Whether it is shown: the item's own, which a file may declare a
    // `visible` over that is no showing of it (`shadowed.qml`).
    shown.visible = native(object, "visible") !== false;
    const box = bounds(state, object);
    if (box) shown.bounds = box;
  }
  if (hidden !== undefined) shown.hidden = hidden;
  return shown;
}

let cursorsMade = 0;

function objects(state: State, args: Args): Result {
  for (const mode of ["models", "model", "components", "component", "mark", "since_mark"]) {
    if (args[mode] !== undefined) {
      throw new Refused("unsupported", `app_objects \`${mode}\` is not answered on the web: the web runtime does not keep a register of its models, components and instances to list`);
    }
  }
  const max = Math.max(1, number(args.max, 3000));
  if (typeof args.cursor === "string") {
    const kept = state.cursors.get(args.cursor);
    if (!kept) throw new Refused("stale_ref", "the cursor is gone: ask for the tree again");
    state.cursors.delete(args.cursor);
    return page(state, kept.rows, kept.at, max);
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
  return page(state, shown, 0, max);
}

function page(state: State, rows: Record<string, unknown>[], at: number, max: number): Result {
  const part = rows.slice(at, at + max);
  const more = at + max < rows.length;
  const structured: Record<string, unknown> = { objects: part, truncated: more };
  if (more) {
    const cursor = `c${++cursorsMade}`;
    state.cursors.set(cursor, { rows, at: at + max });
    // A cursor nobody goes on with is let go of.
    if (state.cursors.size > 8) state.cursors.delete(state.cursors.keys().next().value!);
    structured.next_cursor = cursor;
  }
  return answered(structured, `${part.length} objects${more ? ", more to come" : ""}`);
}

// ----- Targets and properties -------------------------------------------------------

// What a target names: a handle, `id=name`, `#objectName`, or an id.
function target(state: State, named: unknown): QObject {
  if (typeof named !== "string" || named === "") throw new Refused("invalid_argument", "`target` is to be a handle, `id=name`, `#objectName` or an id");
  if (named.startsWith("@")) return owned(state, named);
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
    const declared = type.spec.properties ?? {};
    for (const name of Object.keys(declared)) {
      if (seen.has(name) || name.startsWith("$")) continue;
      seen.add(name);
      // A group as the declaration that wins has it: a file's `property
      // string font` is one value, though its type's `font` is a group.
      const members = isGroup(declared[name]) ? object.$type.groups[name] : undefined;
      if (members) {
        for (const member of members) {
          const group = () => dynamic[name] as Record<string, unknown> | null | undefined;
          // Each member is a slot of the object's own (`font$bold`), as
          // a property is: a write covers what it had, and a Revert gives
          // that back, a binding of `font.bold` included.
          const key = `${name}$${member}`;
          const value = group()?.[member];
          found.push({
            name: `${name}.${member}`,
            read: () => group()?.[member],
            write: (value) => {
              const held = group();
              if (held) held[member] = value;
            },
            get slot() {
              return object.$slots[key];
            },
            type: typeName(object.$slots[key], value),
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
  // `property alias caption: label.text`: the file's own, though no type
  // declares it. It is read and written through the alias, and what it has
  // is the slot it names, so that it is told as bound or assigned, and a
  // Revert takes back what was written to it.
  for (const [name, named] of Object.entries(object.$props?.$aliases ?? {})) {
    if (seen.has(name) || name.startsWith("$")) continue;
    seen.add(name);
    const [aliased, key] = aliasEnd(named);
    const slotOf = () => (aliased ? aliased.$slots[key] : undefined);
    const value = dynamic[name];
    found.push({
      name,
      read: () => dynamic[name],
      write: (value) => {
        dynamic[name] = value;
      },
      get slot() {
        return slotOf();
      },
      type: typeName(slotOf(), value),
    });
  }
  return found;
}

// The object and slot an alias ends at: `property alias outer:
// middle.caption`, where `middle.caption` is an alias itself, is of what
// that one names. None for an alias of an object, which holds no value.
type Aliased = readonly [unknown, ...string[]];
function aliasEnd([held, ...path]: Aliased): [QObject | null, string] {
  for (let hops = 0; hops < 32; hops++) {
    const aliased = path.length > 0 && (held as QObject | null)?.$type ? (held as QObject) : null;
    const further = aliased && path.length === 1 ? (aliased.$props?.$aliases as Record<string, Aliased> | undefined)?.[path[0]!] : undefined;
    if (!further) return [aliased, path.join("$")];
    [held, ...path] = further;
  }
  return [null, ""];
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

function valueText(state: State, value: unknown): { value: string | null; handle?: string; items?: string[] } {
  if (value === undefined || value === null) return { value: null };
  if (typeof value === "string") return { value };
  if (typeof value === "number" || typeof value === "boolean") return { value: String(value) };
  const object = value as QObject;
  if (object.$type) {
    const id = object.$props?.$id;
    return { value: `${object.$type.typeName}${typeof id === "string" && id ? `#${id}` : ""}`, handle: handed(state, object) };
  }
  if (Array.isArray(value) && value.length > 0 && value.every((each) => (each as QObject)?.$type)) {
    return { value: `[${value.length} objects]`, items: value.map((each) => handed(state, each as QObject)) };
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
    const shown: Record<string, unknown> = { name: property.name, type: property.type, ...valueText(state, property.read()), provenance: said };
    if (mine) {
      shown.assigned_by = "devtools";
      shown.binding_kept = Boolean(property.slot?.bound);
    }
    properties.push(shown);
  }
  // Whether it is shown and takes input: the item's own, as it is drawn and
  // hit; what a file declares over them is in its properties.
  const item = object as QObject & { activeFocus?: boolean };
  const structured: Record<string, unknown> = {
    ref: handed(state, object),
    type: row?.type ?? object.$type.typeName,
    types: [...object.$type.chain].reverse().map((type) => type.typeName),
    id: row?.id || null,
    object_name: row?.object_name || null,
    source: row?.source ?? null,
    state: { visible: native(object, "visible") !== false, enabled: native(object, "enabled") !== false, focus: item.activeFocus === true },
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
  const previous = valueText(state, property.read()).value;
  if (args.binding !== undefined) {
    throw new Refused(
      "unsupported",
      "a binding typed in the Observer is not made on the web: the page's QML was compiled ahead of time, and an expression would need the compiler in the page; give a value instead",
    );
  }
  if (args.revert === true) {
    // Only what the Observer did is taken back, as natively: the property
    // has what it had before the Observer's first edit, an assignment of
    // the application's or the binding under the edit. One the application
    // wrote again since is the application's, and is kept.
    const edits = state.edited.get(object);
    const edit = edits?.get(property.name);
    const slotted = property.slot;
    if (!edit) throw new Refused("not_actionable", `the Observer did not change \`${property.name}\`, so there is nothing to revert`);
    if (!slotted) {
      edits!.delete(property.name);
      throw new Refused("not_actionable", `\`${property.name}\` holds no value of its own to go back to`);
    }
    edits!.delete(property.name);
    let restored: string;
    if (!slotted.assigned || !Object.is(slotted.value, edit.left)) restored = "none";
    else {
      if (edit.assigned) property.write(edit.value);
      else slotted.reset();
      flush();
      restored = slotted.assigned ? "value" : slotted.bound ? "binding" : "value";
    }
    return answered({ property: property.name, value: valueText(state, property.read()).value, previous, restored });
  }
  if (!("value" in args)) throw new Refused("invalid_argument", "give `value`, `binding` or `revert`");
  const had = property.slot;
  // Only what a Revert can give back is edited: a property with no value of
  // its own (an alias of an object), or one with an override over it, which
  // a write would end and its Revert could not put back.
  if (!had) throw new Refused("not_actionable", `\`${property.name}\` holds no value of its own that a Revert could give back, so it is not edited`);
  if (had.layers) throw new Refused("not_actionable", `\`${property.name}\` has an override over it, which an edit would end and a Revert could not put back`);
  // What it had before the Observer first changed it, kept until a Revert,
  // while the Observer's edit is what it has: one the application wrote
  // over since is the application's, and is what a Revert gives back.
  const earlier = state.edited.get(object)?.get(property.name);
  const before = earlier && had.assigned && Object.is(had.value, earlier.left) ? earlier : undefined;
  const kept = before ?? { assigned: had.assigned === true, value: had.assigned ? had.value : undefined };
  try {
    property.write(args.value);
  } catch (error) {
    throw new Refused("invalid_argument", error instanceof Error ? error.message : String(error));
  }
  flush();
  // An assignment covers a binding and keeps it under it, so that Revert
  // brings it back: `keep_binding` is how the web runtime always assigns.
  let mine = state.edited.get(object);
  if (!mine) state.edited.set(object, (mine = new Map()));
  mine.set(property.name, { assigned: kept.assigned, value: kept.value, left: property.slot?.value });
  const bound = Boolean(property.slot?.bound);
  return answered({ property: property.name, value: valueText(state, property.read()).value, previous, bound, binding_kept: bound });
}

function getProperty(state: State, args: Args): Result {
  const object = target(state, args.target);
  const property = propertyOf(object, args.property);
  flush();
  return answered({ property: property.name, type: property.type, ...valueText(state, property.read()), provenance: provenance(property.slot) });
}

// ----- app_click, app_find -------------------------------------------------------

// Two places, to say a point as the native inspector says it.
const placed = (value: number): number => Math.round(value * 100) / 100;

// A click as a person makes one, through `inspect(root).click`: what is drawn
// on top at the point gets it, by the same handlers a mouse reaches.
function clicked(state: State, args: Args): Result {
  const at = inspect(state.root);
  let done: { at?: [number, number]; error?: string; message?: string };
  let named: string | null = null;
  if (Array.isArray(args.at)) {
    const [x, y] = args.at as unknown[];
    if (typeof x !== "number" || typeof y !== "number") throw new Refused("invalid_argument", "`at` is to be `[x, y]`, in the root's logical pixels");
    done = at.click({ at: [x, y] });
  } else if (args.target !== undefined) {
    named = String(args.target);
    done = at.click(target(state, args.target));
  } else throw new Refused("invalid_argument", "give `target` (a handle, `id=name`, `#objectName` or an id) or `at: [x, y]`");
  if (!done.at) throw new Refused(done.error ?? "internal", done.message ?? "the click went nowhere");
  const point = [placed(done.at[0]), placed(done.at[1])];
  return answered({ at: point, settled: true }, `clicked ${named !== null ? `\`${named}\` ` : ""}at ${point[0]},${point[1]}`);
}

// What a reader hears an object as: the role and name its element is given
// (`Accessible`), and a text's own words when it has no name.
function heard(object: QObject): { role: string | null; name: string } {
  const node = object.$node as Element | undefined;
  const role = node?.getAttribute?.("role") ?? null;
  const label = node?.getAttribute?.("aria-label");
  const text = (object as { text?: unknown }).text;
  return { role, name: label ?? (typeof text === "string" ? text : "") };
}

function shown(object: QObject): boolean {
  const node = object.$node as (Element & { checkVisibility?: () => boolean }) | undefined;
  if (!node) return false;
  return node.checkVisibility ? node.checkVisibility() : native(object, "visible") !== false;
}

const LOCATORS = "`text=words`, `role=button[name=\"Words\"]`, `name~=regex`, `#objectName`, `id=name`, `@handle` or `at=X,Y`";

// Which rows a locator names. What is matched by what it shows (text, role,
// name, a point) is only what is shown; what is named by id or handle is
// named whether shown or not, as `target` names it.
function located(state: State, rows: Row[], locator: string): Row[] {
  if (locator.startsWith("@")) {
    const object = owned(state, locator);
    return rows.filter((row) => row.object === object);
  }
  if (locator.startsWith("#")) {
    const name = locator.slice(1);
    const named = rows.filter((row) => row.object_name === name);
    return named.length ? named : rows.filter((row) => row.id === name);
  }
  if (locator.startsWith("id=")) return rows.filter((row) => row.id === locator.slice(3));
  const items = rows.filter((row) => row.item && shown(row.object));
  if (locator.startsWith("text=")) {
    // A person looks for words, not their case.
    const words = locator.slice(5).toLowerCase();
    return items.filter((row) => {
      const text = (row.object as { text?: unknown }).text;
      return typeof text === "string" && text.toLowerCase().includes(words);
    });
  }
  if (locator.startsWith("name~=")) {
    let pattern: RegExp;
    try {
      pattern = new RegExp(locator.slice(6));
    } catch (error) {
      throw new Refused("invalid_argument", `\`${locator}\` is no regular expression: ${error instanceof Error ? error.message : String(error)}`);
    }
    return items.filter((row) => pattern.test(heard(row.object).name));
  }
  if (locator.startsWith("role=")) {
    const parts = /^role=([a-z]+)(?:\[name=(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\])?$/.exec(locator);
    if (!parts) throw new Refused("invalid_argument", `\`${locator}\` is to be \`role=button\` or \`role=button[name="Words"]\``);
    const role = parts[1]!;
    const name = parts[2] ?? parts[3];
    return items.filter((row) => {
      const said = heard(row.object);
      return said.role === role && (name === undefined || said.name.trim() === name.replace(/\\(.)/g, "$1"));
    });
  }
  if (locator.startsWith("at=")) {
    const [x, y] = locator.slice(3).split(",").map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Refused("invalid_argument", "`at=X,Y` is a point of the root, in logical pixels");
    // What is drawn on top there, and what holds it.
    const root = rootItem(state) as QObject & { width?: number };
    const item = root.$node as Element | undefined;
    if (!item || typeof document === "undefined") return [];
    const box = item.getBoundingClientRect();
    const scale = root.width ? box.width / root.width : 1;
    let element: Element | null = document.elementFromPoint(box.left + x! * scale, box.top + y! * scale);
    const byNode = new Map(items.map((row) => [row.object.$node as unknown, row]));
    while (element && element !== item.parentElement) {
      const row = byNode.get(element);
      if (row) return [row];
      element = element.parentElement;
    }
    return [];
  }
  throw new Refused("invalid_argument", `\`${locator}\` is no locator this page reads: give ${LOCATORS}`);
}

function found(state: State, args: Args): Result {
  if (typeof args.locator !== "string" || args.locator === "") throw new Refused("invalid_argument", `\`locator\` is to be ${LOCATORS}`);
  const max = Math.max(1, number(args.max, 50));
  const { rows } = tree(state);
  // Each row's path, its types from the root down, for telling apart what
  // has the same name.
  const paths = new Map<Row, string>();
  const above: string[] = [];
  for (const row of rows) {
    above.length = row.depth;
    above.push(row.id ? `${row.type}#${row.id}` : row.type);
    paths.set(row, above.join("/"));
  }
  const all = located(state, rows, args.locator);
  const matches = all.slice(0, max).map((row) => {
    const said = heard(row.object);
    const match: Record<string, unknown> = { ref: handed(state, row.object), role: said.role, name: said.name, path: paths.get(row) };
    if (row.object_name) match.obj = row.object_name;
    if (row.id) match.id = row.id;
    const box = bounds(state, row.object);
    if (box) match.bounds = box.map(placed);
    match.states = row.item ? [shown(row.object) ? "visible" : "hidden"] : [];
    return match;
  });
  const truncated = all.length > max;
  return answered({ matches, count: matches.length, total: all.length, truncated }, `(${matches.length} match${matches.length === 1 ? "" : "es"}${truncated ? `, of ${all.length}` : ""})`);
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
      const locator = row.id ? `id=${row.id}` : handed(state, row.object);
      rows.push(
        made === "timer"
          ? { kind: "timer", name: named, handle: handed(state, row.object), locator, state: timed.running ? "waiting" : "frozen", interval_ms: timed.interval ?? null, repeat: timed.repeat === true, due_in_us: null, wakeups: null }
          : { kind: "animation", name: named, handle: handed(state, row.object), locator, state: timed.running ? "running" : "stopped" },
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
        // The root's own showing; a root that has none is shown.
        visible: native(state.root, "visible") !== false && native(item, "visible") !== false,
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

interface Held {
  complete: boolean;
  served: Served | null;
  // What it was served with: another log or title is another application.
  logs: LogSource | null;
  title: string;
}

const serving = new WeakMap<Serving, Held>();

// `Inspector { target: item }`: serves `target` while it is set, under the
// token `tokenFile` says, which an `InspectorClient` is given. A new target
// is a reload of the one served; the Inspector gone, nothing is. `logs`
// and `title` are as `serve` takes them, read as the target is first
// served; given another, the target is served anew, under a new token: a
// holder that moves the Observer from one application to another gives it
// the other's root, log and title, and what the Observer shows is then all
// the other's. Called once it is complete, and as each of them changes.
export function follow(inspector: Serving, completed = false): void {
  untrack(() => {
    let held = serving.get(inspector);
    if (!held) serving.set(inspector, (held = { complete: false, served: null, logs: null, title: "" }));
    if (completed) held.complete = true;
    // A target set before the object is complete is served as it completes.
    if (!held.complete) return;
    const next = inspector.target;
    const logs = inspector.logs ?? null;
    const title = inspector.title;
    if (held.served && (!next || held.logs !== logs || held.title !== title)) {
      held.served.close();
      held.served = null;
    }
    if (next && held.served) held.served.reload(next);
    else if (next) {
      held.served = serve(next, { ...(logs ? { logs } : {}), title });
      held.logs = logs;
      held.title = title;
    }
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
  // The token as the call is made, and the root it serves then: the
  // application it is asked of. A reload under the same token is another
  // root, which the call is not for.
  const token = untrack(() => String(client.tokenFile));
  const asked: Asked = { token, reloads: served.get(token)?.counts.reloads ?? null };
  void ask(client, name, argumentsText, asked).then(
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
        asked,
      ),
    (error: unknown) => finish(client, serial, name, { ok: false, text: error instanceof Error ? error.message : String(error) }, !(error instanceof Unreached), asked),
  );
  return serial;
}

// Where a rule's guide (`docs/design/<page>#<code>`, as the audit gives it)
// can be read, as natively.
export function guideUrl(guide: unknown): string {
  return `https://github.com/olafura/ljos-ui/blob/main/${String(guide)}`;
}

// What a call was asked of: the token, and how many times what it serves
// had been reloaded (null with nothing served yet). A call made with no
// token is asked of the one there is as it runs, which `ask` then writes.
interface Asked {
  token: string;
  reloads: number | null;
}

async function ask(client: Client, tool: string, argumentsText: unknown, asked: Asked): Promise<Result> {
  // Never inside the call: QML connects to `answered` once it has the serial.
  await Promise.resolve();
  // A call made with no token yet is asked of the one there is now, as a
  // native client reads its token file when it connects: an Observer made
  // in the same pass as the inspector it is given asks before that
  // inspector is served. One made with a token is never asked of another:
  // an edit meant for one application would change the next one's.
  const token = untrack(() => String(client.tokenFile));
  if (asked.token !== "" && token !== asked.token) throw new Error(`the client was given another token (\`${token || "none"}\`) before \`${asked.token}\` answered: ask again`);
  asked.token = token;
  const state = served.get(token);
  if (!state) throw new Unreached(token ? `nothing on this page is served as \`${token}\`` : "no inspector is given: `tokenFile` is empty");
  if (asked.reloads !== null && state.counts.reloads !== asked.reloads) {
    throw new Error(`the application served as \`${token}\` was reloaded before the call was answered: ask again`);
  }
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

function finish(client: Client, serial: number, tool: string, result: { ok: boolean; text: string }, reached: boolean, asked: Asked): void {
  if (client.$destroyed || client.$gone) return;
  const last = client.last;
  // Whether the client is connected is said by what it asks now: a call
  // asked of the token it had before (a watch answered late) says nothing
  // of the one it has.
  if (untrack(() => String(client.tokenFile)) === asked.token) {
    if (last.connected !== reached) last.connected = reached;
    const why = reached ? "" : result.text;
    if (last.error !== why) last.error = why;
  }
  last.pending = Math.max(0, last.pending - 1);
  client.answered(serial, tool, result.ok, result.text);
}
