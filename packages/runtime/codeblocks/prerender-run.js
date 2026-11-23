#!/usr/bin/env node
// Renders a build's code-block examples for it, in a process of its
// own like the site builder's prerender (server/prerender.js): the
// given server bundle holds every example's entry over this runtime,
// and each is made over the prerender document and written out, one
// JSON line per example — `{ hash, html }`, or `{ hash, error }` for
// one that did not run, with the page's words, and `logged`, what the
// example said on the console as it was made.
//
// An example whose error halts Solid ends the process once it is
// answered, with `{ halted: true }`: whatever was made after it would
// be drawn without one update. The build runs the rest in another,
// naming those answered in `skip`.
//
//   node prerender-run.js ENTRIES-BUNDLE '{"width":1280,"height":720}'
import { readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { installPrerenderGlobals } from "../server/dom.js";

const [bundle, said] = process.argv.slice(2);
const { skip = [], ...options } = said ? JSON.parse(said) : {};
const answered = new Set(skip);

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
// A page reads a relative address against itself, and the prerender
// document is at prerender.invalid (server/dom.js): either form is the
// example's own file, as the docs' threads example fetches "act.json".
const page = "http://prerender.invalid/";
const placed = (asked) => {
  if (asked.startsWith(page)) return served + asked.slice(page.length);
  return URL.canParse(asked) ? asked : new URL(asked, served).href;
};
globalThis.fetch = async (url, init) => {
  const asked = placed(url instanceof Request ? url.url : String(url));
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
// An answer is on its way once written, not yet read: the build reads
// them while it bundles other batches, so it may lag, and an answer
// still in the pipe when this process ends is lost. Each is awaited
// out before the next, so ending after the last loses none.
const answer = (line) => new Promise((done, failed) => process.stdout.write(line, (error) => (error ? failed(error) : done())));
const { pages, reactivityHalted, renderToString } = await import(pathToFileURL(resolve(bundle)).href);
for (const [hash, Component] of Object.entries(pages)) {
  if (answered.has(hash)) continue;
  const own = [];
  logged = own;
  making = hash;
  let reply;
  try {
    reply = { hash, html: await renderToString(Component, options) };
  } catch (error) {
    reply = { hash, error: error?.message ?? String(error) };
  }
  for (const stop of timers.set.splice(0)) stop();
  if (own.length) reply.logged = own;
  await answer(`${JSON.stringify(reply)}\n`);
  // After the answer has gone: what the example left in microtasks has
  // run by then, and a halt of its is not the next one's to meet.
  if (reactivityHalted()) {
    await answer(`${JSON.stringify({ halted: true })}\n`);
    break;
  }
}
logged = null;
// An example's animations and timers would keep this process: the
// renders are what it was run for, and it ends with them.
process.exit(0);
