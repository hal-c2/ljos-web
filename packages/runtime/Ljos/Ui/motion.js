// Reduced motion as Ljós has it, for the animations of a file in Ljós's
// API. It is there for people whom movement on a screen makes dizzy or
// sick (WCAG 2.2 SC 2.3.3), and it reduces movement rather than removing
// it: what an animation would slide, grow or turn still goes there, so
// the reader can follow where it went, but calmly. A curve that goes past
// its end, springs back or bounces is traded for a plain ease of the same
// length, and a spring never swings past where it goes. Nothing jumps.
// A fade or a change of colour moves nothing and shows that something
// changed, so it stays, at most FADE_MAX long. A run that never ends
// keeps its pace: it says something is busy, and stopped it would say
// nothing.
//
// QML as Qt has it leaves reduced motion to the program (it reads
// `Qt.styleHints.accessibility`), so QtQuick's own types are untouched:
// these are faces of them that only Ljós's API names.
//
// The reader's wish is asked when a run starts; one under way when it
// changes ends as it began.
import { defineType } from "../../object.ts";
import { lessMotion } from "../../QtQml/application.ts";
import { curve } from "../../QtQuick/animation/easing.js";
import { rgba } from "../../QtQuick/animation/property.js";

// ljos-ui's `REDUCED_FADE_MAX_MS`.
export const FADE_MAX = 150;

// Easing.InOutSine: it starts and stops softly and stays between its ends.
const PLAIN = curve(19, 1, 1.70158, 0.3);

const fades = (action) => action.property.key === "opacity" || (typeof action.to !== "number" && rgba(action.to) !== null);

// In a group, it is the group's loops that say whether the run ends.
function endless(animation) {
  for (let at = animation; at?.$anim; at = at.$group) if (at.loops < 0) return true;
  return false;
}

// Whether a curve keeps to its ends and only goes forward: then it is
// calm already, whatever its name (a Bézier curve can be either).
const SAMPLES = 64;
function steady(ease) {
  let last = 0;
  for (let step = 1; step <= SAMPLES; step++) {
    const at = ease(step / SAMPLES);
    if (!(at >= last - 1e-9) || at > 1 + 1e-9) return false;
    last = at;
  }
  return true;
}

// `Base` as Ljós's API has it: the same animation, calm when asked to be.
function calmed(name, Base) {
  const proto = Base.proto;
  const make = proto.$make;
  const methods = {
    $make(actions, modified, reverse, defaultTarget) {
      const job = make.call(this, actions, modified, reverse, defaultTarget);
      if (!lessMotion() || endless(this) || !job.actions) return job;
      if (job.actions.every(fades)) job.length = Math.min(FADE_MAX, job.length);
      else if (!steady(job.ease)) job.ease = PLAIN;
      return job;
    },
  };
  // A spring or a glide that follows its value: told each time it is
  // given a new end whether it may swing past it.
  if (proto.$tune) {
    const tune = proto.$tune;
    methods.$tune = function (job, action) {
      tune.call(this, job, action);
      job.noOvershoot = lessMotion() && !endless(this);
      // A spring damped a little past critical comes to rest without
      // swinging; the stop at its end (SpringJob) only catches what a
      // 16 ms step leaves over. Its velocity grows by spring × distance
      // ÷ mass each step and moves it a 62.5th of that, so critical is
      // 2·√(spring × mass ÷ 62.5).
      if (job.noOvershoot && job.spring > 0) job.damping = Math.max(job.damping, Math.min(1, 1.1 * 2 * Math.sqrt((job.spring * job.mass) / 62.5)));
    };
  }
  return defineType(name, Base, { methods });
}

export { calmed };
