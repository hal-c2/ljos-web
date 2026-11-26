// A face of Ljos.Ui (index.js says what a face is), in a module of its own
// so that only a page that names it loads the type it faces.
import { GridView as GridViewBase } from "../../QtQuick/GridView.js";
import { ListView as ListViewBase } from "../../QtQuick/ListView.js";
import { face } from "./face.js";

// `ListView` as it is. What natively calls its passages `enter` and
// `exit` (Qt's `add` and `remove` transitions) the runtime's views do
// not have in either name, so there is nothing here to rename.
export const ListView = /* @__PURE__ */ face("ListView", ListViewBase);
// `GridView`, as `ListView` is.
export const GridView = /* @__PURE__ */ face("GridView", GridViewBase);
