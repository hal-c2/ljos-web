// QtQuick3D.AssetUtils: a model read from a file while the application runs.
// The file's nodes and meshes belong to the renderer's scene, so only the
// renderer that reads such files shows them (`wgpu.js`): the JavaScript one
// draws what is declared and has no reader of glTF.
import { defineType } from "../../object.ts";
import { Node } from "../Node.js";

export const RuntimeLoader = defineType("RuntimeLoader", Node, {
  properties: {
    source: "",
    instancing: null,
    status: 0,
    errorString: "",
  },
  enums: { Empty: 0, Success: 1, Error: 2 },
});
