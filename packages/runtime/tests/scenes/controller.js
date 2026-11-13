// Controllers, as `qmlc` emits them for `import Ljos.Core` (ljos-ui's
// `features/components/controller.feature`):
//
// import Ljos.Core
// import Ljos.Ui
// import "breakpoint.ts"
// Item {
//     id: root; width: 200; height: 100
//     property int ready: 0
//     Component.onCompleted: ready = 1
//     Controller {
//         id: outer
//         onAttached: (host) => log.push(`attached ${host === root} ${root.ready}`)
//         onDetached: log.push("outer detached")
//         Controller { id: inner; onAttached: (host) => log.push(`inner ${host === root}`) }
//     }
//     Controller {
//         id: watching
//         onUpdated: { log.push("updated"); root.seen = root.seen + 1 }
//     }
//     Tap { id: tap; onAttached: (host) => log.push(`tap ${host === root}`) }
//     Controller { id: holding; Tap { onTapped: root.taps = root.taps + 1 } }
//     Breakpoint { id: wide }
//     Loader { id: loader; component: Item { Controller { … } } }
// }
//
// with breakpoint.ts:
//
// export const Breakpoint = controller({
//   properties: { at: 150 },
//   bindings: { wide: (host, self) => host.width > self.at },
//   attached: (host) => { log.push("breakpoint attached"); return () => log.push("breakpoint cleanup") },
//   detached: () => log.push("breakpoint detached"),
// })
import { $component, $define, $object, $signal } from "ljos-web/object";
import { Controller, controller } from "ljos-web/Ljos/Core";
import { Item, Loader, Tap } from "ljos-web/Ljos/Ui";
import { make } from "../scene.js";

const names = ["root", "outer", "inner", "watching", "tap", "holding", "wide", "loader", "loaded"];
export const objects = { log: [], ready: 0, taps: 0 };

const Breakpoint = controller({
  properties: { at: 150 },
  bindings: { wide: (host, self) => host.width > self.at },
  attached: () => {
    objects.log.push("breakpoint attached");
    return () => objects.log.push("breakpoint cleanup");
  },
  detached: () => objects.log.push("breakpoint detached"),
});
objects.controller = controller;

export default function Controllers() {
  for (const name of names) objects[name] = $object();
  const { log, root } = objects;
  const [seen, setSeen] = $signal(0);
  const loads = $component(() =>
    make(Item, { width: 10, height: 10 }, () =>
      make(Controller, {
        $self: objects.loaded,
        onAttached: () => log.push("loaded attached"),
        onDetached: () => log.push("loaded detached"),
      }),
    ),
  );
  const made = make(
    Item,
    {
      $self: root,
      width: 200,
      height: 100,
      Component$onCompleted: () => (objects.ready = 1),
    },
    () => [
      make(
        Controller,
        {
          $self: objects.outer,
          onAttached: (host) => log.push(`attached ${host === root} ${objects.ready}`),
          onDetached: () => log.push("outer detached"),
        },
        () => make(Controller, { $self: objects.inner, onAttached: (host) => log.push(`inner ${host === root}`) }),
      ),
      make(Controller, {
        $self: objects.watching,
        onUpdated: () => {
          log.push("updated");
          root.seen = root.seen + 1;
        },
      }),
      make(Tap, { $self: objects.tap, onAttached: (host) => log.push(`tap ${host === root}`) }),
      make(Controller, { $self: objects.holding }, () => make(Tap, { onTapped: () => (objects.taps += 1) })),
      make(Breakpoint, { $self: objects.wide }),
      make(Loader, { $self: objects.loader, y: 50, component: loads }),
    ],
  );
  return $define(made, { seen: [seen, setSeen] });
}
