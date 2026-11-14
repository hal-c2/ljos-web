// `Controller` (Ljos.Core): behaviour an item is given by declaring it
// inside, as ljos-ui's `features/components/controller.feature` and
// docs/DIALECT.md §4.20 have it.
//
// The item it is declared in is its `host`. It is `attached(host)` once the
// host is complete (or at once, put into one that is), `detached()` once, as
// it or its host goes, and, if it handles it, `updated()` once after it is
// attached and once after each turn that changed a property of the host. A
// Controller written as a module (`controller({ … })`) is the same object
// with its lifecycle given as functions.
import { onCleanup, runWithOwner } from "solid-js";
import { contents, defineType, derived, effect, flushing, heard, QtObject, whenToldComplete } from "../../object.js";
import { untrack } from "#kernel";

const hidden = (object, key, value) => Object.defineProperty(object, key, { value, writable: true, configurable: true });

// A Controller inside a Controller shares its host. One declared directly in
// a window acts on the window, and a gesture, which needs an element to
// listen on, on its content item. One held by something that is no item
// (an `Object`) has no host.
function hostOf(self) {
  const parent = self.$parent;
  if (!parent) return null;
  if (parent instanceof Controller) return parent.host;
  if (parent.$window && !self.$gesture) return parent.$window;
  return parent.$node || parent.$contentItem ? parent : null;
}

// What the type of the Controller and those it extends were given to do
// for each step: a module's `attached`, `detached` and `updated`.
function* steps(self, step) {
  for (const type of self.$type.chain) {
    const run = type.spec.lifecycle?.[step];
    if (run) yield run;
  }
}

function handlesUpdated(self) {
  if ("onUpdated" in self.$props || self.$replaced?.onUpdated || self.$connected?.size) return true;
  return !steps(self, "updated").next().done;
}

function attach(self) {
  if (self.$life || self.$ended) return;
  const host = untrack(() => self.host);
  if (!host) return;
  const life = { host, cleanups: [], armed: false, gone: false, following: false };
  hidden(self, "$life", life);
  // A module's step throws as a handler does: reported, and nothing else
  // made with it stops.
  for (const run of steps(self, "attached")) {
    const back = heard(run, [host, self], self);
    if (typeof back === "function") life.cleanups.push(back);
  }
  self.attached(host);
  if (!handlesUpdated(self)) return;
  follow(self, life);
  // The first update is at the end of the turn it was attached in, so
  // what the load still writes to the host (its parent, as it is put in
  // the page) is in it, not a second one.
  arm(self, life);
}

// A Controller that handles `updated` follows its host from then on. One
// whose `updated` is connected to only later starts as it is, and is next
// updated by the next change.
function follow(self, life) {
  if (life.following || life.gone) return;
  life.following = true;
  listen(life.host, self, life);
}

// The host tells the Controllers that listen when one of its properties is
// written or a binding gives it something new (`$written`, called by the
// slot and the binding). Only those that handle
// `updated` listen, so a host with none pays nothing more than the call.
function listen(host, self, life) {
  let listening = host.$listening;
  if (!listening) {
    listening = new Map();
    hidden(host, "$listening", listening);
    hidden(host, "$written", () => {
      for (const [controller, each] of listening) arm(controller, each);
    });
  }
  listening.set(self, life);
  // What the host's type works out as it is read (an item's anchored
  // geometry, its visibility through its parent) is never written, and
  // what its file declares is written and bound outside the slots: both
  // are followed instead, for as long as the Controller is.
  const resolved = [...new Set([...host.$type.chain.flatMap((type) => Object.keys(type.spec.resolve ?? {})), ...(host.$declares ?? [])])];
  if (!resolved.length) return;
  let seen = null;
  runWithOwner(self.$owner ?? null, () =>
    effect(
      () => resolved.map((key) => host[key]),
      (values) => {
        if (seen && values.some((value, at) => !Object.is(value, seen[at]))) arm(self, life);
        seen = values;
      },
    ),
  );
}

// Once a turn, at its end: each assignment settles as it returns, so the
// end of the turn is where all of what it wrote is known. The browser's
// frame is never asked for it.
function arm(self, life) {
  if (life.armed || life.gone || life.host.$telling) return;
  // What connected to `updated` may have disconnected since: then nobody
  // would hear it.
  if (!handlesUpdated(self)) return;
  life.armed = true;
  queueMicrotask(() => {
    life.armed = false;
    if (!life.gone) update(self, life);
  });
}

// What `updated` writes to the host arms none of its Controllers, as
// ljos_quick tells a host's Controllers: it cannot keep the page awake, and
// two Controllers of one host cannot keep arming each other. A handler told
// while a flush is on runs after this returns, so the host stays quiet
// until it has. A count, so that one Controller's quiet ending late does
// not end another's.
function update(self, life) {
  const host = life.host;
  if (!Object.hasOwn(host, "$telling")) hidden(host, "$telling", 0);
  host.$telling++;
  try {
    for (const run of steps(self, "updated")) heard(run, [host, self], self);
    self.updated();
  } finally {
    if (flushing()) queueMicrotask(() => host.$telling--);
    else host.$telling--;
  }
}

// Detached once, whichever comes first: the Controller destroyed, or what
// owns it (its host's owner, a Loader's item, a view's delegate) ending.
function end(self) {
  if (self.$ended) return;
  hidden(self, "$ended", true);
  for (const type of self.$type.chain) type.spec.ended?.(self);
  const life = self.$life;
  if (!life) return;
  life.gone = true;
  life.host.$listening?.delete(self);
  for (const cleanup of life.cleanups) heard(cleanup, [], self);
  for (const run of steps(self, "detached")) heard(run, [life.host, self], self);
  self.detached();
}

// What makes an object a Controller's life: attached once its host is
// complete, detached as it goes. A gesture of `Ljos.Ui` lives so; it keeps
// the type of the handler it faces, which listens on its host's element.
export function live(self) {
  // `updated.connect` (and a `Connections` on it) counts as handling it,
  // before the Controller is attached or after.
  const updated = self.updated;
  const { connect, disconnect } = updated;
  const connected = new Set();
  hidden(self, "$connected", connected);
  updated.connect = (listener) => {
    connect(listener);
    connected.add(listener);
    if (self.$life) follow(self, self.$life);
  };
  updated.disconnect = (listener) => {
    disconnect(listener);
    connected.delete(listener);
  };
  whenToldComplete(() => attach(self));
  onCleanup(() => end(self));
}

// Destroyed, a Controller or a gesture is detached as the delay runs out:
// one that was declared has no disposal of its own to do it.
export function destroying(Base) {
  return function destroy(delay = 0) {
    if (this.$destroyed) return;
    Base.proto.destroy.call(this, delay);
    setTimeout(() => end(this), delay);
  };
}

export { hostOf };

export const Controller = defineType("Controller", QtObject, {
  properties: {
    host: derived((self) => hostOf(self)),
  },
  signals: ["attached", "detached", "updated"],
  methods: { destroy: destroying(QtObject) },
  setup(self) {
    live(self);
  },
  // What is declared in a Controller acts on its host: a gesture in one
  // listens on the host's element, a Controller in one shares its host.
  adopt(self, props) {
    const host = untrack(() => self.host);
    hidden(self, "$declared", contents(props, host ?? self));
  },
});

const MEMBERS = ["properties", "bindings", "attached", "detached", "updated"];

// `export const Breakpoint = controller({ properties, bindings, attached,
// detached, updated })`: a Controller type from a module. A binding is a
// function of the host and the Controller, and what `attached` returns runs
// when the Controller is detached.
export function controller(spec = {}) {
  for (const key of Object.keys(spec)) {
    if (!MEMBERS.includes(key)) {
      throw new TypeError(`a controller has \`properties\`, \`bindings\`, \`attached\`, \`detached\` and \`updated\`; \`${key}\` is none of them`);
    }
  }
  const properties = { ...spec.properties };
  for (const [name, bind] of Object.entries(spec.bindings ?? {})) {
    properties[name] = derived((self) => bind(self.host, self));
  }
  const lifecycle = { attached: spec.attached, detached: spec.detached, updated: spec.updated };
  return defineType("Controller", Controller, { properties, lifecycle });
}
