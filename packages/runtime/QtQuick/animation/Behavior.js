// Behavior: `Behavior on x { NumberAnimation {} }`. The property has the
// value it was given at once; what it reads as moves there, by the
// animation. So the Behavior owns what the property shows (the slot's
// `shown`), and follows the value under it.
import { createRenderEffect, onCleanup } from "solid-js";
import { contents, defineType, group, memo, QtObject, slot, whenComplete } from "../../object.js";
import { RUNNING, STOPPED } from "./jobs.js";
import { display, Property } from "./property.js";
import { untrack } from "#kernel";

function stop(behavior) {
  const job = behavior.job;
  if (job && job.state !== STOPPED) job.stop();
}

// The property was given `value`. This is Qt's `QQuickBehavior::write`: a
// new value while the animation runs starts it again from where the
// property is, unless it is one that keeps its velocity (a spring), which
// is only told where to go now.
function write(self, value) {
  const behavior = self.$behavior;
  const { property, shown } = behavior;
  const changed = !Object.is(behavior.to, value);
  if (changed) {
    behavior.to = value;
    slot(self, "targetValue").write(value);
  }
  // A transition is showing the property; it says when it is done.
  if (shown.held) return;
  const animation = self.animation;
  // Disabled, it lets the value through, and that ends what was running.
  if (!animation || !self.enabled) {
    stop(behavior);
    shown.show(value);
    return;
  }
  const old = behavior.job;
  const active = old !== null && old.state !== STOPPED;
  if (active && !changed) return;
  if (old) {
    // The animation goes on running as far as anyone can tell.
    old.listener = null;
    if (active && old.duration() !== -1) old.stop();
  }
  if (!active && Object.is(shown.value, value)) return;
  const action = { property, from: shown.value, to: value, shown: true };
  const taken = [];
  animation.$group ??= self;
  animation.$source = behavior.source;
  const job = (behavior.job = animation.$transition([action], taken, false, null));
  job.listener = behavior.listener;
  job.start();
  if (job.state === STOPPED) animation.$ran(false);
  if (!taken.includes(action)) shown.show(value);
}

export const Behavior = defineType("Behavior", QtObject, {
  properties: {
    enabled: true,
    animation: undefined,
    targetValue: undefined,
    targetProperty: group({ object: undefined, name: "" }),
  },
  methods: {
    // Something else writes or shows the property now.
    $interrupt() {
      stop(this.$behavior);
    },
    // A transition that had the property lets go of it. If it animated it
    // the property is where it was going; if not, the Behavior takes it there.
    $follow(animate) {
      const behavior = this.$behavior;
      const value = untrack(() => behavior.property.target());
      if (animate) untrack(() => write(this, value));
      else behavior.shown.show(value);
    },
  },
  setup(self, props) {
    whenComplete(() => {
      const object = untrack(() => props.$target);
      const name = props.$property;
      if (!object || !name) return;
      const property = new Property(object, name);
      // A property a component declares has no slot to show through.
      if (!property.slot) return;
      const shown = display(property.slot);
      const behavior = (self.$behavior = {
        property,
        shown,
        source: { object, key: property.key },
        job: null,
        to: undefined,
        listener: {
          stateChanged: (job, state) => {
            if (job === behavior.job) untrack(() => self.animation)?.$ran(state === RUNNING);
          },
        },
      });
      slot(self, "targetProperty$object").provide(object);
      slot(self, "targetProperty$name").provide(name.replaceAll("$", "."));
      const target = memo(() => property.target());
      // From now on the property reads as what is shown. It is where it is
      // to begin with: nothing moves until it is given another value.
      behavior.to = untrack(target);
      slot(self, "targetValue").write(behavior.to);
      shown.behavior = self;
      if (!shown.held) {
        shown.value = behavior.to;
        property.slot.shown = shown.read;
      }
      createRenderEffect(target, (value) => untrack(() => write(self, value)));
      onCleanup(() => {
        stop(behavior);
        if (shown.behavior !== self) return;
        shown.behavior = null;
        if (!shown.held) property.slot.shown = null;
      });
    });
  },
  adopt(self, props) {
    const [animation] = contents(props);
    if (!animation) return;
    animation.$group = self;
    slot(self, "animation").provide(animation);
  },
});
