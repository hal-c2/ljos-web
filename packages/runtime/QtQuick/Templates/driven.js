// A property its type changes itself while the QML may bind it: a
// container's `currentIndex`, which a swipe moves, a scroll bar's
// `position`, which a drag does. In Qt the type's setter leaves the binding
// where it is, and the property is whichever of the two changed last. A
// slot's assignment would end the binding, so the value is kept here and the
// slot only says what the QML gives.
import { effect, settle, slot } from "../../object.js";
import { signal } from "#kernel";

const next = (version) => version + 1;

// Declares one, in `setup`: `initial` is what it is until either says. The
// type declares the property with no default and `reads(name)` to resolve
// it.
export function driven(self, name, initial) {
  const [version, bump] = signal(0, self.$owner);
  const held = ((self.$driven ??= {})[name] = { value: initial, seen: undefined, version, bump });
  effect(
    () => {
      const given = slot(self, name);
      given.explicit();
      return given.own();
    },
    (value) => {
      if (value === undefined || Object.is(value, held.seen)) return;
      held.seen = value;
      drive(self, name, value);
    },
  );
}

export const reads = (name) => (self) => {
  const held = self.$driven[name];
  held.version();
  return held.value;
};

// The type's own change. Whether it was one.
export function drive(self, name, value) {
  const held = self.$driven[name];
  if (Object.is(held.value, value)) return false;
  held.value = value;
  held.bump(next);
  return true;
}

// An assignment ends the binding as it does for any property, and is a
// change even of what was assigned before: the type may have moved since.
export function assignable(Type, name) {
  Object.defineProperty(Type.proto, name, {
    ...Object.getOwnPropertyDescriptor(Type.proto, name),
    set(value) {
      slot(this, name).write(value);
      if (typeof value !== "function") {
        this.$driven[name].seen = value;
        drive(this, name, value);
      }
      settle();
    },
  });
}
