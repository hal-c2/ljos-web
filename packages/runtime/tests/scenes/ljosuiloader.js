// A `Loader` by its dialect name for what it shows (`component`), and
// `font.size` on a control's font, its own and inherited from a Pane.
//
// import Ljos.Ui
// import QtQuick.Controls
// Item {
//     width: 400; height: 300
//     component Rect: Rectangle { width: 60; height: 30; fill: "tomato" }
//     Loader { id: loader; component: Rect }
//     Pane {
//         y: 100; font.size: 20
//         Label { id: inherited; text: "inherited" }
//     }
//     Label { id: direct; y: 200; text: "direct"; font.size: 24 }
// }
import { $component, $object } from "ljos-web/object";
import { Item, Loader, Rectangle } from "ljos-web/Ljos/Ui";
import "ljos-web/QtQuick/Controls/Basic";
import { Label, Pane } from "ljos-web/QtQuick/Templates";
import { make } from "../scene.js";

export const objects = { log: [] };

export default function LjosUiLoader() {
  for (const name of ["root", "loader", "pane", "inherited", "direct", "nearPixels", "nearPoints", "nearSize", "both"]) {
    objects[name] = $object();
  }
  const { log, root, loader, pane, inherited, direct, nearPixels, nearPoints, nearSize, both } = objects;
  const rect = $component(() => make(Rectangle, { width: 60, height: 30, fill: "tomato" }));
  return make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(Loader, {
      $self: loader,
      component: rect,
      onComponentChanged: () => log.push("component changed"),
      onLoaded: () => log.push(`loaded ${loader.item.width}`),
    }),
    make(Pane, { $self: pane, y: 100, font$size: 20 }, () => make(Label, { $self: inherited, text: "inherited" })),
    make(Label, { $self: direct, y: 200, text: "direct", font$size: 24 }),
    // The three names for a size, mixed over the Panes around a Label:
    // what the nearest Pane said is the Label's, by whichever name.
    make(Pane, { font$size: 30 }, () =>
      make(Pane, { font$pixelSize: 12 }, () => make(Label, { $self: nearPixels, text: "near pixels" })),
    ),
    make(Pane, { font$size: 30 }, () =>
      make(Pane, { font$pointSize: 9 }, () => make(Label, { $self: nearPoints, text: "near points" })),
    ),
    make(Pane, { font$pixelSize: 30 }, () =>
      make(Pane, { font$size: 12 }, () => make(Label, { $self: nearSize, text: "near size" })),
    ),
    make(Pane, { font$size: 24, font$pixelSize: 10 }, () => make(Label, { $self: both, text: "both" })),
  ]);
}
