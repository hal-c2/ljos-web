// Binding: gives a property of another object a value for as long as `when`
// holds, and gives back what it had after.
import { createMemo, createRenderEffect, createRoot, runWithOwner } from "solid-js";
import { defineType, flush, QtObject, slot, whenComplete } from "../object.js";
import { follow } from "./animation/Animation.js";
import { later } from "./animation/clock.js";
import { Property } from "./animation/property.js";
import { untrack } from "#kernel";

const SYNC = { sync: true };

const RESTORE_BINDING = 1;
const RESTORE_VALUE = 2;

const slotted = (property) => !property || property.slot !== null;

function put(target, from) {
  target.bound = from.bound;
  target.assigned = from.assigned;
  target.value = from.value;
  target.changed();
}

const restores = (self, saved) =>
  (self.restoreMode & (saved.bound !== null && !saved.assigned ? RESTORE_BINDING : RESTORE_VALUE)) !== 0;

function release(self) {
  const held = self.$held;
  if (!held) return;
  self.$held = null;
  const { property, saved } = held;
  const target = property.slot;
  if (!target) {
    held.live = false;
    held.dispose();
    if (untrack(() => self.restoreMode) & RESTORE_VALUE) property.object[property.key] = saved.value;
    return;
  }
  // Not restored, it keeps the value it has now, as one of its own.
  if (untrack(() => restores(self, saved))) put(target, saved);
  else put(target, { bound: null, assigned: true, value: held.last });
}

function hold(self, property) {
  const { object, key } = property;
  const target = property.slot;
  const value = slot(self, "value");
  if (target) {
    const saved = { bound: target.bound, assigned: target.assigned, value: target.value };
    const held = (self.$held = { property, saved, live: true, dispose: null, last: untrack(() => value.get()) });
    const when = slot(self, "when");
    // Once `when` no longer holds the property reads as it will when that
    // has been acted on, so that nothing sees it between the two.
    const bound = () => {
      if (when.get()) return (held.last = value.get());
      if (!restores(self, saved)) return held.last;
      return saved.assigned ? saved.value : saved.bound ? saved.bound() : target.given;
    };
    put(target, { bound, assigned: false, value: undefined });
    return;
  }
  // A property a component declares can only be assigned to.
  const held = (self.$held = { property, saved: { value: property.get() }, live: true, dispose: null });
  held.dispose = runWithOwner(self.$owner, () =>
    createRoot((dispose) => {
      follow(
        createMemo(() => value.get(), SYNC),
        (given) => {
          if (held.live) object[key] = given;
        },
      );
      return dispose;
    }),
  );
}

export const Binding = defineType("Binding", QtObject, {
  properties: {
    target: undefined,
    property: "",
    value: undefined,
    when: true,
    restoreMode: 3,
  },
  enums: {
    RestoreNone: 0,
    RestoreBinding: 1,
    RestoreValue: 2,
    RestoreBindingOrValue: 3,
  },
  setup(self) {
    self.$held = null;
    whenComplete(() =>
      createRenderEffect(
        () => [self.when ? self.target : null, self.property],
        ([object, name]) => {
          const property = object != null && name ? new Property(object, name) : null;
          const change = () => {
            release(self);
            if (property?.valid) hold(self, property);
          };
          // A slot is given its binding here and now, so that nothing sees
          // the property between two values. An assignment settles what
          // depends on it, which cannot be done from in here.
          if (slotted(self.$held?.property) && slotted(property)) return change();
          later(() => {
            change();
            flush();
          });
        },
      ),
    );
  },
});
