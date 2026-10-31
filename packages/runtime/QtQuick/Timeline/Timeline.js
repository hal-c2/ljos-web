// Timeline, KeyframeGroup, Keyframe: properties that are what their keyframes
// say at `currentFrame`, for as long as the timeline is enabled.
//
// As Qt does it. A group takes its property over when the timeline is
// enabled: it remembers the value the property has and the binding it had,
// and from then on writes what its keyframes make of the frame, whenever the
// frame or a keyframe changes. Before its first keyframe the property is on
// its way there from the value it had, which stands just before
// `startFrame`; each keyframe's easing curve is that of the way to it; past
// the last keyframe it is that one's value. Disabled, the group gives back
// what it took, the binding if there was one, but only where the property
// still reads what the group last wrote: what something else has written
// since stays. Groups are done in the order they are written, so a second one
// on a property takes over what the first has just written.
//
// What is written is an assignment like a program's: a Behavior on the
// property animates it.
//
// Not here:
// - `KeyframeGroup.keyframeData`.
// - `keyframeSource` is read as Qt reads it, but the browser fetches it:
//   its keyframes are there some time after the group is made, where Qt has
//   them at once. Given another source, Qt drops the keyframes written
//   inside the group too; here they stay.
// - Qt warns of a property it cannot set at every frame; here once.
// - The property's type is not known, only its value: see between.js.
// - `Timeline.keyframeGroups` and `animations` are what was written in the
//   timeline; nothing can be added to them afterwards.
import { onCleanup, runWithOwner } from "solid-js";
import { Quaternion, Vector2d, Vector3d, Vector4d } from "../../QtQml/values.js";
import { contents, defineType, derived, effect, flush, gather, group, inside, located, QtObject, whenComplete } from "../../object.js";
import { curve } from "../animation/easing.js";
import { Property } from "../animation/property.js";
import { lazy } from "../compute.js";
import { kindOf, NOTHING } from "./between.js";
import { keyframes as stored, sort } from "./keyframes.js";
import { signal, untrack } from "#kernel";

const NONE = Object.freeze([]);
const f = Math.fround;
// The values Qt keeps in single precision.
const SINGLE = [Vector2d, Vector3d, Vector4d, Quaternion];

const list = (value) => (value == null ? NONE : Array.isArray(value) ? value.flat(Infinity).filter(Boolean) : [value]);

export const Keyframe = defineType("Keyframe", QtObject, {
  properties: {
    frame: 0,
    value: undefined,
    easing: group({
      type: 0,
      amplitude: 1,
      overshoot: 1.70158,
      period: 0.3,
      bezierCurve: undefined,
    }),
  },
  // A curve given as a bezier is one: `easing.type` reads `Easing.BezierSpline`.
  resolve: { easing$type: (self, own) => (self.easing.bezierCurve ? 45 : own()) },
});

// A keyframe as the group evaluates it.
function entry(keyframe) {
  const easing = keyframe.easing;
  const said = [keyframe, Number(keyframe.frame), keyframe.value, easing.type, easing.amplitude, easing.overshoot, easing.period, easing.bezierCurve];
  return { said, frame: said[1], value: said[2], ease: curve(...said.slice(3)) };
}

const alike = (a, b) => a.length === b.length && a.every((each, index) => Object.is(each, b[index]));

const before = (a, b) => a.frame < b.frame;

// Qt's `qFuzzyCompare`.
const fuzzy = (a, b) => Math.abs(a - b) * 1e12 <= Math.min(Math.abs(a), Math.abs(b));

// The value at `frame`, or NOTHING when there is none to write.
function evaluate(state, start, frame) {
  const entries = state.entries();
  if (!entries.length) return NOTHING;
  const kind = state.kind;
  // What the property had stands just before the timeline starts.
  let last = { frame: start - 0.0001, value: state.original };
  for (const next of entries) {
    if (fuzzy(frame, next.frame) || frame < next.frame) {
      const from = kind.take(last.value);
      const to = kind.take(next.value);
      if (from === NOTHING || to === NOTHING) return NOTHING;
      // A curve is asked for what is between 0 and 1, whatever the frames.
      const way = (frame - last.frame) / (next.frame - last.frame);
      return kind.between(from, to, next.ease(way > 0 ? (way < 1 ? way : 1) : 0));
    }
    last = next;
  }
  return kind.take(last.value);
}

const read = (target, path) => untrack(() => path.reduce((object, member) => object?.[member], target));

// Assigns the property, by its name as a program would write it: a property
// of the target, of a group or an object the target has (`font.pixelSize`,
// `eulerRotation.x`), or a member of a value it holds (`origin.x`), where a
// value with that member changed takes the place of the one it held.
function assign(target, path, value) {
  if (!path.length || !(path[0] in target)) return false;
  let holder = target;
  for (let index = 0; index < path.length - 1; index++) {
    const held = untrack(() => holder[path[index]]);
    if (held == null || typeof held !== "object") return false;
    if (!held.$type && !held.$self) {
      if (index !== path.length - 2) return false;
      const changed = Object.assign(Object.create(Object.getPrototypeOf(held)), held);
      const member = path[index + 1];
      if (!(member in changed)) return false;
      changed[member] = SINGLE.some((Type) => held instanceof Type) ? f(value) : value;
      holder[path[index]] = changed;
      return true;
    }
    holder = held;
  }
  holder[path.at(-1)] = value;
  return true;
}

// Qt's `init`: the group remembers what the property is, and the binding it
// has, for when the timeline lets go of it.
function init(self) {
  const state = self.$keyframes;
  const target = (state.target = self.target ?? null);
  const name = (state.name = String(self.property ?? ""));
  state.path = name ? name.split(".") : NONE;
  if (!target) return;
  const held = new Property(target, name).slot;
  const original = read(target, state.path);
  const kind = (state.kind = kindOf(original, held));
  state.original = kind.keep ? kind.keep(original) : original;
  state.slot = held;
  state.bound = held !== null && held.bound !== null && !held.assigned;
}

// Qt's `setProperty(frame)`.
function put(self, start, frame) {
  const state = self.$keyframes;
  if (!state.target || !state.kind) return;
  const value = (state.last = evaluate(state, start, frame));
  if ((value !== NOTHING && assign(state.target, state.path, value)) || state.warned) return;
  // A group whose keyframes are still on their way has nothing to say yet.
  const source = located(String(self.keyframeSource ?? ""));
  if (source && source !== untrack(state.arrived)) return;
  state.warned = true;
  console.warn(`Cannot set property "${state.name}"`);
}

// Qt's `resetDefaultValue`.
function restore(self) {
  const state = self.$keyframes;
  const { target, path, last, kind } = state;
  if (!target || !kind || last === NOTHING || !kind.same(last, read(target, path))) return;
  const held = state.slot;
  const bound = state.bound;
  state.bound = false;
  // The binding is under the assignment, where the type keeps what it is
  // assigned in the property itself.
  if (bound && held.assigned) held.reset();
  else assign(target, path, state.original);
}

function load(self, url) {
  const state = self.$keyframes;
  const asked = ++state.asked;
  const arrived = (made) => {
    // Only the last one asked for counts.
    if (asked !== state.asked) return;
    if (made.length || untrack(state.loaded).length) state.setLoaded(made);
    // The timeline writes again, and warns of a group that was given nothing
    // to write.
    state.setArrived(url);
    flush();
  };
  if (!url) {
    if (untrack(state.loaded).length) state.setLoaded(NONE);
    return;
  }
  fetch(url)
    .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(response.statusText))))
    .then(
      (buffer) => {
        let found = NONE;
        try {
          found = stored(new Uint8Array(buffer));
        } catch (error) {
          console.warn(error.message ? `Corrupt keyframeSource "${error.message}"` : "Invalid keyframe data");
        }
        arrived(runWithOwner(self.$owner, () => found.map(({ frame, type, value }) => Keyframe({ frame, value, easing$type: type }))));
      },
      () => {
        console.warn(`Unable to open keyframeSource: "${url}"`);
        arrived(NONE);
      },
    );
}

export const KeyframeGroup = defineType("KeyframeGroup", QtObject, {
  properties: {
    target: undefined,
    property: "",
    keyframeSource: "",
    // Those written in the group, then those its source holds.
    keyframes: derived((self) => {
      const state = self.$keyframes;
      return [...state.declared, ...state.loaded()];
    }),
  },
  setup(self) {
    const [loaded, setLoaded] = signal(NONE, self.$owner);
    const [arrived, setArrived] = signal("", self.$owner);
    const state = (self.$keyframes = {
      declared: NONE,
      loaded,
      setLoaded,
      asked: 0,
      // In Qt's order: sorted when there are others, not when one of them
      // is given another frame.
      all: NONE,
      order: NONE,
      sorted: lazy(self, () => {
        const all = list(self.keyframes);
        if (!alike(all, state.all)) {
          state.all = all;
          state.order = untrack(() => sort([...all], before));
        }
        return state.order;
      }),
      // The same list for as long as nothing of a keyframe has changed,
      // which is how the timeline knows when something did.
      made: NONE,
      entries: lazy(
        self,
        () => {
          const made = state.sorted().map(entry);
          const had = state.made;
          if (made.length !== had.length || made.some((each, index) => !alike(each.said, had[index].said))) state.made = made;
          return state.made;
        },
        NONE,
      ),
      // What `entries` was when the timeline last wrote.
      seen: NONE,
      // The source whose keyframes have come, or that had none to give,
      // and the one the timeline last heard of.
      arrived,
      setArrived,
      heard: "",
      // The property the group has, and what it was when it took it.
      target: null,
      name: "",
      path: NONE,
      original: undefined,
      kind: null,
      slot: null,
      bound: false,
      last: NOTHING,
      warned: false,
    });
    effect(
      () => located(String(self.keyframeSource ?? "")),
      (url) => load(self, url),
    );
    onCleanup(() => void state.asked++);
  },
  adopt(self, props) {
    self.$keyframes.declared = contents(props);
  },
});

// The timeline whose `animations` are being made: a TimelineAnimation is
// told by this which one it is in, before it starts.
let making = null;
export const owning = () => making;

// Qt's `reevaluate`, `setEnabled` and what a group does when it is given
// another target or property, from what has changed since the last time.
function update(self) {
  const state = self.$timeline;
  const enabled = Boolean(self.enabled);
  const frame = Number(self.currentFrame);
  const start = Number(self.startFrame);
  let moved = frame !== state.frame;
  state.frame = frame;
  for (const each of state.groups) {
    const keyframes = each.$keyframes;
    // Another target, or another property of it: taken as it is now, and
    // written at the next frame.
    if (keyframes.target !== (each.target ?? null) || keyframes.name !== String(each.property ?? "")) init(each);
    const entries = keyframes.entries();
    const arrived = keyframes.arrived();
    if (entries !== keyframes.seen || arrived !== keyframes.heard) moved = true;
    keyframes.seen = entries;
    keyframes.heard = arrived;
  }
  if (enabled !== state.enabled) {
    state.enabled = enabled;
    for (const each of state.groups) {
      if (!enabled) restore(each);
      else {
        init(each);
        put(each, start, frame);
      }
    }
  } else if (enabled && moved) {
    for (const each of state.groups) put(each, start, frame);
  }
}

export const Timeline = defineType("Timeline", QtObject, {
  properties: {
    startFrame: 0,
    endFrame: 0,
    currentFrame: 0,
    enabled: false,
    keyframeGroups: derived((self) => self.$timeline.groups),
  },
  methods: {
    get animations() {
      return this.$timeline.animations();
    },
  },
  setup(self, props) {
    const state = (self.$timeline = {
      groups: NONE,
      // Every TimelineAnimation made for it, as it is made: one that starts
      // stops the others.
      made: [],
      animations: lazy(
        self,
        () => {
          const outer = making;
          making = self;
          try {
            return list(inside(null, () => props.animations));
          } finally {
            making = outer;
          }
        },
        NONE,
      ),
      enabled: false,
      frame: 0,
    });
    whenComplete(() => {
      untrack(() => {
        if (state.groups === NONE) state.groups = list(self.keyframeGroups).filter((each) => each.$keyframes);
        self.animations;
        // Before anything is told that it is complete, the properties are
        // what the timeline makes them.
        gather(() => update(self));
      });
      effect(
        () => {
          const read = [self.enabled, self.currentFrame];
          for (const each of state.groups) read.push(each.target, each.property, each.$keyframes.entries(), each.$keyframes.arrived());
          return read;
        },
        () => untrack(() => update(self)),
      );
    });
  },
  adopt(self, props) {
    self.$timeline.groups = contents(props).filter((each) => each.$keyframes);
  },
});
