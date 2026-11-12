#!/usr/bin/env node
// Renders a build's code-block examples for it, in a process of its
// own like the site builder's prerender (server/prerender.js): the
// given server bundle holds every example's entry over this runtime,
// and each is made over the prerender document and written out, one
// JSON line per example — `{ hash, html }`, or `{ hash, error }` for
// one that did not run, with the page's words.
//
//   node prerender-run.js ENTRIES-BUNDLE '{"width":1280,"height":720}'
import { readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { installPrerenderGlobals } from "../server/dom.js";

const [bundle, said] = process.argv.slice(2);
const options = said ? JSON.parse(said) : {};

// The wasm kernel is fetched as a page fetches it; here the file it
// names is read, as in server/prerender.js. Anything else an example
// fetches as it is made is answered as a first load's nothing.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const asked = String(url);
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
for (const name of ["log", "info", "debug"]) console[name] = (...args) => console.error(...args);
const { pages, renderToString } = await import(pathToFileURL(resolve(bundle)).href);
for (const [hash, Component] of Object.entries(pages)) {
  try {
    process.stdout.write(`${JSON.stringify({ hash, html: await renderToString(Component, options) })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ hash, error: error?.message ?? String(error) })}\n`);
  }
}
// An example's animations and timers would keep this process: the
// renders are what it was run for, and it ends with them.
process.exit(0);
