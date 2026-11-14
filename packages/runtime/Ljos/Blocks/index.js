// `import Ljos.Blocks`: a shell that composes an application's blocks, the
// places in it others add to, and a loader that shows a user's own shell or
// the application's when the user's does not work. Ljós's own module
// (ljos-ui docs/adr/0003-blocks-and-shells.md, section 4), as ljos_quick
// builds it natively.
//
// A Slot makes one item of each contribution's delegate, beside itself in
// its parent as a Repeater does, so a Row or a layout around it lays them
// out. Contributions find their Slots by name through a registry of the
// page's, so anything in the application (a page, a plugin a Loader brings
// in, the site around a user's shell) adds to a place it does not hold.
import { guardedFetch, own, sayNotThere, whyNot } from "../../guard.js";
import { getOwner, onCleanup, runWithOwner } from "solid-js";
import { bounded, defineType, derived, effect, instantiate, QtObject, slot, whenMade } from "../../object.js";
import { Item } from "../../QtQuick/Item.js";
import { fit, given, implicit } from "../../QtQuick/Loader.js";
import { settle } from "../../QtQuick/settle.js";
import { signal, untrack } from "#kernel";

const Append = 0;
const Replace = 1;
const Prepend = 2;

const next = (version) => version + 1;
const write = (self, name, value) => slot(self, name).write(value);
const hide = (self, name, value) => Object.defineProperty(self, name, { value, writable: true, configurable: true });

// The contributions to each name, and a version a Slot of the name follows.
const places = new Map();
function place(name) {
  let at = places.get(name);
  if (!at) places.set(name, (at = { all: new Set(), version: signal(0, null) }));
  return at;
}

// The order contributions were made in: the second key after `order`.
let made = 0;

export const Contribution = defineType("Contribution", QtObject, {
  properties: { slot: "", mode: Append, delegate: undefined, order: 0 },
  enums: { Append, Replace, Prepend },
  setup(self) {
    hide(self, "$made", made++);
    // Whether a fault in what was made of it took it away: then it goes
    // from every Slot, as natively a plugin's boundary takes its content.
    hide(self, "$out", signal(false, self.$owner));
    let joined = null;
    const leave = () => {
      if (!joined) return;
      joined.all.delete(self);
      joined.version[1](next);
      joined = null;
    };
    effect(
      () => self.slot,
      (name) =>
        untrack(() => {
          leave();
          if (typeof name !== "string" || name === "") return;
          joined = place(name);
          joined.all.add(self);
          joined.version[1](next);
        }),
    );
    if (self.$owner) runWithOwner(self.$owner, () => onCleanup(leave));
  },
});

// What a fault in an item made of `contribution` does: it is warned of and
// the contribution is taken away; the page goes on.
function withdraw(contribution, error) {
  if (untrack(() => contribution.$out[0]())) return;
  console.warn(`Contribution: ${error?.stack?.split("\n")[0] ?? error}`);
  queueMicrotask(() => {
    contribution.$out[1](true);
    settle();
  });
}

// A list property's objects, as an array.
const listed = (value) => (value == null ? [] : Array.isArray(value) ? value : typeof value === "object" && "length" in value ? Array.from(value) : [value]);

const before = (a, b) => a.order - b.order || a.$made - b.$made;
const OWN = { own: true };

// What a Slot shows, in order: the prepended contributions, its own
// delegate, the rest; a replacing one takes the place of all before it.
function shown(self) {
  const at = typeof self.name === "string" && self.name !== "" ? place(self.name) : null;
  at?.version[0]();
  const all = new Set([...(at?.all ?? []), ...listed(self.contributions)]);
  const live = [...all].filter((contribution) => contribution?.$out && !contribution.$out[0]() && contribution.delegate);
  const prepended = live.filter((contribution) => contribution.mode === Prepend).sort(before);
  const rest = live.filter((contribution) => contribution.mode !== Prepend).sort(before);
  const own = self.delegate ? [OWN] : [];
  const sequence = [...prepended, ...own, ...rest];
  let from = 0;
  sequence.forEach((entry, index) => {
    if (entry !== OWN && entry.mode === Replace) from = index;
  });
  return sequence.slice(from).map((entry) => (entry === OWN ? { key: OWN, delegate: self.delegate } : { key: entry, delegate: entry.delegate }));
}

export const Slot = defineType("Slot", Item, {
  properties: { name: "", contributions: [], delegate: undefined, count: 0 },
  methods: {
    // What `Item` puts in the parent's children before the Slot.
    $siblings() {
      const state = this.$place;
      state.version();
      return state.items.filter((item) => item?.$node);
    },
  },
  setup(self) {
    const [version, bump] = signal(0, self.$owner);
    // What is made, by what it was made of: kept while that is still shown.
    const state = (self.$place = { version, items: [], made: new Map() });
    const unmake = (entry) => {
      state.made.delete(entry.key);
      entry.dispose();
    };
    if (self.$owner) runWithOwner(self.$owner, () => onCleanup(() => [...state.made.values()].forEach(unmake)));
    effect(
      () => shown(self),
      (sequence) =>
        untrack(() => {
          const wanted = new Set(sequence.map(({ key }) => key));
          for (const entry of [...state.made.values()]) {
            if (!wanted.has(entry.key) || sequence.find(({ key }) => key === entry.key).delegate !== entry.delegate) unmake(entry);
          }
          const items = [];
          for (const { key, delegate } of sequence) {
            let entry = state.made.get(key);
            if (!entry) {
              const make = () => instantiate(delegate, {}, self.$parent, self.$owner);
              try {
                const { object, dispose } = key === OWN ? make() : bounded((error) => withdraw(key, error), make);
                state.made.set(key, (entry = { key, delegate, object, dispose }));
              } catch (error) {
                // The Slot's own delegate is the application's, as natively.
                if (key === OWN) throw error;
                withdraw(key, error);
                continue;
              }
            }
            items.push(entry.object);
          }
          state.items = items;
          write(self, "count", state.items.length);
          bump(next);
        }),
    );
  },
});

const Null = 0;
const Ready = 1;
const Fallback = 2;
const Failed = 3;

// What a shell is called where a fault in it is said: its file.
function fileOf(component) {
  const File = component?.$file ?? component;
  return typeof File?.name === "string" && File.name !== "" ? `${File.name}.qml` : "<shell>";
}

// `Shell.qml:2: Error: …`: where the object whose work threw is written,
// when the compiler said (`$at`), else the shell's file.
function describe(error, object, file) {
  const at = object?.$props?.$at;
  const where = Array.isArray(at) ? `${at[0]}:${at[1]}` : file;
  return `${where}: ${error?.stack?.split("\n")[0] ?? error}`;
}

// A shell that is not part of the build: its text fetched and compiled in
// the page (`ljos-web/compiler`), against the page's own modules. It is a
// project of one file, named as the URL names it, at the URL's directory.
// A file of a project that is only what it was given (a live code block's
// example) is one of that project's, made as its files were, or not there.
async function compiled(url) {
  const address = new URL(url, document.baseURI);
  const ours = own(address);
  if (ours) {
    // Said as natively. The project is told when this is used (`used`),
    // not when it is asked for: a fallback that only stood in while the
    // source came says nothing.
    if (ours.text === undefined) return { error: whyNot(address), absent: address.href };
    return finished(ours.name, () => ours.project.compile(ours.name));
  }
  const file = decodeURIComponent(address.pathname.split("/").pop() || "Shell.qml");
  let text;
  try {
    const response = await guardedFetch(address);
    if (!response.ok) return { error: `${file}: cannot load ${address.href}: ${response.status}` };
    text = await response.text();
  } catch (error) {
    return { error: `${file}: cannot load ${address.href}: ${error.message}` };
  }
  return finished(file, async () => {
    const { createCompiler } = await import("../../compiler/index.js");
    return createCompiler({ base: new URL(".", address).href }).compile({ files: { [file]: text }, entry: file, inspect: true });
  });
}

// What a source or fallback resolved to, now that the loader uses it: a
// file of an example that is not there is told to the example then.
function used(resolved) {
  if (resolved?.absent) sayNotThere(resolved.absent);
}

// What `compile()` made of `file`, or why it made nothing.
async function finished(file, compile) {
  let made;
  try {
    made = await compile();
  } catch (error) {
    return { error: `${file}: cannot compile: ${error?.message ?? error}` };
  }
  if (made.diagnostics) {
    const said = made.diagnostics.map(({ file: where = file, line, column, message }) =>
      line ? `${where}:${line}:${column ?? 1}: ${message}` : `${where}: ${message}`,
    );
    return { error: said.join("\n") };
  }
  return { component: made.component, file };
}

// What `source` or `fallback` is: a component the compiler made of a file
// of the build, a module of one still to come, or the URL of one that is
// not part of the build. Null for none.
async function resolve(value) {
  if (value == null || value === "") return null;
  if (typeof value === "function" && value.$component === true) return { component: value, file: fileOf(value) };
  if (typeof value === "function") {
    const name = value.name || "<shell>";
    let component;
    try {
      component = (await value())?.default;
    } catch (error) {
      return { error: `${name}: cannot load: ${error?.message ?? error}` };
    }
    return component ? { component, file: fileOf(component) } : { error: `${name}: its module has no component` };
  }
  return compiled(String(value));
}

export const ShellLoader = defineType("ShellLoader", Item, {
  properties: {
    source: undefined,
    fallback: undefined,
    error: "",
    item: null,
    status: Null,
    implicitWidth: derived((self) => implicit(self, "width", "implicitWidth")),
    implicitHeight: derived((self) => implicit(self, "height", "implicitHeight")),
  },
  enums: { Null, Ready, Fallback, Error: Failed },
  methods: {
    // The source again, as a save under `--watch` makes it again natively
    // (A13): a user's shell shown takes the new one and keeps the state of
    // what is in both; one that fails keeps the shell that runs. Answers
    // why it failed, or "".
    reload() {
      return reloaded(this);
    },
  },
  setup(self) {
    // What a reload carries state across: the objects the shell made in
    // what, recorded under the loader.
    if (!self.$born) hide(self, "$born", []);
    // `puts` counts the shells put in place, so a fallback that was asked
    // for before another shell came knows it came too late; `arrived` is
    // the turn whose source has come, which no stand-in follows.
    const state = (self.$shell = { turn: 0, puts: 0, arrived: 0, shown: null, owner: getOwner() });
    whenMade(() => untrack(() => load(self, state)));
    let first = true;
    effect(
      () => [self.source, self.fallback],
      () => {
        if (first) return void (first = false);
        untrack(() => load(self, state));
      },
    );
    effect(
      () => [self.item, ...given(self)],
      ([item, width, height]) => fit(item, width, height),
    );
  },
});

// Makes the shell of `resolved` in the loader, or says why it could not:
// what threw while it was made. A fault in the source's shell afterwards
// gives way to the fallback; one in the fallback is the page's, as natively.
function make(self, state, resolved, fallback) {
  const shown = { fallback, object: null, dispose: null, Component: resolved.component };
  let failed = null;
  let making = true;
  const boundary = (error, object) => {
    if (making) return void (failed ??= describe(error, object, resolved.file));
    if (state.shown !== shown) return;
    const why = describe(error, object, resolved.file);
    console.warn(`ShellLoader: ${why}`);
    drop(self, state);
    showFallback(self, state, why, state.turn);
  };
  try {
    const run = () => instantiate(resolved.component, {}, self, self.$owner);
    const made = fallback ? run() : bounded(boundary, run);
    shown.object = made.object;
    shown.dispose = made.dispose;
  } catch (error) {
    failed ??= describe(error, null, resolved.file);
  }
  making = false;
  if (failed) {
    discard(shown);
    return { error: failed };
  }
  return { shown };
}

function put(self, state, shown) {
  state.puts++;
  state.shown = shown;
  const item = shown.object;
  fit(item, ...given(self));
  if (item?.$node) self.$add(item);
  write(self, "item", item ?? null);
}

// Takes away the shell shown.
function drop(self, state) {
  const shown = state.shown;
  state.shown = null;
  write(self, "item", null);
  if (shown?.object?.$node) self.$remove(shown.object);
  discard(shown);
}

// Ends a shell after what is running now: a handler of its own may be it.
function discard(shown) {
  if (!shown?.dispose) return;
  const { dispose } = shown;
  shown.dispose = null;
  queueMicrotask(() => {
    dispose();
    settle();
  });
}

// A source that is not had at once: a module still to come, or a file
// to fetch and compile in the page.
const arrives = (source) => source != null && source !== "" && !(typeof source === "function" && source.$component === true);

async function load(self, state) {
  const turn = ++state.turn;
  const source = untrack(() => self.source);
  // The stage is not empty while a source is on its way (a compile in
  // the page, a fetch): what is shown stands, and where nothing is yet,
  // the fallback stands in. Not on the screen, and not in a page
  // prerendered meanwhile, which would be written with nothing there.
  // Standing in is not falling back: the status stays Null, the loader
  // not done, until the source has come or failed. The source is not
  // kept waiting for it: a fallback slower to come than the source is
  // never shown.
  if (!state.shown && arrives(source) && untrack(() => self.fallback) != null) void showFallback(self, state, "", turn, true);
  const resolved = await resolve(source);
  if (turn !== state.turn) return;
  used(resolved);
  state.arrived = turn;
  let why = "";
  if (resolved?.component) {
    const stood = state.shown;
    const made = runWithOwner(state.owner, () => make(self, state, resolved, false));
    if (made.shown) {
      // The reader may have used the shell that stood in (it is the
      // application's own, and runs): the source takes over as a
      // reload does, with the state of what is in both.
      if (stood?.standsIn && stood.object && made.shown.object) {
        try {
          const { carry } = await import("../../reload.js");
          if (turn !== state.turn) return void discard(made.shown);
          carry(stood.object, stood.Component, made.shown.object, made.shown.Component, { across: true });
        } catch (error) {
          console.warn(`ShellLoader: what stood in is not carried: ${describe(error, null, resolved.file)}`);
        }
      }
      drop(self, state);
      put(self, state, made.shown);
      write(self, "status", Ready);
      write(self, "error", "");
      settle();
      return;
    }
    why = made.error;
  } else if (resolved) why = resolved.error;
  if (why) console.warn(`ShellLoader: ${why}`);
  // The fallback that stood while the source came stays, with what it
  // keeps, and says why the source did not take its place.
  const standing = state.shown;
  if (standing?.fallback && standing.from === untrack(() => self.fallback)) {
    write(self, "error", why);
    write(self, "status", Fallback);
    settle();
    return;
  }
  drop(self, state);
  await showFallback(self, state, why, turn);
}

// Shows the fallback in place of the source's shell, which did not work
// for `why` (empty when there is no source). One that only `standsIn`
// for a source on its way says nothing, done or not: the source will.
async function showFallback(self, state, why, turn, standsIn = false) {
  const fallback = untrack(() => self.fallback);
  // One fallback had per turn: what stood in and what falls back are
  // the same file, fetched and compiled once.
  if (state.falling?.turn !== turn || state.falling.fallback !== fallback)
    state.falling = { turn, fallback, resolving: resolve(fallback) };
  const puts = state.puts;
  const resolved = await state.falling.resolving;
  // A later turn, or a shell put meanwhile (the source that came while
  // what it replaced failed), has the stage: this fallback is too late.
  if (turn !== state.turn || puts !== state.puts) return;
  if (standsIn) {
    if (state.arrived === turn) return;
    const made = resolved?.component ? runWithOwner(state.owner, () => make(self, state, resolved, true)) : null;
    if (made?.shown) {
      made.shown.from = fallback;
      made.shown.standsIn = true;
      put(self, state, made.shown);
      settle();
    }
    return;
  }
  used(resolved);
  if (!resolved) {
    write(self, "error", why);
    write(self, "status", why ? Failed : Null);
    settle();
    return;
  }
  const made = resolved.component ? runWithOwner(state.owner, () => make(self, state, resolved, true)) : resolved;
  if (made.shown) {
    made.shown.from = fallback;
    put(self, state, made.shown);
    write(self, "error", why);
    write(self, "status", Fallback);
  } else {
    console.warn(`ShellLoader: fallback: ${made.error}`);
    write(self, "error", why ? `${why}\nfallback: ${made.error}` : `fallback: ${made.error}`);
    write(self, "status", Failed);
  }
  settle();
}

async function reloaded(self) {
  const state = self.$shell;
  const turn = ++state.turn;
  const resolved = await resolve(untrack(() => self.source));
  if (turn !== state.turn) return "";
  used(resolved);
  const old = state.shown;
  const why = resolved && !resolved.component ? resolved.error : "";
  if (why || !resolved) {
    if (why) console.warn(`ShellLoader: reload: ${why}`);
    // A user's shell shown stays; a fallback stays too, and says the new why.
    if (old && !old.fallback) return why;
    // Nothing shown yet: the first load had this source's turn, and now
    // nothing else will show the fallback.
    if (!old) {
      await showFallback(self, state, why, turn);
      return why;
    }
    if (why) write(self, "error", why);
    // What stood in for the first load, which this turn took over,
    // now stands as the fallback: the loader is done.
    if (why && old.standsIn) write(self, "status", Fallback);
    settle();
    return why;
  }
  const made = runWithOwner(state.owner, () => make(self, state, resolved, false));
  if (made.error) {
    console.warn(`ShellLoader: reload: ${made.error}`);
    if (old?.fallback) write(self, "error", made.error);
    if (old?.standsIn) write(self, "status", Fallback);
    if (!old) await showFallback(self, state, made.error, turn);
    return made.error;
  }
  // What stood in while the first source came (or stayed when it
  // failed) is the reader's too: a reload from it carries across, as
  // the source's arrival would have.
  if (old && (!old.fallback || old.standsIn) && old.object && made.shown.object) {
    try {
      const { carry } = await import("../../reload.js");
      if (turn !== state.turn) {
        // A later turn is at work: what this one made is never put.
        discard(made.shown);
        return "";
      }
      carry(old.object, old.Component, made.shown.object, made.shown.Component, { across: !!old.standsIn });
    } catch (error) {
      // The old shell was only read from: it stays, and the new one goes.
      discard(made.shown);
      const why = describe(error, null, resolved.file);
      console.warn(`ShellLoader: reload: ${why}`);
      // What stood in for the first load, which this turn took over,
      // now stands as the fallback: the loader is done.
      if (old.standsIn) {
        write(self, "error", why);
        write(self, "status", Fallback);
        settle();
      }
      return why;
    }
  }
  drop(self, state);
  put(self, state, made.shown);
  write(self, "status", Ready);
  write(self, "error", "");
  settle();
  return "";
}
