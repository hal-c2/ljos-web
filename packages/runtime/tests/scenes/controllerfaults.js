// Controllers whose module throws, one connected to only later, and a
// gesture destroyed, as `qmlc` emits them:
//
// import Ljos.Core
// import Ljos.Ui
// import "faults.ts"
// Item {
//     id: root; width: 200; height: 100
//     Throws { id: throws }
//     Controller { id: after; onAttached: log.push("after attached") }
//     Controller { id: late }
//     Tap { id: tap; onTapped: root.taps = root.taps + 1; onDetached: log.push("tap detached") }
// }
//
// with faults.ts:
//
// export const Throws = controller({
//   attached: () => { throw new Error("thrown in attached") },
//   updated: () => { updates += 1; if (updates === 1) throw new Error("thrown in updated") },
//   detached: () => { throw new Error("thrown in detached") },
// })
import { $object } from "ljos-web/object";
import { Controller, controller } from "ljos-web/Ljos/Core";
import { Item, Tap } from "ljos-web/Ljos/Ui";
import { make } from "../scene.js";

const names = ["root", "throws", "after", "late", "tap"];
export const objects = { log: [], updates: 0, taps: 0 };

const Throws = controller({
  attached: () => {
    throw new Error("thrown in attached");
  },
  updated: () => {
    objects.updates += 1;
    if (objects.updates === 1) throw new Error("thrown in updated");
  },
  detached: () => {
    throw new Error("thrown in detached");
  },
});

export default function ControllerFaults() {
  for (const name of names) objects[name] = $object();
  const { log, root } = objects;
  return make(Item, { $self: root, width: 200, height: 100 }, () => [
    make(Throws, { $self: objects.throws }),
    make(Controller, { $self: objects.after, onAttached: () => log.push("after attached") }),
    make(Controller, { $self: objects.late }),
    make(Tap, {
      $self: objects.tap,
      onTapped: () => (objects.taps += 1),
      onDetached: () => log.push("tap detached"),
    }),
  ]);
}
