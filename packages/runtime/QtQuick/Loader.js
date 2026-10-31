// Loader: an item made from a component when it is asked for, and unmade
// when it is not.
//
// What the compiler makes of `source` is a component, when it names a QML
// file it compiled: that is loaded there and then, as Qt loads a local
// file. A function that is not one imports the component's module, which
// comes later. Anything else is the URL it was given, for which there is
// nothing to load: QML is not interpreted here.
import { createEffect, runWithOwner } from "solid-js";
import { defineType, derived, effect, instantiate, last, slot, whenComplete, whenMade } from "../object.js";
import { Item } from "./Item.js";
import { settle } from "./settle.js";
import { signal, untrack } from "#kernel";

const Null = 0;
const Ready = 1;
const Loading = 2;
const Failed = 3;

const NOTHING = Object.freeze({});
const next = (version) => version + 1;

// Whether the Loader was given a size along `key`: then the item takes the
// Loader's, else the Loader takes the item's.
function sized(self, key) {
  const size = slot(self, key);
  if (size.explicit() || size.placed !== undefined) return true;
  const anchors = self.anchors;
  if (anchors.fill) return true;
  return key === "width" ? Boolean(anchors.left && anchors.right) : Boolean(anchors.top && anchors.bottom);
}

function implicit(self, key, implicitKey) {
  const item = self.item;
  if (!item?.$node) return 0;
  return sized(self, key) ? item[implicitKey] : item[key];
}

// The size the Loader gives its item: none along a way it has none itself.
function given(self) {
  return [sized(self, "width") ? self.width : undefined, sized(self, "height") ? self.height : undefined];
}

function fit(item, width, height) {
  if (!item?.$node) return;
  slot(item, "width").place(width);
  slot(item, "height").place(height);
}

function write(self, name, value) {
  return slot(self, name).write(value);
}

function unload(self, state) {
  if (!state.dispose) return;
  const item = untrack(() => self.item);
  if (item?.$node) self.$remove(item);
  state.dispose();
  state.dispose = null;
  write(self, "item", null);
}

// The component's object, as the Loader's item.
function make(self, state, component, properties) {
  if (typeof component !== "function") return fail(self, "what was loaded is not a component");
  const made = instantiate(component, properties ?? NOTHING, self, self.$owner);
  const item = made.object;
  state.dispose = made.dispose;
  // What `setSource` gave the item to start with.
  for (const name of Object.keys(properties ?? NOTHING)) {
    const own = item?.$slots && slot(item, name);
    if (own) own.write(properties[name]);
    else if (item && name in item) item[name] = properties[name];
  }
  // It is the size it is given before anything hears of it, as in Qt: what
  // is bound to `item.width` never finds the size the item would rather be.
  fit(item, ...given(self));
  if (item?.$node) self.$add(item);
  write(self, "item", item);
  write(self, "status", Ready);
  write(self, "progress", 1);
  state.done(next);
}

function fail(self, why) {
  console.warn(`Loader: ${why}`);
  write(self, "status", Failed);
  write(self, "progress", 1);
}

function load(self, state) {
  const { active, source } = state;
  // A source that is a component is one like `sourceComponent`.
  const component = state.component ?? (source?.$component === true ? source : undefined);
  const turn = ++state.turn;
  const properties = state.properties;
  state.properties = undefined;
  unload(self, state);
  if (!active || (component == null && (source == null || source === ""))) {
    write(self, "status", Null);
    write(self, "progress", 0);
    return;
  }
  // Later: when the module has come, or (`asynchronous`) once whoever asked
  // has gone on. By then another may have been asked for.
  const later = (pending, pick) =>
    pending.then(
      (value) => {
        if (state.turn !== turn) return;
        runWithOwner(self.$owner, () => untrack(() => make(self, state, pick(value), properties)));
        settle();
      },
      (error) => {
        if (state.turn !== turn) return;
        fail(self, `cannot load ${error?.message ?? error}`);
        settle();
      },
    );
  if (typeof component === "function") {
    if (self.asynchronous) {
      write(self, "status", Loading);
      return void later(Promise.resolve(), () => component);
    }
    return make(self, state, component, properties);
  }
  if (typeof source === "function") {
    write(self, "status", Loading);
    write(self, "progress", 0);
    return void later(Promise.resolve().then(source), (module) => module?.default);
  }
  fail(self, `cannot load ${source}: only a QML file the compiler saw can be loaded`);
}

export const Loader = defineType("Loader", Item, {
  properties: {
    active: true,
    asynchronous: false,
    source: undefined,
    sourceComponent: undefined,
    item: null,
    status: Null,
    progress: 0,
    implicitWidth: derived((self) => implicit(self, "width", "implicitWidth")),
    implicitHeight: derived((self) => implicit(self, "height", "implicitHeight")),
  },
  signals: ["loaded"],
  enums: { Null, Ready, Loading, Error: Failed },
  methods: {
    // Another source, and what its item's properties are to begin with.
    setSource(source, properties) {
      const state = this.$loader;
      state.properties = properties;
      slot(this, "source").write(source);
      // The same source is loaded again, as Qt does.
      state.again(next);
      settle();
    },
  },
  setup(self) {
    const [asked, again] = signal(0, self.$owner);
    const [made, done] = signal(0, self.$owner);
    const state = (self.$loader = {
      turn: 0,
      dispose: null,
      properties: undefined,
      again,
      done,
      // What was last asked for, and whether it has yet to be loaded.
      active: undefined,
      component: undefined,
      source: undefined,
      asked: 0,
      stale: false,
    });
    // What it is to load as it is made is there before a layout it is in
    // looks at it. Qt loads as it completes the Loader, and completes that
    // before the layout, which arranges only then: `Layout.preferredWidth:
    // item ? item.width : 64` is never 64 to it, and the item is not made 64.
    whenMade(() =>
      untrack(() => {
        state.active = self.active;
        state.component = self.sourceComponent;
        state.source = self.source;
        load(self, state);
      }),
    );
    // Adding the item to the Loader is a change of the Loader, and what
    // reads the Loader runs again: it loads only when what it is to load is
    // something else.
    effect(
      () => {
        const active = self.active;
        const component = self.sourceComponent;
        const source = self.source;
        const turn = asked();
        if (active === state.active && component === state.component && source === state.source && turn === state.asked) {
          return;
        }
        state.active = active;
        state.component = component;
        state.source = source;
        state.asked = turn;
        state.stale = true;
      },
      () => {
        if (!state.stale) return;
        state.stale = false;
        untrack(() => load(self, state));
      },
    );
    effect(
      () => [self.item, ...given(self)],
      ([item, width, height]) => fit(item, width, height),
    );
    // What was loaded as the Loader was made was there before anything
    // listened for a change: its own handlers are told of it here, in the
    // order Qt tells them.
    whenComplete(() =>
      untrack(() => {
        const props = self.$props;
        if (self.item) props.onItemChanged?.();
        if (self.status !== Null) props.onStatusChanged?.();
        if (self.progress) props.onProgressChanged?.();
        if (state.dispose) self.loaded();
      }),
    );
    // After that `loaded` comes with the handlers of what changed, once
    // those of `item` and `status` have run.
    whenComplete(() => createEffect(made, () => last(() => self.loaded()), { defer: true }));
  },
});
