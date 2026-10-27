// What stands in for a program's own code says where the files it has
// beside it as it runs are: a directory of them, and one inside that which
// is somewhere else.
import { beside, located } from "ljos-web/object";
import Shown from "./beside/Shown.qml";

beside("file:store/", new URL("./kept/", import.meta.url).href);
beside("store/deep", new URL("./kept", import.meta.url));

export const objects = { elsewhere: [located("file:other/flag.png"), located("file:/store/flag.png"), located("store/flag.png")] };
export default Shown;
