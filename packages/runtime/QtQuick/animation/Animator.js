// The animators: one property of an item (where it is, its scale, its turn,
// its opacity) or one uniform of a shader, moved where it is drawn. The
// property itself is told where it got to when the animation is over, as in
// Qt, whose animators run with the scene rather than with the program.
import { defineType, group, slot } from "../../object.ts";
import { Animation } from "./Animation.js";
import { curve } from "./easing.js";
import { ActionJob, DrawnJob } from "./jobs.js";
import { Property } from "./property.js";
import { ROTATIONS } from "./PropertyAnimation.js";

const given = (self, key) => (slot(self, key).explicit() ? self[key] : undefined);

export const Animator = defineType("Animator", Animation, {
  properties: {
    target: undefined,
    duration: 250,
    from: 0,
    to: 0,
    easing: group({
      type: 0,
      amplitude: 1,
      overshoot: 1.70158,
      period: 0.3,
      bezierCurve: undefined,
    }),
  },
  methods: {
    // The property the type is for.
    $name: () => "",
    $rotate: () => null,
    // What it animates, as Qt decides it: of the changes a transition or a
    // Behavior is making, the one to its property; with none, its target's
    // property, to where it says, which is nought when it does not say.
    $select(actions, modified, defaultTarget, from, to) {
      const name = this.$name();
      const change = actions.find((action) => action.property?.key === name);
      if (change) {
        modified.push(change);
        const end = to !== undefined ? to : change.to;
        const action = { property: change.property, from: from ?? change.from, to: end, shown: change.shown, kind: 0, a: null, b: null };
        // What comes after this one in a sequence starts from where it ends.
        change.from = end;
        return [action];
      }
      const target = this.target ?? this.$source?.object ?? defaultTarget;
      const property = target == null ? null : new Property(target, name);
      if (!property?.valid) return [];
      return [{ property, from, to: to ?? 0, shown: false, kind: 0, a: null, b: null }];
    },
    $make(actions, modified, reverse, defaultTarget) {
      const source = this.$source;
      const name = this.$name();
      // `XAnimator on y` animates nothing, and neither does a transition
      // that runs backwards: an animator cannot be run that way.
      if (reverse || !name || (source && source.key !== name)) return new ActionJob(null);
      const duration = this.duration;
      const from = given(this, "from");
      const to = given(this, "to");
      const job = new DrawnJob(Math.max(0, duration), this.$curve(), this.$select(actions, modified, defaultTarget, from, to));
      job.fromDefined = job.actions.some((action) => action.from !== undefined);
      job.rotate = this.$rotate();
      job.exact = job.rotate === null || job.rotate === ROTATIONS[2];
      job.said = [duration, from, to];
      return job;
    },
    $curve() {
      const easing = this.easing;
      return curve(easing.type, easing.amplitude, easing.overshoot, easing.period, easing.bezierCurve);
    },
    $stale(job) {
      const said = job.said;
      return (
        !said || said[0] !== this.duration || !Object.is(said[1], given(this, "from")) || !Object.is(said[2], given(this, "to"))
      );
    },
  },
});

const animator = (type, name) => defineType(type, Animator, { methods: { $name: () => name } });

export const XAnimator = animator("XAnimator", "x");
export const YAnimator = animator("YAnimator", "y");
export const ScaleAnimator = animator("ScaleAnimator", "scale");
export const OpacityAnimator = animator("OpacityAnimator", "opacity");

export const RotationAnimator = defineType("RotationAnimator", Animator, {
  properties: { direction: 0 },
  enums: { Numerical: 0, Shortest: 1, Clockwise: 2, Counterclockwise: 3 },
  methods: {
    $name: () => "rotation",
    $rotate() {
      return ROTATIONS[this.direction] ?? null;
    },
  },
});

// A uniform is a property of the shader effect, by the name it has there.
export const UniformAnimator = defineType("UniformAnimator", Animator, {
  properties: { uniform: "" },
  methods: {
    $name() {
      return this.uniform;
    },
  },
});
