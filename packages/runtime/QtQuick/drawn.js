import { signal } from "#kernel";
// What is drawn of an object while an animator has it. Qt's animators move
// an item where the scene is drawn and tell the property where it got to
// only when they end, so whatever draws one of these properties asks here
// first: an item's place, scale, turn and opacity, a shader's uniforms.

const next = (version) => version + 1;

// All that is drawn otherwise than the properties say, or nothing.
export function drawing(self) {
  self.$track();
  const drawn = self.$drawn;
  if (!drawn) return null;
  drawn.track();
  return drawn.values;
}

// What is drawn for a property: what an animator shows, or what it says.
export function drawn(self, key) {
  const value = drawing(self)?.[key];
  return value === undefined ? self[key] : value;
}

// Draws `value` for a property, or with none what the property says again.
export function draw(self, key, value) {
  let drawn = self.$drawn;
  if (!drawn) {
    if (value === undefined) return;
    const [track, touch] = signal(0, self.$owner);
    drawn = self.$drawn = { values: null, track, touch };
    self.$touch(next);
  }
  // Several animators may have the object in one frame, so what they say is
  // kept here and the signal only says that it changed.
  const values = drawn.values;
  if (value !== undefined) {
    if (values?.[key] === value) return;
    drawn.values = { ...values, [key]: value };
  } else {
    if (!values || !(key in values)) return;
    const { [key]: gone, ...rest } = values;
    drawn.values = Object.keys(rest).length ? rest : null;
  }
  drawn.touch(next);
}
