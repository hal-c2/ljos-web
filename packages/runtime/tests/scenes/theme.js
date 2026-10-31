// `themed.qml` with what a host has of the page's theme (`ljos-web/theme`)
// and the singletons it is put on, for a test to call and read.
import { watchSingletons } from "ljos-web/object";
import * as theme from "ljos-web/theme";
import Themed from "./themed.qml";

const singletons = {};
watchSingletons((name, object) => (singletons[name] = object));
window.theme = theme;
window.singletons = singletons;

export default Themed;
