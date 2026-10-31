// An entry whose theme is the `theme.json` beside it (`hot/`), which a test
// writes, changes and takes away while the page is open.
import { watchSingletons } from "ljos-web/object";
import Themed from "./hot/Themed.qml";

const singletons = {};
watchSingletons((name, object) => (singletons[name] = object));
window.singletons = singletons;

export default Themed;
