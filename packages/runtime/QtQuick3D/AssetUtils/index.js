// QtQuick3D.AssetUtils: a model read from a file while the application runs.
// The file's nodes and meshes belong to the renderer's scene, so only the
// renderer that reads such files shows them (`wgpu.js`): the JavaScript one
// draws what is declared and has no reader of glTF. What a pick meets of
// them is read here, by the page (`$picks`).
import { defineType, located } from "../../object.ts";
import { buffers, header, modelled, parts } from "../gltf.js";
import * as math from "../math.js";
import { Node } from "../Node.js";
import { retried } from "../scene.js";

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
// What wgpu's loader reads, by the extension as it tells them (ljos_3d's
// `load_any`): any other name it refuses.
const extension = (source) => /\.(gltf|glb|obj)$/i.exec(source.split(/[?#]/, 1)[0])?.[1].toLowerCase();
// What is kept of an OBJ: whether it has a face, a line that begins `f`,
// without which wgpu's loader makes no model of it.
const F = 0x66;
const arrived = (taken) => {
  const bytes = new Uint8Array(taken);
  let start = true;
  for (let at = 0; at < bytes.length; at++) {
    const byte = bytes[at];
    if (start && byte === F && (bytes[at + 1] === 0x20 || bytes[at + 1] === 0x09)) return { faces: true };
    if (byte === 0x0a || byte === 0x0d) start = true;
    else if (start && byte !== 0x20 && byte !== 0x09) start = false;
  }
  return { faces: false };
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
      return extension(String(this.source ?? "")) !== undefined;
    },
    // Where the file it names is.
    $named() {
      return located(String(this.source ?? ""));
    },
    // Whether that file can be shown, with the buffers a glTF names: null
    // while one is on the way, as turning to wgpu would show no more till
    // then; false once it has settled as one that cannot be, or as one with
    // no model: a glTF whose scene has no node with a mesh, an OBJ with no
    // face. (An OBJ's materials are wgpu's to ask for: the last picture
    // stays up meanwhile.)
    // Asking starts the fetch, as `ahead`'s (`readsAhead`), and only a view
    // that could turn asks.
    $ready(ahead) {
      const source = String(this.source ?? "");
      const address = this.$named();
      if (extension(source) === "obj") {
        const here = ahead.read(address, "obj", arrived, address);
        return here ? !here.error && here.faces : null;
      }
      const read = ahead.read(address, "gltf", header, address);
      if (!read) return null;
      if (read.error || !modelled(read.json)) return false;
      let named;
      try {
        named = describedOf(read, address);
      } catch {
        // A description with a buffer that cannot be read is not to be shown.
        return false;
      }
      const bytes = named.map((buffer) => (buffer.url ? ahead.read(buffer.url, "buffer", bytesOf, address) : buffer));
      return bytes.some((buffer) => !buffer) ? null : bytes.every((buffer) => buffer.bytes);
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
