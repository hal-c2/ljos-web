// Reduced motion as Ljós has it (ljos-ui's ARCHITECTURE §14 and
// `ljos_quick`'s animation/motion.rs), for the animations of a file in
// Ljós's API. It is there for people whom movement on a screen makes
// dizzy or sick (WCAG 2.2 SC 2.3.3): asked for less motion, what an
// animation would slide, grow or turn is at its end at once, and so is a
// number of the program's own, which may well place something. A fade or
// a change of colour moves nothing and shows that something changed, so
// it stays, at most FADE_MAX long. A run that never ends keeps its pace:
// it says something is busy, and stopped it would say nothing.
//
// QML as Qt has it leaves reduced motion to the program (it reads
// `Qt.styleHints.accessibility`), so QtQuick's own types are untouched:
// these are faces of them that only Ljós's API names.
//
// The reader's wish is asked when a run starts; one under way when it
// changes ends as it began.
import { defineType } from "../../object.ts";
import { lessMotion } from "../../QtQml/application.ts";
import { AnimatorJob, put, STOPPED } from "../../QtQuick/animation/jobs.js";
import { rgba } from "../../QtQuick/animation/property.js";

// ljos-ui's `REDUCED_FADE_MAX_MS`.
export const FADE_MAX = 150;

const NONE = Object.freeze([]);

const fades = (action) => action.property.key === "opacity" || (typeof action.to !== "number" && rgba(action.to) !== null);

// In a group, it is the group's loops that say whether the run ends.
function endless(animation) {
  for (let at = animation; at?.$anim; at = at.$group) if (at.loops < 0) return true;
  return false;
}

// What moves is put at its end as the run starts, and what fades fades.
class CalmJob extends AnimatorJob {
  constructor(length, ease, fading, moving) {
    super(length, ease, fading);
    this.moving = moving;
    this.placed = false;
  }

  updateTime(time) {
    if (this.state !== STOPPED && !this.placed) {
      this.placed = true;
      for (const action of this.moving) put(action, action.to);
    }
    super.updateTime(time);
  }

  loopStarted() {
    super.loopStarted();
    this.placed = false;
  }
}

function calm(self, mine, reverse) {
  const fading = mine.filter(fades);
  const moving = fading.length ? mine.filter((action) => !fading.includes(action)) : mine;
  const length = fading.length ? Math.min(FADE_MAX, Math.max(0, self.duration > 0 ? self.duration : FADE_MAX)) : 0;
  const job = new CalmJob(length, self.$curve(), fading.length ? fading : NONE, moving);
  job.fromDefined = self.from !== undefined;
  job.mirrored = reverse;
  // What it was made from, to tell when that has changed (PropertyAnimation's `$stale`).
  job.said = [self.duration, self.from, self.to];
  return job;
}

// `Base` as Ljós's API has it: the same animation, calm when asked to be.
function calmed(name, Base) {
  const make = Base.proto.$make;
  return defineType(name, Base, {
    methods: {
      $make(actions, modified, reverse, defaultTarget) {
        if (!lessMotion() || endless(this)) return make.call(this, actions, modified, reverse, defaultTarget);
        // A spring or a glide still under way stops where it is: from
        // here on the property is put, not pulled.
        for (const job of this.$active ?? NONE) job.stop();
        if (this.$active) this.$active = NONE;
        return calm(this, this.$select(actions, modified, defaultTarget), reverse);
      },
    },
  });
}

export { calmed };
