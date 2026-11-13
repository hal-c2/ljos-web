// `Controller` (Ljos.Core): behaviour an item is given by declaring it
// inside, as ljos-ui's `features/components/controller.feature` and
// docs/DIALECT.md §4.20 have it.
//
// The item it is declared in is its `host`. It is `attached(host)` once the
// host is complete (or at once, put into one that is), `detached()` once, as
// it or its host goes, and, if it handles it, `updated()` once after it is
// attached and once after each turn that wrote a property of the host. A
// Controller written as a module (`controller({ … })`) is the same object
// with its lifecycle given as functions.
import { onCleanup } from "solid-js";
import { contents, defineType, derived, flushing, QtObject, whenToldComplete } from "../../object.js";
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
  if ("onUpdated" in self.$props || self.$replaced?.onUpdated) return true;
  return !steps(self, "updated").next().done;
}

function attach(self) {
  if (self.$life || self.$ended) return;
  const host = untrack(() => self.host);
  if (!host) return;
  const life = { host, cleanups: [], armed: false, quiet: false, gone: false };
  hidden(self, "$life", life);
  for (const run of steps(self, "attached")) {
    const back = run(host, self);
    if (typeof back === "function") life.cleanups.push(back);
  }
  self.attached(host);
  if (!handlesUpdated(self)) return;
  listen(host, self, life);
  // The first update is at the end of the turn it was attached in, so
  // what the load still writes to the host (its parent, as it is put in
  // the page) is in it, not a second one.
  arm(self, life);
}

// The host tells the Controllers that listen when one of its properties is
// written (`$written`, called by the slot). Only those that handle
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
}

// Once a turn, at its end: each assignment settles as it returns, so the
// end of the turn is where all of what it wrote is known. The browser's
// frame is never asked for it.
function arm(self, life) {
  if (life.armed || life.quiet || life.gone) return;
  life.armed = true;
  queueMicrotask(() => {
    life.armed = false;
    if (!life.gone) update(self, life);
  });
}

// What `updated` writes does not arm it again, so it cannot keep the page
// awake. A handler told while a flush is on runs after this returns, so the
// Controller stays quiet until it has.
function update(self, life) {
  life.quiet = true;
  for (const run of steps(self, "updated")) run(life.host, self);
  self.updated();
  if (flushing()) queueMicrotask(() => (life.quiet = false));
  else life.quiet = false;
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
  for (const cleanup of life.cleanups) cleanup();
  for (const run of steps(self, "detached")) run(life.host, self);
  self.detached();
}

// What makes an object a Controller's life: attached once its host is
// complete, detached as it goes. A gesture of `Ljos.Ui` lives so; it keeps
// the type of the handler it faces, which listens on its host's element.
export function live(self) {
  whenToldComplete(() => attach(self));
  onCleanup(() => end(self));
}

export { hostOf };

export const Controller = defineType("Controller", QtObject, {
  properties: {
    host: derived((self) => hostOf(self)),
  },
  signals: ["attached", "detached", "updated"],
  methods: {
    destroy(delay = 0) {
      if (this.$destroyed) return;
      QtObject.proto.destroy.call(this, delay);
      setTimeout(() => end(this), delay);
    },
  },
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
