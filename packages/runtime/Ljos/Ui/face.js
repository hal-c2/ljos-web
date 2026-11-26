// How Ljos.Ui makes its faces (index.js says what a face is): the
// helpers its modules share.
import { defineType, derived, slot } from "../../object.ts";
import { destroying, hostOf, live } from "../Core/controller.js";

// Puts what `props` says by a dialect name under the name the type has,
// handler included, keeping the binding (the descriptor) as it is. Runs
// in the face's `setup`, before anything has read a property of the
// object, so the slot the value belongs to takes it under its own name.
function renamed(props, renames) {
  for (const [dialect, own] of Object.entries(renames)) {
    for (const [from, to] of [
      [dialect, own],
      [`on${dialect[0].toUpperCase()}${dialect.slice(1)}Changed`, `on${own[0].toUpperCase()}${own.slice(1)}Changed`],
    ]) {
      const descriptor = Object.getOwnPropertyDescriptor(props, from);
      if (!descriptor || Object.hasOwn(props, to)) continue;
      Object.defineProperty(props, to, descriptor);
      delete props[from];
    }
  }
}

// A face of `Base`, called `name`, with `renames` (Ljós's name: the
// type's) as its only difference. On its objects each of Ljós's names is
// the slot of the name it replaces, to read, to write, to hear of and to
// animate (`slot(item, "fill")` is `slot(item, "color")`).
export function face(name, Base, renames = {}) {
  const Type = defineType(name, Base, {
    setup(self, props) {
      renamed(props, renames);
    },
  });
  for (const [dialect, own] of Object.entries(renames)) {
    if (!(own in Base.slots)) continue;
    Type.slots[dialect] = (self) => (self.$slots[dialect] = slot(self, own));
    Object.defineProperty(Type.proto, dialect, {
      get() {
        return this[own];
      },
      set(value) {
        this[own] = value;
      },
      enumerable: true,
      configurable: true,
    });
    const changed = `${dialect}Changed`;
    if (!Object.hasOwn(Type.proto, changed)) {
      Object.defineProperty(Type.proto, changed, {
        get() {
          return this[`${own}Changed`];
        },
        configurable: true,
      });
    }
  }
  if (Base.attached) Type.attached = Base.attached;
  return Type;
}

// What a pointer handler accepts is what a gesture takes: the buttons,
// modifiers, devices and kinds of pointer it answers.
const GESTURE = {
  buttons: "acceptedButtons",
  modifiers: "acceptedModifiers",
  devices: "acceptedDevices",
  pointerTypes: "acceptedPointerTypes",
};
//
// A gesture is a Controller: its `host` is the item it acts on, and it is
// `attached(host)` and `detached()` as one is. It stays the handler it
// faces, so it listens on the host's element as that handler does.
export function gesture(name, Base) {
  const Face = face(
    name,
    Base,
    Object.fromEntries(Object.entries(GESTURE).filter(([, own]) => own in Base.slots)),
  );
  const Type = defineType(name, Face, {
    properties: { host: derived((self) => hostOf(self)) },
    signals: ["attached", "detached", "updated"],
    methods: { destroy: destroying(Face) },
    setup(self) {
      Object.defineProperty(self, "$gesture", { value: true });
      live(self);
    },
  });
  if (Face.attached) Type.attached = Face.attached;
  return Type;
}
