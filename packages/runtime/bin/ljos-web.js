#!/usr/bin/env node
// ljos-web modules [--json]
//   The modules this ljos-web provides, and what building with each needs.
import { parseArgs } from "node:util";
import { provided } from "../modules.js";

const USAGE = `usage: ljos-web modules [--json]`;

const fail = (message, code = 1) => {
  console.error(message);
  process.exit(code);
};

const [command, ...rest] = process.argv.slice(2);
let parsed;
try {
  parsed = parseArgs({ args: rest, allowPositionals: true, options: { json: { type: "boolean" } } });
} catch (error) {
  fail(`${error.message}\n${USAGE}`, 2);
}
const { values, positionals } = parsed;

if (command === "modules" && positionals.length === 0) {
  const list = provided();
  if (values.json) console.log(JSON.stringify(list, null, 2));
  else for (const { module, needs } of list.modules) console.log(needs.length > 0 ? `${module} (needs ${needs.join(", ")})` : module);
} else {
  fail(USAGE, 2);
}
