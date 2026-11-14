// Controllers of one host that write to it, as `qmlc` emits them for
// `import Ljos.Core` (ljos-ui's `features/components/controller.feature`):
//
// import Ljos.Core
// import Ljos.Ui
// Item {
//     id: root; width: 200; height: 100
//     property int moved: 0
//     property int counted: 0
//     Controller { id: one; onUpdated: root.implicitWidth = root.implicitWidth + 1 }
//     Controller { id: two; onUpdated: root.implicitHeight = root.implicitHeight + 1 }
//     Controller { id: counting; onUpdated: { log.push(`moved ${root.moved}`); root.counted = root.counted + 1 } }
// }
//
// Each of `one` and `two` stops writing after 50 updates, so a pair that
// kept arming each other ends, and says so in its count.
import { $define, $object, $signal } from "ljos-web/object";
import { Controller } from "ljos-web/Ljos/Core";
import { Item } from "ljos-web/Ljos/Ui";
import { make } from "../scene.js";

const names = ["root", "one", "two", "counting"];
export const objects = { log: [], ones: 0, twos: 0 };

const CAP = 50;

export default function ControllerPair() {
  for (const name of names) objects[name] = $object();
  const { log, root } = objects;
  const [moved, setMoved] = $signal(0);
  const [counted, setCounted] = $signal(0);
  const made = make(Item, { $self: root, width: 200, height: 100 }, () => [
    make(Controller, {
      $self: objects.one,
      onUpdated: () => {
        if (++objects.ones <= CAP) root.implicitWidth = root.implicitWidth + 1;
      },
    }),
    make(Controller, {
      $self: objects.two,
      onUpdated: () => {
        if (++objects.twos <= CAP) root.implicitHeight = root.implicitHeight + 1;
      },
    }),
    make(Controller, {
      $self: objects.counting,
      onUpdated: () => {
        log.push(`moved ${root.moved}`);
        root.counted = root.counted + 1;
      },
    }),
  ]);
  return $define(made, { moved: [moved, setMoved], counted: [counted, setCounted] });
}
