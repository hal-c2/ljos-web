// A 3D model in a built site is a file of the site, however small: the
// renderer tells an `.obj` from a `.glb` by its name, which a `data:`
// address has lost, and a `.gltf` reads its buffers beside it.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSite } from "../site.js";
import { bundle, qmlc } from "./bundle.js";
import { expect, part, test } from "./served.js";

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));

test("a built site carries a small model as a file of its own name", async () => {
  const made = bundle("models3d");
  try {
    await part("build the site", () => buildSite({ dir: made.dir, out: made.out, qmlc, qt: [] }));
    const files = walk(made.out);
    expect(files.filter((file) => /\.glb$/.test(file))).toHaveLength(1);
    expect(files.filter((file) => /\.obj$/.test(file))).toHaveLength(1);
    const inlined = files.filter((file) => /\.(?:js|html)$/.test(file) && /data:model\/|data:application\/octet-stream/.test(readFileSync(file, "utf8")));
    expect(inlined).toEqual([]);
  } finally {
    made.remove();
  }
});
