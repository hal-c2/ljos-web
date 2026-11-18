// What a binding makes as it reads a property's value, where nothing else
// reads that property: the binding is evaluated as it is read, the value is
// made inside that evaluation, and it is told it is complete once the
// binding is done, on either kernel.
//
// Item {
//     id: root
//     property bool asked: false
//     Holder { id: holder; part: root.asked ? root.made : null }
//     property Component made: Component {
//         Item {
//             implicitHeight: root.asked ? 30 : 0
//             onImplicitHeightChanged: log.push("value first")
//             Component.onCompleted: log.push("value completed")
//             Component.onDestruction: log.push("value destroyed")
//         }
//     }
//     property int read: {
//         if (!asked) return 0
//         const height = holder.part.implicitHeight
//         log.push("binding returned")
//         return height
//     }
// }
//
// `Holder` is a nonvisual object with a control's kind of part: given a
// Component, it makes the object itself. Nothing draws it, so nothing but
// `read` follows `part`.
import { $component, $define, $object, $signal, defineType, QtObject } from "ljos-web/object";
import { Item } from "ljos-web/QtQuick";
import { parts } from "../../QtQuick/Templates/parts.js";
import { make } from "../scene.js";

const Holder = defineType("Holder", QtObject, { properties: { part: parts } });

export const objects = { log: [] };

export default function MadeValue() {
  const { log } = objects;
  const root = (objects.root = $object());
  const holder = (objects.holder = $object());
  const [asked, setAsked] = $signal(false);
  const made = $component(() =>
    make(Item, {
      get implicitHeight() {
        return asked() ? 30 : 0;
      },
      onImplicitHeightChanged: () => log.push("value first"),
      Component$onCompleted: () => log.push("value completed"),
      Component$onDestruction: () => log.push("value destroyed"),
    }),
  );
  const [read, setRead] = $signal(() => {
    if (!asked()) return 0;
    const height = holder.part.implicitHeight;
    log.push("binding returned");
    return height;
  });
  const item = make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(Holder, {
      $self: holder,
      get part() {
        return asked() ? made : null;
      },
    }),
  ]);
  return $define(item, { asked: [asked, setAsked], read: [read, setRead] });
}
