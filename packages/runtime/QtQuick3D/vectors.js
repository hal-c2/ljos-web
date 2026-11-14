// A vector an object holds whose members a file sets, binds and animates
// one by one (`emissiveFactor.x: 3`, `boxSize.z: 7500`) and a program reads
// as one: a group that is also a vector, as a node's `scale` is. The
// property is declared `group({ x: 0, y: 0, z: 0 })` and named here.
//
// Assigning the vector assigns its members, whatever they were bound to,
// as in Qt.
import { settle, slot } from "../object.ts";
import { Vector3d } from "../QtQml/values.ts";

const AXES = ["x", "y", "z"];

export function vectors(Type, ...names) {
  for (const name of names) {
    const view = Object.create(Vector3d.prototype);
    // What a property is given of it: the vector as it is now.
    view.$copy = function () {
      return new Vector3d(this.x, this.y, this.z);
    };
    view.toJSON = function () {
      return { x: this.x, y: this.y, z: this.z };
    };
    for (const axis of AXES) {
      const key = `${name}$${axis}`;
      Object.defineProperty(view, axis, {
        get() {
          return slot(this.$self, key).get();
        },
        set(value) {
          slot(this.$self, key).set(value);
        },
        enumerable: true,
      });
    }
    Object.defineProperty(Type.proto, name, {
      ...Object.getOwnPropertyDescriptor(Type.proto, name),
      get() {
        return (this.$groups[name] ??= Object.create(view, { $self: { value: this } }));
      },
      set(value) {
        for (const axis of AXES) slot(this, `${name}$${axis}`).write(Number(value?.[axis]) || 0);
        settle();
      },
    });
  }
}
