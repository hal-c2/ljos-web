#!/usr/bin/env node
// A stand-in for `qmlc`, so that the harness can be tested whatever the real
// compiler takes today: `FILE.qml` compiles to what `FILE.qml.js` holds, and
// without one it is an error, said as `qmlc` says its own.
import { existsSync, readFileSync } from "node:fs";

// The Vite plugin asks for an entry's theme first (`--theme-for ENTRY` or
// `--theme FILE`); the small examples have none, which is `null`.
if (process.argv.includes("--theme-for") || process.argv.includes("--theme")) {
  process.stdout.write("null\n");
  process.exit(0);
}
const file = process.argv.at(-1);
if (!existsSync(`${file}.js`)) {
  console.error(`${file}:1:1: the stand-in compiler has no output for this file`);
  process.exit(1);
}
process.stdout.write(readFileSync(`${file}.js`, "utf8"));
