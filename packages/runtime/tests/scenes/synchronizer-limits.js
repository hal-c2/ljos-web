// import QtQuick
// import Qt.labs.synchronizer
// Item {
//     QtObject { id: wanted; property real amount: 50; property real fixed: 1 }
//     Dial { id: dial; to: 10 }
//     Synchronizer {
//         sourceObject: wanted; sourceProperty: "amount"; targetObject: dial; targetProperty: "value"
//         onValueBounced: (object, property) => log.push(["bounced", object === dial, property])
//         onValueIgnored: (object, property) => log.push(["ignored", object === dial, property])
//     }
//     Synchronizer {
//         id: second; sourceObject: wanted; sourceProperty: "fixed"; targetObject: dial; targetProperty: "sealed"
//         onValueIgnored: (object, property) => log.push(["ignored", object === dial, property])
//     }
// }
//
// `Dial` stands for a control: its value is never more than `to`, and
// `sealed` is what it is whatever it is given.
import { $object, defineType, QtObject } from "ljos-web/object";
import { Synchronizer } from "ljos-web/Qt/labs/synchronizer";
import { Item } from "ljos-web/QtQuick";
import { make } from "../scene.js";

const Dial = defineType("Dial", QtObject, {
  properties: { value: 0, to: 10, sealed: 7 },
  resolve: { value: (self, own) => Math.min(own(), self.to), sealed: () => 7 },
});

export const objects = { log: [] };

export default function Limits() {
  const { log } = objects;
  for (const name of ["wanted", "dial", "second"]) objects[name] = $object();
  const { wanted, dial, second } = objects;
  const told = (what) => (object, property) => log.push([what, object === dial, property]);
  return make(Item, { width: 100, height: 100 }, () => [
    make(QtObject, { $self: wanted, $declare: { properties: { amount: 0, fixed: 0 } }, amount: 50, fixed: 1 }),
    make(Dial, { $self: dial }),
    make(Synchronizer, {
      sourceObject: wanted,
      sourceProperty: "amount",
      targetObject: dial,
      targetProperty: "value",
      onValueBounced: told("bounced"),
      onValueIgnored: told("ignored"),
    }),
    make(Synchronizer, {
      $self: second,
      sourceObject: wanted,
      sourceProperty: "fixed",
      targetObject: dial,
      targetProperty: "sealed",
      onValueBounced: told("bounced"),
      onValueIgnored: told("ignored"),
    }),
  ]);
}
