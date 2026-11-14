// The build side of a live code block: hold every example to compiling
// (`qmlc`, the same compiler the page runs), give it a content hash,
// prerender it, and write the static HTML a reader without JavaScript
// sees — the code, the running result as the prerender wrote it, and
// the payload hydration runs from.
//
// The prerender is the site's own (docs/LJOS_WEB.md A26), not a second
// path: each example is compiled ahead of time into one server bundle
// over this runtime and made in Node by `renderToString`
// (`ljos-web/server`), exactly as a prerendered page is. The HTML it
// writes is the block's first paint, and the page takes those very
// nodes over with `hydrate` when it runs. Prerenders are cached by
// content hash; an example whose code did not change is not made again.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { highlightToHtml } from "lezer-ljos/html";
import { CLIENT_CONDITIONS } from "../server/conditions.js";
import { kernelNamed } from "../vite.js";
import { assemble, exampleFiles } from "./parse.js";

export { assemble };

const runtime = join(import.meta.dirname, "..");

// What an example is, for a cache: the files that compile, by name, and
// which is the entry, under the prerender format's version — a change
// in how a prerender numbers its elements must not be served from a
// cache the old numbering wrote. An edit anywhere changes it; nothing
// else does.
export function hashExample(example) {
  const { entry, files } = exampleFiles(example);
  const hash = createHash("sha256");
  hash.update(`ljos-codeblock-prerender:1\n${entry}\n`);
  for (const name of Object.keys(files).sort()) hash.update(`${name}\n${files[name]}\n`);
  return hash.digest("hex");
}

// Each harness of a directory by its file's stem, held to having its
// one snippet marker. A directory that is not there has none.
export function loadHarnesses(dir) {
  if (!dir || !existsSync(dir)) return {};
  const harnesses = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".qml")).sort()) {
    const text = readFileSync(join(dir, file), "utf8");
    const markers = text.split("\n").filter((line) => line.trim() === "//! snippet").length;
    if (markers !== 1) throw new Error(`${join(dir, file)}: a harness needs exactly one "//! snippet" line, this one has ${markers}`);
    harnesses[file.slice(0, -4)] = text;
  }
  return harnesses;
}

// Every example that does not compile, with `qmlc`'s words about it,
// each naming its file as the reader named it (`Main.qml:4:…`). An
// empty answer is the check passing; a build that means every block to
// run fails on any other.
export function checkExamples(examples, { qmlc, env = process.env } = {}) {
  const failures = [];
  for (const example of examples) {
    const { entry, files } = exampleFiles(example);
    const dir = mkdtempSync(join(env.TMPDIR ?? tmpdir(), "ljos-codeblock-"));
    try {
      for (const [name, text] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, name)), { recursive: true });
        writeFileSync(join(dir, name), text);
      }
      // No Qt of the machine's: the page's compiler knows the modules
      // ljos-web provides, and a check that passed on an installed Qt's
      // would promise the page more than it has.
      const ran = spawnSync(qmlc, ["--root", dir, join(dir, entry)], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        env: { ...env, QT_INSTALL_QML: join(dir, "no-qt-here") },
      });
      if (ran.error) failures.push({ example, diagnostics: [`${entry}: the compiler could not be run: ${ran.error.message}`] });
      else if (ran.status !== 0) {
        const said = (ran.stderr || "the compiler said nothing").trim().split("\n").map((line) => line.replaceAll(`${dir}/`, ""));
        failures.push({ example, diagnostics: said });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return failures;
}

const esc = (text) =>
  String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

// What hydration runs from. `<` is written as itself nowhere: a script
// element ends at the first `</script` whatever the JSON says.
const payload = (example, prerendered) =>
  JSON.stringify({
    v: 1,
    entry: example.entry,
    before: example.before,
    ...(example.harness ? { harness: example.harness, harnessTemplate: example.harnessTemplate, harnessFile: example.harnessFile } : {}),
    display: example.display,
    prerendered,
  }).replaceAll("<", "\\u003c");

// The size a prerender gives its root: the first making's element
// carries it inline, and the stage is sized by it so the page does
// not move when the running result takes the prerender's place (the
// elements themselves are absolutely placed, as the runtime lays out).
const prerenderSize = (html) => {
  const tag = /<[^>]*data-hk="1:[^"]*"[^>]*>/.exec(html)?.[0];
  const style = /style="([^"]*)"/.exec(tag ?? "")?.[1] ?? "";
  const width = /width:\s*([\d.]+)px/.exec(style)?.[1];
  const height = /height:\s*([\d.]+)px/.exec(style)?.[1];
  return width && height ? { width: Math.round(Number(width)), height: Math.round(Number(height)) } : {};
};

// One fence as static, highlighted HTML: the grammar's `tok-*` classes
// around its words (lezer-ljos), coloured by codeblock.css's
// `--ljos-code-*` properties, so a reader without JavaScript sees the
// colours the editor shows. A language the grammar does not read is
// written escaped, as it was. `focusable` gives the `<pre>` a tab stop,
// for a column that can be narrower than its longest line.
export function renderCode(code, lang, { focusable = false } = {}) {
  return `<pre class="ljos-code"${focusable ? ' tabindex="0"' : ""}><code class="language-${esc(lang ?? "")}">${highlightToHtml(String(code).replace(/\n$/, ""), lang ?? "")}</code></pre>`;
}

// The static half of a block: the code, readable as code (a search
// engine and a reader without JavaScript get the same words), beside
// what it draws — the example's own HTML as the prerender wrote it,
// which hydration then takes over node for node, so nothing's place
// changes. Without a prerender the stage says so in words. `prerender`
// is the fragment's HTML, or `{ html, width, height }` as
// `loadPrerenders` gives it.
export function renderStatic(example, { prerender } = {}) {
  const fragment = typeof prerender === "string" ? prerender : prerender?.html;
  const size = prerender && typeof prerender === "object" && prerender.width ? prerender : fragment ? prerenderSize(fragment) : {};
  // The source column can be narrower than its longest line, and a
  // region that scrolls must be reachable from the keyboard.
  const files = example.display
    .map(
      (file) =>
        `<div class="ljos-codeblock__source" data-file="${esc(file.name)}">` +
        (example.display.length > 1 ? `<p class="ljos-codeblock__file">${esc(file.name)}</p>` : "") +
        `${renderCode(file.code, file.lang, { focusable: true })}</div>`,
    )
    .join("");
  const stage = fragment ?? `<p class="ljos-codeblock__norun">This example runs in the page, with JavaScript on.</p>`;
  const stageSize = size.width ? ` style="width:${size.width}px;height:${size.height}px"` : "";
  const head =
    (example.before ? `<span class="ljos-codeblock__before">Before</span>` : "") +
    (example.display.length === 1 ? `<span class="ljos-codeblock__file">${esc(example.harness ? `${example.entry} (in the ${example.harness} harness)` : example.display[0].name)}</span>` : "");
  return (
    `<figure class="ljos-codeblock" data-ljos-codeblock data-state="static">` +
    `<div class="ljos-codeblock__head">${head}</div>` +
    `<div class="ljos-codeblock__body"><div class="ljos-codeblock__code">${files}</div>` +
    `<div class="ljos-codeblock__stage"${stageSize}>${stage}</div></div>` +
    `<script type="application/json" data-ljos-codeblock-data>${payload(example, Boolean(fragment))}</script></figure>`
  );
}

// A prerender of every example that has none under `cacheDir`, made as
// a prerendered page is made (A26): the examples are written as one
// small project, built once into a server bundle by the same Vite
// build (SSR target, this runtime, `qmlc` for its QML), and each is
// rendered in a Node process of its own kind (`prerender-run.js`)
// by `renderToString`. Answers `{ manifest, failures }`: the manifest
// `{ [hash]: { file } }` of HTML fragments under `cacheDir`, also
// written to `cacheDir/manifest.json`, and each example that did not
// run, with the compiler's or the page's words. Making an example
// runs it, so this is the run half of the build-time check; which
// failures fail a build is the caller's to say, as with
// `checkExamples`. The kernel is the build's (`LJOS_KERNEL=wasm` for
// Ljós's graph), as a prerendered site's is.
export async function renderPrerenders(examples, { cacheDir, qmlc, width = 1280, height = 720, env = process.env } = {}) {
  mkdirSync(cacheDir, { recursive: true });
  const at = join(cacheDir, "manifest.json");
  const manifest = existsSync(at) ? JSON.parse(readFileSync(at, "utf8")) : {};
  const byHash = new Map(examples.map((example) => [hashExample(example), example]));
  let missing = [...byHash].filter(([hash]) => {
    const had = manifest[hash];
    return !had?.file || !existsSync(join(cacheDir, had.file));
  });
  const failures = [];
  if (missing.length === 0) return { manifest, failures };

  // What qmlc refuses never reaches the bundle, where one refusal
  // would refuse them all unnamed.
  if (qmlc) {
    const refused = checkExamples(missing.map(([, example]) => example), { qmlc, env });
    failures.push(...refused);
    const bad = new Set(refused.map(({ example }) => hashExample(example)));
    missing = missing.filter(([hash]) => !bad.has(hash));
    if (missing.length === 0) return { manifest, failures };
  }

  const [{ build }, { default: qml }] = await Promise.all([import("vite"), import("../vite.js")]);

  // One bundle for a batch, rendered in one Node process. A bundle
  // that will not build is split and tried again, down to the one
  // example whose refusal it is: a poisoned batch must name its own
  // block, not refuse them all.
  const attempt = async (batch) => {
    const stage = mkdtempSync(join(env.TMPDIR ?? tmpdir(), "ljos-codeblock-prerender-"));
    try {
      const imports = [];
      const entries = [];
      batch.forEach(([hash, example], i) => {
        const { entry, files } = exampleFiles(example);
        const dir = join(stage, "examples", hash.slice(0, 16));
        for (const [name, text] of Object.entries(files)) {
          mkdirSync(dirname(join(dir, name)), { recursive: true });
          writeFileSync(join(dir, name), text);
        }
        imports.push(`import E${i} from "./examples/${hash.slice(0, 16)}/${entry}";`);
        entries.push(`  ${JSON.stringify(hash)}: E${i},`);
      });
      writeFileSync(
        join(stage, "entries.js"),
        [
          `import { renderToString } from "codeblock:server";`,
          ...imports,
          `export const pages = {\n${entries.join("\n")}\n};`,
          `export { renderToString };`,
          ``,
        ].join("\n"),
      );
      // No installed Qt, Ljós's own styles: what a block may draw must
      // not depend on the building machine, as on the site. Each
      // example compiles with its own directory as its project (the
      // plugin's per-file root), never one root for the runtime's QML.
      const examplesAt = join(stage, "examples") + "/";
      // The stage stands outside any workspace: link this package in,
      // so the bare `ljos-web/…` specifiers compiled QML and the
      // plugin write resolve as they do in a page's own build.
      mkdirSync(join(stage, "node_modules"), { recursive: true });
      symlinkSync(runtime, join(stage, "node_modules/ljos-web"), "dir");
      try {
        await build({
          configFile: false,
          root: stage,
          logLevel: "error",
          cacheDir: join(runtime, "node_modules/.vite/ljos-codeblocks"),
          resolve: {
            alias: {
              "codeblock:server": join(runtime, "server.js"),
              "#kernel": join(runtime, kernelNamed(env) === "wasm" ? "kernel/checked.js" : "kernel/solid.js"),
            },
            dedupe: ["solid-js", "@solidjs/web", "@solidjs/signals"],
          },
          plugins: [
            qml({
              qmlc: qmlc ?? "qmlc",
              qt: [],
              styles: "ljos",
              theme: false,
              root: (file) => (file.startsWith(examplesAt) ? join(examplesAt, file.slice(examplesAt.length).split("/")[0]) : undefined),
            }),
          ],
          build: {
            ssr: join(stage, "entries.js"),
            outDir: join(stage, "server"),
            emptyOutDir: true,
            target: "esnext",
            chunkSizeWarningLimit: 4000,
            rollupOptions: { output: { format: "es", entryFileNames: "entries.mjs" } },
          },
          ssr: { noExternal: true, resolve: { conditions: CLIENT_CONDITIONS } },
          environments: { ssr: { resolve: { noExternal: true, conditions: CLIENT_CONDITIONS } } },
        });
      } catch (error) {
        if (batch.length === 1) {
          const [hash, example] = batch[0];
          failures.push({ example, diagnostics: [`${example.entry}: the prerender bundle could not be built: ${String(error.message).split("\n").slice(0, 4).join(" ")}`] });
          void hash;
          return;
        }
        const half = Math.ceil(batch.length / 2);
        await attempt(batch.slice(0, half));
        await attempt(batch.slice(half));
        return;
      }
      const ran = spawnSync(process.execPath, [join(import.meta.dirname, "prerender-run.js"), join(stage, "server/entries.mjs"), JSON.stringify({ width, height })], {
        encoding: "utf8",
        maxBuffer: 1 << 28,
        timeout: 600_000,
        env,
      });
      if (ran.error) throw new Error(`could not prerender the code blocks: ${ran.error.message}`);
      if (ran.status !== 0) throw new Error(`the code blocks could not be prerendered:\n${(ran.stderr || ran.stdout).trim()}`);
      if (ran.stderr) console.warn(ran.stderr.trimEnd());
      const answered = new Set();
      for (const line of ran.stdout.split("\n").filter(Boolean)) {
        const { hash, html, error } = JSON.parse(line);
        answered.add(hash);
        const example = byHash.get(hash);
        if (error !== undefined) failures.push({ example, diagnostics: [`${example.entry}:1: ${error}`] });
        else {
          const file = `${hash.slice(0, 16)}.html`;
          writeFileSync(join(cacheDir, file), html);
          manifest[hash] = { file, ...prerenderSize(html) };
        }
      }
      for (const [hash, example] of batch)
        if (!answered.has(hash)) failures.push({ example, diagnostics: [`${example.entry}:1: the prerender gave no answer for it`] });
      writeFileSync(at, `${JSON.stringify(manifest, null, 2)}\n`);
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  };
  for (let i = 0; i < missing.length; i += 24) await attempt(missing.slice(i, i + 24));
  return { manifest, failures };
}

// What a manifest's cache holds, read back for the build that embeds
// it: `{ [hash]: { html } }` for a prerendered example, and a failed
// entry as the step that ran them left it (`{ failed, diagnostics }`).
export function loadPrerenders(cacheDir) {
  const at = join(cacheDir, "manifest.json");
  if (!existsSync(at)) return {};
  const manifest = JSON.parse(readFileSync(at, "utf8"));
  const loaded = {};
  for (const [hash, had] of Object.entries(manifest)) {
    if (had?.file && existsSync(join(cacheDir, had.file)))
      loaded[hash] = { html: readFileSync(join(cacheDir, had.file), "utf8"), width: had.width, height: had.height };
    else if (had?.failed) loaded[hash] = had;
  }
  return loaded;
}
