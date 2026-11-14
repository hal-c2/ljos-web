#!/usr/bin/env node
// Renders one page for a build: given the build's server bundle (the
// entry and this runtime, built for Node by the same Vite build that
// made the page's script), makes the page over the prerender document
// and writes its HTML to stdout.
//
// A process of its own, because a render takes the globals over (the
// document the runtime draws into is the prerender's) and because a
// page that will not settle must not take the build with it: the
// build runs this and says what it said.
//
//   node prerender.js SERVER-BUNDLE [{"width":1280,"height":720} | -]
//   (`-`: the options on stdin)
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { installPrerenderGlobals } from "./dom.js";

const [bundle, said] = process.argv.slice(2);
const options = said === "-" ? JSON.parse(readFileSync(0, "utf8") || "{}") : said ? JSON.parse(said) : {};

// The wasm kernel is fetched as a page fetches it; here the file it
// names is read, from where the bundle put it or from beside the
// runtime that loads it. Anything else a page fetches as it is made
// is not the build's to answer: it is told there is nothing, as a
// first load with nothing cached is, and has it when it hydrates.
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
// What the page says as it is made — QML's `print` and `console.log`
// are console.log here — is not the page: stdout is the HTML and
// nothing else, so the page's saying goes where a build's does.
for (const said of ["log", "info", "debug"]) console[said] = (...args) => console.error(...args);
const page = await import(pathToFileURL(resolve(bundle)).href);
// A page's animations and timers would keep this process for ever:
// the render is what it was run for, and it ends with it.
process.stdout.write(await page.default(options), () => process.exit(0));
