// `Ljos.Layout`'s arrangements as a dialect file has them: a padded
// `Row`, a `Box` that turns, a `Grid` whose spacings follow `spacing`,
// and `Pages` showing one child at a time.
//
// import Ljos.Ui
// import Ljos.Layout
// Item {
//     width: 400; height: 300
//     Row {
//         id: padded; padding: 10; spacing: 5
//         Rectangle { width: 50; height: 20; fill: "tomato" }
//         Rectangle { width: 30; height: 20; fill: "seagreen" }
//     }
//     Box {
//         id: turning; y: 100; spacing: 5
//         Rectangle { width: 50; height: 20; fill: "gold" }
//         Rectangle { width: 50; height: 20; fill: "navy" }
//     }
//     Grid {
//         id: cells; y: 200; columns: 2; spacing: 7
//         Rectangle { width: 20; height: 10 }  // ×3
//     }
//     Pages {
//         id: pages; x: 200; width: 100; height: 50
//         Rectangle { fill: "red" }
//         Rectangle { fill: "blue" }
//     }
// }
import { $object } from "ljos-web/object";
import { Item, Rectangle } from "ljos-web/Ljos/Ui";
import { Box, Grid, Pages, Row } from "ljos-web/Ljos/Layout";
import { make } from "../scene.js";

const names = ["root", "padded", "a", "b", "turning", "c", "d", "cells", "g0", "g1", "g2", "pages", "p0", "p1"];
export const objects = {};

export default function LjosUiLayout() {
  for (const name of names) objects[name] = $object();
  const { root, padded, a, b, turning, c, d, cells, g0, g1, g2, pages, p0, p1 } = objects;
  const rect = (self, width, height, fill) => make(Rectangle, { $self: self, width, height, fill });
  return make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(Row, { $self: padded, padding: 10, spacing: 5 }, () => [rect(a, 50, 20, "tomato"), rect(b, 30, 20, "seagreen")]),
    make(Box, { $self: turning, y: 100, spacing: 5 }, () => [rect(c, 50, 20, "gold"), rect(d, 50, 20, "navy")]),
    make(Grid, { $self: cells, y: 200, columns: 2, spacing: 7 }, () => [
      rect(g0, 20, 10, "red"),
      rect(g1, 20, 10, "green"),
      rect(g2, 20, 10, "blue"),
    ]),
    make(Pages, { $self: pages, x: 200, width: 100, height: 50 }, () => [
      make(Rectangle, { $self: p0, fill: "red" }),
      make(Rectangle, { $self: p1, fill: "blue" }),
    ]),
  ]);
}
