#!/usr/bin/env node
// Renders a build's code-block examples for it, in a process of its
// own like the site builder's prerender (server/prerender.js): the
// given server bundle holds every example's entry over this runtime,
// and each is made over the prerender document and written out, one
// JSON line per example — `{ hash, html }`, or `{ hash, error }` for
// one that did not run, with the page's words, and `logged`, what the
// example said on the console as it was made.
//
//   node prerender-run.js ENTRIES-BUNDLE '{"width":1280,"height":720}'
import { readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { installPrerenderGlobals } from "../server/dom.js";

const [bundle, said] = process.argv.slice(2);
const options = said ? JSON.parse(said) : {};

// The wasm kernel is fetched as a page fetches it; here the file it
// names is read, as in server/prerender.js. A file an example reads
// by a relative address (a shell, an SVG, a model's JSON) is its own,
// written beside its entry (build.js stages each example's files
// under examples/<hash>/, the bundle under server/, where such an
// address lands), and read from there; anything else an example
// fetches as it is made is answered as a first load's nothing.
const realFetch = globalThis.fetch;
const served = pathToFileURL(dirname(resolve(bundle))).href + "/";
let making = null;
globalThis.fetch = async (url, init) => {
  const asked = String(url);
  if (making && asked.startsWith(served) && !asked.endsWith(".wasm")) {
    const name = decodeURIComponent(new URL(asked).pathname.slice(new URL(served).pathname.length));
    try {
      const type = { svg: "image/svg+xml", json: "application/json", qml: "text/plain" }[name.split(".").pop()] ?? "application/octet-stream";
      return new Response(await readFile(join(dirname(resolve(bundle)), "../examples", making.slice(0, 16), name)), { headers: { "content-type": type } });
    } catch {
      return new Response("", { status: 404 });
    }
  }
  if (asked.endsWith(".wasm")) {
    const candidates = [join(dirname(bundle), basename(asked)), join(import.meta.dirname, "../kernel", basename(asked))];
    try {
      candidates.unshift(fileURLToPath(asked));
    } catch {
      // Not a file URL: the candidates are what there is.
    }
    for (const candidate of candidates) {
      try {
        return new Response(await readFile(candidate), { headers: { "content-type": "application/wasm" } });
      } catch {
        // The next place it may be.
      }
    }
    throw new Error(`ljos-web prerender: ${basename(asked)} is in none of ${candidates.join(", ")}: build the kernel (\`mise run build:kernel\`)`);
  }
  if (/^(https?:|data:)/.test(asked)) return realFetch(url, init);
  return new Response("", { status: 404 });
};

installPrerenderGlobals(options);
// What an example says as it is made is that example's, and goes back
// with it (`logged`) for the build's report, rather than onto the
// build's own output among every other example's: the build says what
// it decided, the report what each block said. What is said before
// the first example or after the last is the runner's, on stderr,
// which the build takes for a failure.
let logged = null;
const spoken = (args) =>
  args.map((arg) => (typeof arg === "string" ? arg : arg instanceof Error ? (arg.stack ?? arg.message) : String(arg))).join(" ");
for (const name of ["log", "info", "debug", "warn", "error"]) {
  const own = console[name].bind(console);
  console[name] = (...args) => (logged ? logged.push(spoken(args)) : name === "log" || name === "info" || name === "debug" ? console.error(...args) : own(...args));
}
// A timer an example sets speaks as that example, and ends with its
// making: a prerender is the first paint, so nothing it left running
// may speak during the next example's and be blamed on that one.
const timers = { set: [] };
for (const [set, clear] of [
  ["setTimeout", "clearTimeout"],
  ["setInterval", "clearInterval"],
  ["setImmediate", "clearImmediate"],
]) {
  const start = globalThis[set];
  const stop = globalThis[clear];
  globalThis[set] = (run, ...rest) => {
    const by = logged;
    const handle = start((...args) => {
      const was = logged;
      logged = by;
      try {
        return run(...args);
      } finally {
        logged = was;
      }
    }, ...rest);
    if (by) timers.set.push(() => stop(handle));
    return handle;
  };
}
const { pages, renderToString } = await import(pathToFileURL(resolve(bundle)).href);
for (const [hash, Component] of Object.entries(pages)) {
  const own = [];
  logged = own;
  making = hash;
  let answer;
  try {
    answer = { hash, html: await renderToString(Component, options) };
  } catch (error) {
    answer = { hash, error: error?.message ?? String(error) };
  }
  for (const stop of timers.set.splice(0)) stop();
  if (own.length) answer.logged = own;
  process.stdout.write(`${JSON.stringify(answer)}\n`);
}
logged = null;
// An example's animations and timers would keep this process: the
// renders are what it was run for, and it ends with them.
process.exit(0);
