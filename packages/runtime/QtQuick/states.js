// States: an item's `state` names one of its `states`, each a set of changes
// to make while it is the one, and its `transitions` say how to get there.
//
// A change gives a property another binding for as long as the state lasts;
// what the property had comes back when a state that does not change it is
// entered. With a transition the property has its new value at once, as with
// a Behavior, and reads as what the transition's animations show until they
// are done.
import { createEffect, createMemo, createRoot, runWithOwner } from "solid-js";
import { bound, contents, defineType, flush, group, QtObject, replace, slot, whenComplete } from "../object.js";
import { follow, parallel } from "./animation/Animation.js";
import { drain, later } from "./animation/clock.js";
import { display, Property } from "./animation/property.js";
import { signal, untrack } from "#kernel";

const SYNC = { sync: true };
const DEFER = { defer: true };
const NONE = Object.freeze([]);
const next = (version) => version + 1;

const list = (value) => (value == null ? NONE : Array.isArray(value) ? value : [value]);

// What decides a slot's value, to put back later.
const capture = (property) => {
  const held = property.slot;
  return held ? { bound: held.bound, assigned: held.assigned, value: held.value } : { value: property.get() };
};

function bind(held, reads) {
  held.bound = reads;
  held.assigned = false;
  held.value = undefined;
  held.changed();
}

function restore(held, saved) {
  held.bound = saved.bound;
  held.assigned = saved.assigned;
  held.value = saved.value;
  held.changed();
}

// A property a component declares can only be assigned to: the state keeps
// assigning what its binding gives, until `detach`.
function attach(states, property, value) {
  detach(states, property);
  const { object, key } = property;
  const entry = { property, live: true, dispose: null };
  entry.dispose = runWithOwner(states.self.$owner, () =>
    createRoot((dispose) => {
      follow(createMemo(value, SYNC), (given) => {
        if (entry.live) object[key] = given;
      });
      return dispose;
    }),
  );
  states.attached.push(entry);
}

function detach(states, property) {
  const index = states.attached.findIndex((entry) => entry.property.is(property.object, property.key));
  if (index < 0) return;
  const [entry] = states.attached.splice(index, 1);
  entry.live = false;
  entry.dispose();
}

// The change of one property: `install` makes it, `end` says what the
// property is once it is made.
function change(states, property, restoring, install, end) {
  return {
    property,
    from: undefined,
    to: undefined,
    shown: property.slot !== null,
    restore: restoring,
    // An anchor line: changed at once, never something to animate.
    fixed: false,
    install,
    end: property.slot ? () => property.slot.target() : end,
  };
}

function binding(states, owner, property, value, memos, index, restoring, explicit) {
  const held = property.slot;
  if (!held) {
    return change(
      states,
      property,
      restoring,
      explicit ? () => (detach(states, property), (property.object[property.key] = value())) : () => attach(states, property, value),
      value,
    );
  }
  if (explicit) {
    return change(states, property, restoring, () => restore(held, { bound: null, assigned: true, value: value() }));
  }
  // One binding for each change, however often the state is entered. It may
  // be of a ring as any binding may: a width a layout is to give, which the
  // layout's own size comes of.
  const reads = (memos[index] ??= bound(owner.$owner, value));
  return change(states, property, restoring, () => bind(held, reads));
}

function reverting(states, revert) {
  const { property, saved } = revert;
  const held = property.slot;
  if (held) {
    const action = change(states, property, true, () => restore(held, saved));
    action.fixed = revert.fixed;
    return action;
  }
  return change(
    states,
    property,
    true,
    () => (detach(states, property), (property.object[property.key] = saved.value)),
    () => saved.value,
  );
}

const same = (action, revert) =>
  action.event
    ? action.event === revert.event && action.target === revert.target && action.name === revert.name
    : !revert.event && action.property.is(revert.property.object, revert.property.key);

// Where an item's top left corner is in the scene, transforms aside.
function origin(item) {
  let x = 0;
  let y = 0;
  for (let at = item; at; at = at.parent) {
    x += at.x;
    y += at.y;
  }
  return [x, y];
}

// Moves an item to another parent; `index` is its place among the children
// it was declared with, when it goes back there.
function reparent(item, parent, index = -1) {
  const old = item.parent;
  if (old === parent) return;
  if (old) {
    if (old.$static.includes(item)) {
      old.$static = old.$static.filter((child) => child !== item);
      old.$touch(next);
    } else {
      old.$remove(item);
    }
  }
  slot(item, "parent").write(parent);
  if (!parent) return;
  if (index < 0) return parent.$add(item);
  const children = [...parent.$static];
  children.splice(Math.min(index, children.length), 0, item);
  parent.$static = children;
  parent.$touch(next);
}

const GEOMETRY = ["x", "y", "width", "height"];
const PLACED = ["x", "y", "width", "height", "scale", "rotation"];

// What happens that is not the change of one property.
const events = {
  script: {
    perform(action) {
      action.run?.();
    },
  },
  // `onClicked: ...` among a state's changes: what the signal runs for as
  // long as the state is the item's, in the place of the item's own.
  handler: {
    revert: (action) => ({ event: "handler", target: action.target, name: action.name, saved: action.target.$replaced?.[action.name] }),
    undo: (revert) => ({ event: "handler", target: revert.target, name: revert.name, run: revert.saved }),
    perform(action) {
      replace(action.target, action.name, action.run);
    },
  },
  // The lines themselves are changes like any other; this is for where they
  // put the item, which is what an AnchorAnimation animates.
  anchors: {
    revert: (action) => ({ event: "anchors", target: action.target }),
    undo: (revert) => ({ event: "anchors", target: revert.target, moved: [] }),
    perform() {},
  },
  parent: {
    revert(action) {
      const item = action.target;
      const parent = item.parent;
      const saved = { parent, index: parent ? parent.$static.indexOf(item) : -1 };
      for (const name of PLACED) saved[name] = capture(new Property(item, name));
      return { event: "parent", target: item, saved };
    },
    undo: (revert) => ({ event: "parent", target: revert.target, parent: null, saved: revert.saved }),
    // The item stays where it is on the page, as far as moving it can: an
    // ancestor that is scaled or rotated is not made up for.
    perform(action) {
      const item = action.target;
      const saved = action.saved;
      if (saved) {
        for (const name of PLACED) restore(slot(item, name), saved[name]);
        reparent(item, saved.parent, saved.index);
        return;
      }
      const [fromX, fromY] = origin(item.parent);
      const [toX, toY] = origin(action.parent);
      const x = item.x + fromX - toX;
      const y = item.y + fromY - toY;
      reparent(item, action.parent);
      slot(item, "x").write(x);
      slot(item, "y").write(y);
    },
  },
};

// Qt's `findTransition`: the transition that names both states wins, then
// one that names either; a reversible one is also tried the other way round.
function findTransition(self, from, to) {
  const states = self.$states;
  let highest = null;
  let score = 0;
  let reversed = false;
  search: for (const transition of list(self.transitions)) {
    if (!transition.enabled) continue;
    const fromState = String(transition.from).split(",").map((name) => name.trim());
    const toState = String(transition.to).split(",").map((name) => name.trim());
    for (let round = 0; round < 2; round++) {
      if (round && (!transition.reversible || (transition.from === "*" && transition.to === "*"))) break;
      const first = round ? toState : fromState;
      const second = round ? fromState : toState;
      let found = 0;
      if (first.includes(from)) found += 2;
      else if (first.includes("*")) found += 1;
      else continue;
      if (second.includes(to)) found += 2;
      else if (second.includes("*")) found += 1;
      else continue;
      reversed = round === 1;
      if (found === 4) {
        highest = transition;
        break search;
      }
      if (found > score) {
        score = found;
        highest = transition;
      }
    }
  }
  states.reversed = reversed;
  return highest;
}

// The changes of a state, after those of the state it extends.
function generate(self, state, actions) {
  if (state.$generating) return;
  state.$generating = true;
  const base = state.extend;
  if (base) {
    const extended = list(self.states).find((other) => other.name === base);
    if (extended) generate(self, extended, actions);
  }
  for (const operation of state.$operations) operation.$actions?.(actions, self.$states);
  state.$generating = false;
}

// A change of state while the last one is still on its way: what was being
// animated stays where it is, for the next transition to start from.
function cancel(states) {
  const job = states.job;
  if (!job) return;
  states.job = null;
  job.stop();
  states.transition.$ran(false);
  flush();
}

// The transition is over, or there was none: every property reads as its
// value, and what went back to how it was is no longer the state's to undo.
function finish(self, state) {
  const states = self.$states;
  const claimed = states.claimed;
  states.claimed = NONE;
  states.job = null;
  for (const action of claimed) {
    if (action.property.slot) display(action.property.slot).release(false);
    else action.install?.();
  }
  for (const revert of states.reverting) {
    const index = states.reverts.indexOf(revert);
    if (index >= 0) states.reverts.splice(index, 1);
  }
  states.reverting = NONE;
  flush();
  state?.completed();
}

function enter(self, state, transition) {
  const states = self.$states;
  cancel(states);
  const actions = [];
  if (state) generate(self, state, actions);
  // What this state changes that no state before it did is saved, to undo.
  const fresh = [];
  for (const action of actions) {
    if (states.reverts.some((revert) => same(action, revert))) continue;
    if (fresh.some((revert) => same(action, revert))) continue;
    if (action.event) {
      const revert = events[action.event].revert?.(action);
      if (revert) fresh.push(revert);
    } else if (action.restore) {
      fresh.push({ property: action.property, saved: capture(action.property), fixed: action.fixed });
    }
  }
  // What a state before changed and this one does not goes back.
  const undone = [];
  for (const revert of states.reverts) {
    if (actions.some((action) => same(action, revert))) continue;
    actions.push(revert.event ? events[revert.event].undo(revert) : reverting(states, revert));
    undone.push(revert);
  }
  states.reverts.push(...fresh);
  states.reverting = undone;
  const before = states.claimed;
  states.claimed = NONE;
  if (!transition) {
    for (const action of before) if (action.property.slot) display(action.property.slot).release(false);
    for (const action of actions) {
      if (action.event) events[action.event].perform(action);
      else action.install();
    }
    finish(self, state);
    return;
  }
  // Every property goes on reading as it does while its value changes.
  const held = new Set();
  const hold = (action) => {
    const shown = action.property.slot && display(action.property.slot);
    if (shown) {
      shown.hold();
      held.add(shown);
    }
    action.from = action.property.get();
  };
  for (const action of actions) {
    if (action.event === "anchors") {
      for (const name of GEOMETRY) {
        const property = new Property(action.target, name);
        const moved = { property, from: undefined, to: undefined, shown: true };
        hold(moved);
        action.moved.push(moved);
      }
    } else if (action.property && !action.fixed) {
      hold(action);
    }
  }
  for (const action of before) {
    const shown = action.property.slot && display(action.property.slot);
    if (shown && !held.has(shown)) shown.release(false);
  }
  for (const action of actions) {
    if (action.event) {
      if (action.event !== "script") events[action.event].perform(action);
    } else if (action.property.slot) {
      action.install();
    }
  }
  flush();
  for (const action of actions) {
    if (action.event === "anchors") {
      for (const moved of action.moved) moved.to = moved.property.slot.target();
      const still = action.moved.filter((moved) => Object.is(moved.from, moved.to));
      action.moved = action.moved.filter((moved) => !still.includes(moved));
      for (const moved of still) display(moved.property.slot).release(false);
    } else if (action.property) {
      action.to = action.end();
    }
  }
  const modified = [];
  const job = (states.job = transition.$prepare(
    actions.filter((action) => !action.fixed),
    modified,
    states.reversed,
  ));
  // The transition is still running when the state says it is complete.
  job.listener = {
    finished: () => {
      if (states.job !== job) return;
      finish(self, state);
      transition.$ran(false);
      flush();
    },
  };
  states.claimed = modified.filter((action) => action.property);
  states.transition = transition;
  transition.$ran(true);
  job.start();
  // What no animation took is as the state says at once.
  for (const action of actions) {
    if (action.event === "script") {
      if (!action.done) {
        flush();
        action.run?.();
      }
    } else if (action.event === "anchors") {
      for (const moved of action.moved) {
        if (!modified.includes(moved)) display(moved.property.slot).release(true);
      }
    } else if (action.property && !action.fixed && !modified.includes(action)) {
      if (action.property.slot) display(action.property.slot).release(true);
      else action.install();
    }
  }
  flush();
}

function setState(self, name, immediate) {
  const states = self.$states;
  if (!states.complete) {
    states.early = name;
    return;
  }
  drain();
  if (states.current === name) return;
  if (states.applying) {
    console.warn("Can't apply a state change as part of a state definition.");
    return;
  }
  untrack(() => {
    states.applying = true;
    const transition = immediate ? null : findTransition(self, states.current, name);
    states.current = name;
    // Qt says the state changed before anything of it has.
    states.bump(next);
    flush();
    // The first state is entered before the handler has anything to hear.
    if (states.starting) self.$props.onStateChanged?.();
    const state = name === "" ? null : (list(self.states).find((other) => other.name === name) ?? null);
    enter(self, state, transition);
    states.applying = false;
  });
  // A `when` that changed while this state was being entered.
  if (states.again) {
    states.again = false;
    auto(self);
  }
}

// Qt's `updateAutoState`: the first state whose `when` holds is the state;
// when the current one's no longer does, there is none. `current` is the
// state there is: at the start, the one `state` names and nothing has
// entered yet, which a `when` that does not hold takes away as well.
function auto(self, current = self.$states.current) {
  const states = self.$states;
  if (states.applying) {
    states.again = true;
    return false;
  }
  return untrack(() => {
    let revert = false;
    for (const state of list(self.states)) {
      if (!slot(state, "when").explicit() || !state.name) continue;
      if (state.when) {
        if (current === state.name) return false;
        setState(self, state.name, false);
        return true;
      }
      if (state.name === current) revert = true;
    }
    if (!revert) return false;
    // One that was named and never entered is only heard to have gone.
    if (current !== states.current) self.$props.onStateChanged?.();
    else setState(self, "", false);
    return current !== "";
  });
}

function machine(self) {
  const [version, bump] = signal(0, self.$owner);
  return (self.$states = {
    self,
    current: "",
    // Set by an assignment: from then on a binding `state` had does not decide.
    assigned: false,
    complete: true,
    starting: false,
    early: undefined,
    applying: false,
    again: false,
    reversed: false,
    // What to put back when a state is left, and which of it is on its way
    // back in the transition that is running.
    reverts: [],
    reverting: NONE,
    job: null,
    transition: null,
    claimed: NONE,
    attached: [],
    version,
    bump,
  });
}

// What an Item and a StateGroup share: `state`, `states`, `transitions`.
export const stateful = {
  properties: { state: "", states: undefined, transitions: undefined },
  methods: {
    get state() {
      const states = this.$states;
      if (!states) return slot(this, "state").get();
      states.version();
      return states.current;
    },
    set state(name) {
      let states = this.$states;
      if (!states) {
        states = machine(this);
        // Whoever read it before reads it from here now.
        slot(this, "state").changed();
      }
      states.assigned = true;
      setState(this, name == null ? "" : String(name), false);
    },
  },
  // An object that has none of the three is left as it is.
  setup(self, props) {
    self.$states = null;
    if (!("states" in props) && !("state" in props)) return;
    const states = machine(self);
    states.complete = false;
    whenComplete(() => {
      let unnamed = 0;
      const all = list(untrack(() => self.states));
      for (const state of all) {
        if (!untrack(() => state.name)) slot(state, "name").provide(`anonymousState${++unnamed}`);
      }
      // The transitions exist from the start, as the states do.
      untrack(() => self.transitions);
      states.complete = true;
      const given = slot(self, "state");
      const named = createMemo(() => String(given.get() ?? ""), SYNC);
      const whens = createMemo(
        () => all.map((state) => (slot(state, "when").explicit() ? (state.when ? "1" : "0") : "-")).join(""),
        SYNC,
      );
      // As Qt does when the component is complete: a state whose `when`
      // holds is entered through its transition, a `state` set from the
      // start without one.
      states.starting = true;
      const first = states.early ?? untrack(named);
      if (!auto(self, first) && first) setState(self, first, true);
      states.starting = false;
      createEffect(
        named,
        (name) =>
          later(() => {
            if (!states.assigned) setState(self, name, false);
          }),
        DEFER,
      );
      createEffect(whens, () => later(() => auto(self)), DEFER);
    });
  },
};

export const StateGroup = defineType("StateGroup", QtObject, stateful);

export const State = defineType("State", QtObject, {
  properties: { name: "", when: undefined, extend: "" },
  signals: ["completed"],
  setup(self) {
    self.$operations = NONE;
  },
  adopt(self, props) {
    self.$operations = contents(props);
  },
});

// `$changes` is `[name, value, target, type]` for each property changed:
// `value` the binding, `target` what `rect.width: 10` names when it is not
// `target`, `type` what attaches the object the property is of
// (`Layout.preferredWidth: 10`). The binding is given the target, whose
// names are the first it finds when the target is not known by its id.
export const PropertyChanges = defineType("PropertyChanges", QtObject, {
  properties: { target: undefined, explicit: false, restoreEntryValues: true },
  methods: {
    $actions(actions, states) {
      const changes = this.$props.$changes;
      if (!changes) return;
      const restoring = Boolean(this.restoreEntryValues);
      const explicit = Boolean(this.explicit);
      const target = this.target;
      // A memo is of the target it was made for: another has other names.
      if (this.$aimed !== target) this.$memos = null;
      this.$aimed = target;
      const memos = (this.$memos ??= []);
      for (let index = 0; index < changes.length; index++) {
        const [name, value, where, type] = changes[index];
        let object = where ? where() : target;
        if (object != null && type) object = type.attached?.(object);
        if (object == null) continue;
        const given = where ? value : () => value(target);
        const property = new Property(object, name);
        if (!property.valid) {
          // A handler is what the lines of it do, or the function they are.
          const heard = /^on([A-Z_])(\w*)$/.exec(name);
          if (!heard || typeof object[heard[1].toLowerCase() + heard[2]]?.connect !== "function") continue;
          const run = (...args) => {
            const made = given();
            if (typeof made === "function") made(...args);
          };
          actions.push({ event: "handler", target: object, name, run });
          continue;
        }
        actions.push(binding(states, this, property, given, memos, index, restoring, explicit));
      }
    },
  },
});

const LINES = ["left", "right", "top", "bottom", "horizontalCenter", "verticalCenter", "baseline"];

// `anchors.left: undefined` takes the anchor away, which is what the line
// reads as here when it is given and has no value.
export const AnchorChanges = defineType("AnchorChanges", QtObject, {
  properties: {
    target: undefined,
    anchors: group(Object.fromEntries(LINES.map((line) => [line, undefined]))),
  },
  methods: {
    $actions(actions, states) {
      const target = this.target;
      if (!target) return;
      const memos = (this.$memos ??= []);
      for (let index = 0; index < LINES.length; index++) {
        const key = `anchors$${LINES[index]}`;
        if (!(key in this.$props)) continue;
        const line = slot(this, key);
        const action = binding(states, this, new Property(target, key), () => line.get(), memos, index, true, false);
        action.fixed = true;
        actions.push(action);
      }
      actions.push({ event: "anchors", target, moved: [] });
    },
  },
});

export const ParentChange = defineType("ParentChange", QtObject, {
  properties: {
    target: undefined,
    parent: undefined,
    x: undefined,
    y: undefined,
    width: undefined,
    height: undefined,
    scale: undefined,
    rotation: undefined,
  },
  methods: {
    $actions(actions, states) {
      const target = this.target;
      const parent = this.parent;
      if (!target || !parent) return;
      actions.push({ event: "parent", target, parent, saved: null });
      const memos = (this.$memos ??= []);
      for (let index = 0; index < PLACED.length; index++) {
        const name = PLACED[index];
        if (!(name in this.$props)) continue;
        const given = slot(this, name);
        actions.push(binding(states, this, new Property(target, name), () => given.get(), memos, index, true, false));
      }
    },
  },
});

// Run when the state is entered: at once, or where the transition has a
// ScriptAction with its name.
export const StateChangeScript = defineType("StateChangeScript", QtObject, {
  properties: { script: undefined, name: "" },
  methods: {
    $actions(actions) {
      const script = this.script;
      actions.push({ event: "script", name: this.name, run: script ? () => untrack(script) : null, done: false });
    },
  },
});

export const Transition = defineType("Transition", QtObject, {
  properties: {
    from: "*",
    to: "*",
    reversible: false,
    enabled: true,
    animations: undefined,
    running: false,
  },
  methods: {
    // Read only: whether a change of state is using it.
    get running() {
      const run = this.$run;
      run.version();
      return run.count > 0;
    },
    set running(run) {},
    $ran(running) {
      const run = this.$run;
      run.count += running ? 1 : -1;
      if (run.count === (running ? 1 : 0)) run.bump(next);
    },
    // The job that animates what of `actions` its animations are for: side
    // by side, and when the transition is taken backwards, back to front.
    // `defaultTarget` is what an animation that names no target is of: the
    // item a view's transition moves.
    $prepare(actions, modified, reverse, defaultTarget = null) {
      const given = list(untrack(() => this.animations));
      if (given.length) {
        for (const animation of given) animation.$group = this;
        this.$animations = given;
      }
      return untrack(() => parallel(this, actions, modified, reverse, defaultTarget));
    },
  },
  setup(self) {
    const [version, bump] = signal(0, self.$owner);
    self.$run = { count: 0, version, bump };
    self.$animations = NONE;
    self.$source = null;
  },
  adopt(self, props) {
    self.$animations = contents(props);
    for (const animation of self.$animations) animation.$group = self;
  },
});
