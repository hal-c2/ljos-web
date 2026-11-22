// QtQuick3D.AssetUtils: a model read from a file while the application runs.
// The file's nodes and meshes belong to the renderer's scene, so only the
// renderer that reads such files shows them (`wgpu.js`): the JavaScript one
// draws what is declared and has no reader of glTF. What a pick meets of
// them is read here, by the page (`$picks`).
import { defineType, located } from "../../object.ts";
import { buffers, header, parts } from "../gltf.js";
import * as math from "../math.js";
import { Node } from "../Node.js";
import { file, retried } from "../scene.js";

// What a loader made for picking of the file it read last.
const picked = new WeakMap();
// Each read file's buffers as its description gives them, those in it
// decoded: kept apart from `picked`, as a file can be read while a buffer
// it names is still being fetched (or never comes), and a pick on every
// move would decode the ones in it again each time.
const described = new WeakMap();
const describedOf = (read, address) => {
  if (!described.has(read)) described.set(read, buffers(read, address));
  return described.get(read);
};
// What is kept of a buffer that is a file of its own.
const bytesOf = (taken) => ({ bytes: new Uint8Array(taken) });

export const RuntimeLoader = defineType("RuntimeLoader", Node, {
  properties: {
    source: "",
    instancing: null,
    status: 0,
    errorString: "",
  },
  enums: { Empty: 0, Success: 1, Error: 2 },
  methods: {
    // Whether it names what the JavaScript renderer does not read and wgpu
    // does: a view that shows it is wgpu's where it can be (`View3D.js`).
    $unread() {
      return String(this.source ?? "") !== "";
    },
    // Whether that file and the buffers it names are here: till they are,
    // turning to wgpu would show no more. Asking starts their fetch, and
    // only a view that could turn asks. A failure is left as it is: asking
    // again is a pick's (`retried`), as are the times it may.
    $ready() {
      const address = located(String(this.source ?? ""));
      const read = file(address, "gltf", header).state();
      if (!read || read.error) return false;
      let named;
      try {
        named = describedOf(read, address);
      } catch {
        // A description with a buffer that cannot be read is not ready.
        return false;
      }
      const bytes = named.map((buffer) => (buffer.url ? file(buffer.url, "buffer", bytesOf).state() : buffer));
      return bytes.every((buffer) => buffer?.bytes);
    },
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
        const bytes = describedOf(read, address).map((buffer) => (buffer.url ? retried(buffer.url, "buffer", bytesOf) : buffer));
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
