#!/usr/bin/env node
// ljos-web build-site DIR [--out DIR] [--qmlc PATH] [--qt DIR]... [--with DIR]... [--styles ljos|qt]
//   A static site from DIR, a directory with ljos-site.json (default out:
//   DIR-site). A site this built there is replaced; anything else is not.
//   Its controls are Ljós's style, or an installed Qt's with `--styles qt`.
// ljos-web modules [--json]
//   The modules this ljos-web provides, and what building with each needs.
// ljos-web faces CRATE [--out DIR] [--register PATH] [--bindgen PATH]
//   The application crate's wasm, the faces of its native types and their
//   ljostypes.json (default out: CRATE/pkg).
import { parseArgs } from "node:util";
import { buildFaces, FaceError } from "../web/faces.js";
import { provided } from "../modules.js";
import { buildSite, SiteError } from "../site.js";

const USAGE = `usage: ljos-web build-site DIR [--out DIR] [--qmlc PATH] [--qt DIR]... [--with DIR]... [--styles ljos|qt]
       ljos-web modules [--json]
       ljos-web faces CRATE [--out DIR] [--register PATH] [--bindgen PATH]`;

const fail = (message, code = 1) => {
  console.error(message);
  process.exit(code);
};

const [command, ...rest] = process.argv.slice(2);
let parsed;
try {
  parsed = parseArgs({
    args: rest,
    allowPositionals: true,
    options:
      command === "build-site"
        ? { out: { type: "string" }, qmlc: { type: "string" }, qt: { type: "string", multiple: true }, with: { type: "string", multiple: true }, styles: { type: "string" } }
        : command === "faces"
          ? { out: { type: "string" }, register: { type: "string" }, bindgen: { type: "string" } }
          : { json: { type: "boolean" } },
  });
} catch (error) {
  fail(`${error.message}\n${USAGE}`, 2);
}
const { values, positionals } = parsed;

if (command === "modules" && positionals.length === 0) {
  const list = provided();
  if (values.json) console.log(JSON.stringify(list, null, 2));
  else for (const { module, needs } of list.modules) console.log(needs.length > 0 ? `${module} (needs ${needs.join(", ")})` : module);
} else if (command === "build-site" && positionals.length === 1) {
  try {
    const { out, files, bytes } = await buildSite({ dir: positionals[0], out: values.out, qmlc: values.qmlc, qt: values.qt, with: values.with, styles: values.styles });
    console.log(`site: ${out} (${files.length} files, ${bytes} bytes)`);
  } catch (error) {
    // What the compiler or Vite says is said as they say it, without a stack.
    fail(error instanceof SiteError ? `${positionals[0]}: ${error.message}` : error.message);
  }
} else if (command === "faces" && positionals.length === 1) {
  try {
    const { out, types } = await buildFaces({ crate: positionals[0], out: values.out, register: values.register, bindgen: values.bindgen });
    console.log(`faces: ${out} (${types.length} types)`);
  } catch (error) {
    fail(error instanceof FaceError ? `${positionals[0]}: ${error.message}` : error.stack);
  }
} else {
  fail(USAGE, 2);
}
