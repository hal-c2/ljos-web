// `import Qt.labs.synchronizer`: two properties kept at one value, whichever
// of them changes.
import { defineType, effect, QtObject } from "../../../object.js";
import { untrack } from "#kernel";

// A property by the name the compiler gives it: `value`, or `anchors$margins`
// for one of a group.
function place(object, name) {
  if (!object || !name) return null;
  const path = String(name).split("$");
  const last = path.pop();
  let holder = object;
  for (const step of path) holder = holder?.[step];
  if (holder == null || typeof holder !== "object" || !(last in holder)) return null;
  return { object, name: String(name).replaceAll("$", "."), holder, last };
}

const read = (at) => at.holder[at.last];

// Gives `value` to `to` and says what became of it: taken, turned into
// something else (bounced), or left as it was (ignored).
function give(self, to, value) {
  const before = untrack(() => read(to));
  to.holder[to.last] = value;
  const after = untrack(() => read(to));
  // A property may keep what it is given as its own kind of value (`"#ff0000"`
  // as a colour): compared as QML's `==` compares them, that is the same.
  if (!Object.is(after, value) && after != value) {
    if (Object.is(after, before)) self.valueIgnored(to.object, to.name);
    else self.valueBounced(to.object, to.name);
  }
  return after;
}

export const Synchronizer = defineType("Synchronizer", QtObject, {
  properties: { sourceObject: null, sourceProperty: "", targetObject: null, targetProperty: "" },
  signals: ["valueBounced", "valueIgnored"],
  setup(self, props) {
    // `Synchronizer on width {}`: the property it is on is its target.
    const targetObject = () => self.targetObject ?? props.$target ?? null;
    const targetProperty = () => self.targetProperty || props.$property || "";
    // The two it keeps equal, and the value each had when it last looked:
    // the one that has another since is the one that changed.
    let held = null;
    let begun = false;
    let missing = "";
    effect(
      () => {
        const ends = [
          [self.sourceObject, self.sourceProperty],
          [targetObject(), targetProperty()],
        ];
        const [source, target] = ends.map(([object, name]) => place(object, name));
        return { ends, source, target, values: [source ? read(source) : undefined, target ? read(target) : undefined] };
      },
      ({ ends, source, target, values }) => {
        for (const [object, name] of ends) {
          if (!object || !name || place(object, name)) continue;
          if (missing !== name) console.warn(`Synchronizer: Target object has no property called ${name}`);
          missing = name;
        }
        if (!source || !target) {
          held = null;
          begun = true;
          return;
        }
        const same =
          held?.source.object === source.object &&
          held.source.name === source.name &&
          held.target.object === target.object &&
          held.target.name === target.name;
        if (!same) {
          // What the source has is given to the target when the two are
          // there from the start; brought together later, as Qt has it, they
          // are left as they are until one changes.
          held = { source, target, values: begun ? values : [values[0], give(self, target, values[0])] };
        } else if (!Object.is(values[0], held.values[0])) {
          held = { source, target, values: [values[0], give(self, target, values[0])] };
        } else if (!Object.is(values[1], held.values[1])) {
          held = { source, target, values: [give(self, source, values[1]), values[1]] };
        }
        begun = true;
      },
    );
  },
});
