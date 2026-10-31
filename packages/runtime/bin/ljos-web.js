#!/usr/bin/env node
// ljos-web build-site DIR [--out DIR] [--qmlc PATH] [--qt DIR]... [--with DIR]...
//   A static site from DIR, a directory with ljos-site.json (default out:
//   DIR-site). A site this built there is replaced; anything else is not.
// ljos-web modules [--json]
//   The modules this ljos-web provides, and what building with each needs.
import { parseArgs } from "node:util";
import { provided } from "../modules.js";
import { buildSite, SiteError } from "../site.js";

const USAGE = `usage: ljos-web build-site DIR [--out DIR] [--qmlc PATH] [--qt DIR]... [--with DIR]...
       ljos-web modules [--json]`;

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
        ? { out: { type: "string" }, qmlc: { type: "string" }, qt: { type: "string", multiple: true }, with: { type: "string", multiple: true } }
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
    const { out, files, bytes } = await buildSite({ dir: positionals[0], out: values.out, qmlc: values.qmlc, qt: values.qt, with: values.with });
    console.log(`site: ${out} (${files.length} files, ${bytes} bytes)`);
  } catch (error) {
    // What the compiler or Vite says is said as they say it, without a stack.
    fail(error instanceof SiteError ? `${positionals[0]}: ${error.message}` : error.message);
  }
} else {
  fail(USAGE, 2);
}
