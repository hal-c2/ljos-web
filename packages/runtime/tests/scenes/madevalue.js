// What a binding makes as it reads a property's value, where nothing else
// reads that property: the binding is evaluated as it is read, the value is
// made inside that evaluation, and it is told it is complete once the
// binding is done, on either kernel.
//
// Item {
//     id: root
//     property bool asked: false
//     property int again: 0
//     Holder { id: holder; part: root.again, root.asked ? root.made : null }
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
// `read` follows `part`. Writing `again` evaluates `part` once more, which
// ends the value it made before and makes another. `values` says what each
// value was told, by the number it was made as.
import { $component, $define, $object, $signal, defineType, QtObject } from "ljos-web/object";
import { Item } from "ljos-web/QtQuick";
import { parts } from "../../QtQuick/Templates/parts.js";
import { make } from "../scene.js";

const Holder = defineType("Holder", QtObject, { properties: { part: parts } });

export const objects = { log: [], values: [] };

export default function MadeValue() {
  const { log, values } = objects;
  let count = 0;
  const root = (objects.root = $object());
  const holder = (objects.holder = $object());
  const [asked, setAsked] = $signal(false);
  const [again, setAgain] = $signal(0);
  const made = $component(() => {
    const value = ++count;
    const told = (what) => {
      log.push(`value ${what}`);
      values.push(`${value} ${what}`);
    };
    return make(Item, {
      get implicitHeight() {
        return asked() ? 30 : 0;
      },
      onImplicitHeightChanged: () => told("first"),
      Component$onCompleted: () => told("completed"),
      Component$onDestruction: () => told("destroyed"),
    });
  });
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
        again();
        return asked() ? made : null;
      },
    }),
  ]);
  return $define(item, { asked: [asked, setAsked], again: [again, setAgain], read: [read, setRead] });
}
