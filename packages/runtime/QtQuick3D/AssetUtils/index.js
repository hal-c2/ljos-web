// QtQuick3D.AssetUtils: a model read from a file while the application runs.
// The file's nodes and meshes belong to the renderer's scene, so only the
// renderer that reads such files shows them (`wgpu.js`): the JavaScript one
// draws what is declared and has no reader of glTF. What a pick meets of
// them is read here, by the page (`$picks`).
import { defineType, located } from "../../object.ts";
import { buffers, header, parts } from "../gltf.js";
import * as math from "../math.js";
import { Node } from "../Node.js";
import { retried } from "../scene.js";

// What a loader made for picking of the file it read last.
const picked = new WeakMap();

export const RuntimeLoader = defineType("RuntimeLoader", Node, {
  properties: {
    source: "",
    instancing: null,
    status: 0,
    errorString: "",
  },
  enums: { Empty: 0, Success: 1, Error: 2 },
  methods: {
    // The models a pick can meet of what the file holds: one for each of
    // its nodes with a mesh, `{ node, shape, placed }`, `node` what the
    // pick tells (`objectHit`), named after the file's node and inside
    // this loader, as Ljós's own loader makes them. None until the page has
    // read the file, which the first pick asks for.
    $picks() {
      const given = String(this.source ?? "");
      if (!given) return [];
      const address = located(given);
      // A file or a buffer that could not be fetched is asked for again by
      // the next pick.
      const read = retried(address, "gltf", header);
      if (!read || read.error) return [];
      let made = picked.get(this);
      if (made?.read !== read) {
        // Its buffers, decoded only when what the pick meets is made again.
        const bytes = buffers(read, address).map((buffer) => (buffer.url ? retried(buffer.url, "buffer", (taken) => ({ bytes: new Uint8Array(taken) })) : buffer));
        if (bytes.some((buffer) => !buffer?.bytes)) return [];
        const models = parts(read.json, bytes.map((buffer) => buffer.bytes)).map(({ name, index, placed, shape }) => ({
          node: Object.freeze({ objectName: name, index, parent: this, pickable: true, visible: true }),
          shape,
          placed,
        }));
        picked.set(this, (made = { read, models }));
      }
      const world = this.$world();
      return made.models.map(({ node, shape, placed }) => ({ node, shape, placed: math.multiply(world, placed) }));
    },
  },
});
