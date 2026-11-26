// A face of Ljos.Ui (index.js says what a face is), in a module of its own
// so that only a page that names it loads the type it faces.
import { defineType, QtObject } from "../../object.ts";
import { Drag as DragAttachedSource } from "../../QtQuick/Drag.js";

// Qt's attached `Drag`, called `DragSource`: what carries data to a
// `DropArea`, where `Drag` above is the gesture that moves an item. It
// is the one attached object by both names: what a file says by
// `DragSource.` is put under `Drag.` before the object is made.
export const DragSource = /* @__PURE__ */ dragSource();
function dragSource() {
  const Type = defineType("DragSource", QtObject, { enums: DragAttachedSource.enums });
  Type.attached = (self) => {
    const props = self?.$props;
    if (props) {
      for (const key of Object.keys(props)) {
        if (!key.startsWith("DragSource$")) continue;
        const own = `Drag$${key.slice("DragSource$".length)}`;
        if (!Object.hasOwn(props, own)) Object.defineProperty(props, own, Object.getOwnPropertyDescriptor(props, key));
        delete props[key];
      }
      if (props.$attach) props.$attach = props.$attach.map((type) => (type === Type ? DragAttachedSource : type));
    }
    return DragAttachedSource.attached(self);
  };
  return Type;
}
