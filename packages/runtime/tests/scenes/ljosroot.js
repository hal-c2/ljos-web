// `import Ljos`: a translated Window menu that says which menu it is, and
// the types of the module the web has none of yet (ljosui.spec.js).
//
// import Ljos.Ui
// import Ljos
// Item {
//     width: 400; height: 300
//     Item { id: menu; SystemMenu.role: SystemMenu.WindowRole }
// }
import { $object } from "ljos-web/object";
import { ErrorBoundary, SelectionScope, SystemMenu } from "ljos-web/Ljos";
import { Item } from "ljos-web/Ljos/Ui";
import { make } from "../scene.js";

const menu = $object();

export const objects = { menu, ErrorBoundary, SelectionScope, SystemMenu, make };

export default () => make(Item, { width: 400, height: 300 }, () => [make(Item, { $self: menu, SystemMenu$role: SystemMenu.WindowRole })]);
