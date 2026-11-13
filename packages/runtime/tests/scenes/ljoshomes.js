// What Qt's `Qt` object held, from where Ljós's API has it: `Ljos.Core`
// and `Ljos.Ui` (ljos-ui's `features/language/no-qt-global.feature`). The
// modules are the scene's objects, so a test calls them as a file would.
//
// import Ljos.Ui
// import Ljos.Core
// Item {
//     Item { id: base; width: 3 }
//     Item { id: twice }
// }
import * as core from "ljos-web/Ljos/Core";
import * as ui from "ljos-web/Ljos/Ui";
import { $object } from "ljos-web/object";
import { make } from "../scene.js";

export const objects = { core, ui };

export default function LjosHomes() {
  for (const name of ["root", "base", "twice"]) objects[name] = $object();
  return make(ui.Item, { $self: objects.root, width: 200, height: 100 }, () => [
    make(ui.Item, { $self: objects.base, width: 3, height: 10 }),
    make(ui.Item, { $self: objects.twice, height: 10 }),
  ]);
}
