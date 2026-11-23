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
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { highlightToHtml } from "lezer-ljos/html";
import { askedJobs, fittingJobs, pooled } from "../pool.js";
import { kernelNamed } from "../vite.js";
import { assemble, exampleFiles, packGiven } from "./parse.js";

export { assemble };

const runtime = join(import.meta.dirname, "..");

// What an example is, for a cache: the files that compile, by name, and
// which is the entry, under the prerender format's version — a change
// in how a prerender numbers its elements, or in what its entry keeps
// (2: what it said, `logged`), must not be served from a cache the old
// format wrote. An edit anywhere changes it; nothing
// else does.
export function hashExample(example) {
  const { entry, files } = exampleFiles(example);
  const hash = createHash("sha256");
  hash.update(`ljos-codeblock-prerender:2\n${entry}\n`);
  // A text is hashed as it always was, so a page whose examples hold
  // no site files keeps every prerender it had.
  for (const name of Object.keys(files).sort()) {
    const content = files[name];
    if (typeof content === "string") hash.update(`${name}\n${content}\n`);
    else hash.update(`${name}\n`).update(content).update("\n");
  }
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

// The reader `assemble` asks for a root's `files=`: the bytes of a file
// of `dir` (a docs tree's `files/`), or nothing where it has no such
// file. `assemble` has already refused a name that leaves `dir`.
export function siteFiles(dir) {
  return (name) => {
    if (!dir) return undefined;
    const at = join(dir, name);
    if (!existsSync(at) || !statSync(at).isFile()) return undefined;
    const read = readFileSync(at);
    return new Uint8Array(read.buffer, read.byteOffset, read.byteLength);
  };
}

// An example's files written to a directory of their own, and how
// `qmlc` is asked about it there.
function staged(example, qmlc, env) {
  const { entry, files } = exampleFiles(example);
  const dir = mkdtempSync(join(env.TMPDIR ?? tmpdir(), "ljos-codeblock-"));
  try {
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), text);
    }
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
  // No Qt of the machine's: the page's compiler knows the modules
  // ljos-web provides, and a check that passed on an installed Qt's
  // would promise the page more than it has.
  return { entry, dir, args: ["--root", dir, join(dir, entry)], options: { env: { ...env, QT_INSTALL_QML: join(dir, "no-qt-here") } } };
}

// What `qmlc` said of one example, as `checkExamples` answers it:
// nothing when it compiled.
function verdict(example, { entry, dir }, ran) {
  if (ran.error) return { example, diagnostics: [`${entry}: the compiler could not be run: ${ran.error.message}`] };
  if (ran.status === 0) return null;
  const said = (ran.stderr || "the compiler said nothing").trim().split("\n").map((line) => line.replaceAll(`${dir}/`, ""));
  return { example, diagnostics: said };
}

// Every example that does not compile, with `qmlc`'s words about it,
// each naming its file as the reader named it (`Main.qml:4:…`). An
// empty answer is the check passing; a build that means every block to
// run fails on any other. One at a time: for a page's few examples
// (the Markdown plugin's); a build's many go through `checkExamplesAll`.
export function checkExamples(examples, { qmlc, env = process.env } = {}) {
  const failures = [];
  for (const example of examples) {
    const stage = staged(example, qmlc, env);
    try {
      const ran = spawnSync(qmlc, stage.args, { encoding: "utf8", maxBuffer: QMLC_MAX_BYTES, ...stage.options });
      const failed = verdict(example, stage, ran);
      if (failed) failures.push(failed);
    } finally {
      rmSync(stage.dir, { recursive: true, force: true });
    }
  }
  return failures;
}

// What `checkExamples` answers, `jobs` compilers at once, and each
// distinct example asked once however many pages show it: a docs
// build asks about a couple of hundred, and one `qmlc` after another
// was most of the minutes a build spent before it made anything. The
// answer is in the examples' order, a copy's failure said again for
// each place it stands, as one at a time would. `LJOS_SITE_JOBS` is read
// as a site's renders read it, and a wrong one refused the same way.
export async function checkExamplesAll(examples, { qmlc, env = process.env, jobs = askedJobs(env, "LJOS_SITE_JOBS") ?? availableParallelism() } = {}) {
  const distinct = new Map();
  for (const example of examples) {
    const hash = hashExample(example);
    if (!distinct.has(hash)) distinct.set(hash, example);
  }
  const hashes = [...distinct.keys()];
  const answers = await pooled(
    hashes.map((hash) => async () => {
      const example = distinct.get(hash);
      const stage = staged(example, qmlc, env);
      try {
        return verdict(example, stage, await compiling(qmlc, stage.args, stage.options));
      } finally {
        rmSync(stage.dir, { recursive: true, force: true });
      }
    }),
    Math.max(1, jobs),
  );
  const byHash = new Map(hashes.map((hash, i) => [hash, answers[i]]));
  return examples.flatMap((example) => {
    const failed = byHash.get(hashExample(example));
    return failed ? [{ example, diagnostics: failed.diagnostics }] : [];
  });
}

// How much a compiler may say about one example before it is cut off,
// as spawnSync's maxBuffer did.
const QMLC_MAX_BYTES = 64 * 1024 * 1024;

// One `qmlc` run, as spawnSync gives it back (`error`, `status`,
// `stderr`), without holding the event loop while others run.
function compiling(qmlc, args, options) {
  return new Promise((done) => {
    const child = spawn(qmlc, args, { ...options, stdio: ["ignore", "ignore", "pipe"] });
    const err = [];
    let size = 0;
    let error = null;
    child.stderr.on("data", (chunk) => {
      size += chunk.length;
      if (size > QMLC_MAX_BYTES) {
        error ??= new Error(`it wrote more than ${QMLC_MAX_BYTES} bytes`);
        child.kill("SIGKILL");
      } else err.push(chunk);
    });
    child.on("error", (why) => (error ??= why));
    child.on("close", (status) => done({ error, status, stderr: Buffer.concat(err).toString("utf8") }));
  });
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
    ...(example.given ? { given: packGiven(example.given) } : {}),
    prerendered,
  }).replaceAll("<", "\\u003c");

// The size a prerender gives its root: the first making's element
// carries it inline, and the stage is sized by it so the page does
// not move when the running result takes the prerender's place (the
// elements themselves are absolutely placed, as the runtime lays out).
// A root window fills whatever it is in: the size it asked is its
// content item's, the window's own child that is an Item and says a
// size. It is looked for among the window's children rather than by its
// hydration key, so a background or header made before it can't hide it.
export const prerenderSize = (html) => {
  const opened = /<[^>]*data-hk="1:[^"]*"[^>]*>/.exec(html);
  const root = opened?.[0] ?? "";
  const sized = /class="qq-window[ "]/.test(root) ? windowChildren(html, opened.index + root.length).find((tag) => /data-hk="\d+:Item"/.test(tag) && sizeOf(tag).width) : root;
  return sizeOf(sized ?? "");
};

// The stage and both schemes' pictures share one size (pictures.mjs), so
// an example that asks a size of its own in each scheme is given one
// both fit in, rather than the light one's, which would crop the dark.
// A scheme with no size of its own gives none, so the other's is it.
const bothSchemes = (light, dark) => {
  if (!dark?.width) return light;
  if (!light.width) return dark;
  return { width: Math.max(light.width, dark.width), height: Math.max(light.height, dark.height) };
};

const sizeOf = (tag) => {
  const style = /style="([^"]*)"/.exec(tag)?.[1] ?? "";
  const width = /width:\s*([\d.]+)px/.exec(style)?.[1];
  const height = /height:\s*([\d.]+)px/.exec(style)?.[1];
  return width && height ? { width: Math.round(Number(width)), height: Math.round(Number(height)) } : {};
};

// Elements that have no end tag, and so hold no children.
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

// The opening tags of the element's own children, from just after its
// opening tag to its end. A prerender's text is escaped, so every `<` in
// it starts a tag or a comment.
function windowChildren(html, from) {
  const children = [];
  const tags = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)[^>]*?(\/?)>/g;
  tags.lastIndex = from;
  let depth = 0;
  for (let tag; (tag = tags.exec(html)); ) {
    const [whole, closing, name, selfClosing] = tag;
    if (!name) continue;
    if (closing) {
      if (depth === 0) break;
      depth -= 1;
    } else {
      if (depth === 0) children.push(whole);
      if (!selfClosing && !VOID.has(name.toLowerCase())) depth += 1;
    }
  }
  return children;
}

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

// What a prerender is made by, as one name: the compiler's own bytes,
// this runtime's files and the workspace's lockfile (what it bundles
// with), the Node that runs it, the kernel and the stage's size. A
// prerender or a failure made under another is not this one's, so a
// cache kept across builds (a CI cache, or a checkout's own) answers
// only for what would make the same again. A compiler named only by
// a command is known by that name. The 3D renderer a build asks for
// (VITE_LJOS_VIEW3D) is read as the page is bundled, so it is part of
// what makes a prerender. Read afresh each time it is asked: the same
// path can hold a rebuilt compiler, and the same runtime edited files.
// Playwright's test-results/ is what a run of the tests left, not the
// runtime: a test run between the prerender step and the build that
// embeds it is no other build.
const STAMP_SKIPS = new Set(["node_modules", "tests", "site-tests", "type-tests", "test-results"]);
export function prerenderStamp({ qmlc, width = 1280, height = 720, dark = false, env = process.env } = {}) {
  const made = JSON.stringify([width, height, kernelNamed(env), env.VITE_LJOS_VIEW3D ?? "", ...(dark ? ["dark"] : [])]);
  // The compiler by its bytes, not where it stands: two checkouts'
  // builds of the same compiler are one.
  const hash = createHash("sha256");
  hash.update(`ljos-codeblock-prerender-stamp:1\n${process.version}\n${made}\n`);
  hash.update(qmlc && existsSync(qmlc) ? readFileSync(qmlc) : `qmlc ${qmlc ?? "none"}`);
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!(dir === runtime && STAMP_SKIPS.has(entry.name))) walk(join(dir, entry.name));
      } else if (entry.isFile()) files.push(join(dir, entry.name));
    }
  };
  walk(runtime);
  for (const file of files.sort()) hash.update(`\n${relative(runtime, file)}\n`).update(readFileSync(file));
  for (const lock of [join(runtime, "../../pnpm-lock.yaml"), join(runtime, "../pnpm-lock.yaml")])
    if (existsSync(lock)) {
      hash.update("\npnpm-lock.yaml\n").update(readFileSync(lock));
      break;
    }
  return hash.digest("hex").slice(0, 32);
}

// An example's words name the stage it ran in, a directory made for
// that run: said without it, they are the same from run to run.
const unstaged = (line) => String(line).replace(/file:\/\/[^\s'"]*?\/ljos-codeblock-prerender-[^/\s'"]+\/server\//g, "");

// A bundler's words, without its colours or where the stage stood: an
// example's file is named as the example names it.
const plain = (said) =>
  String(said)
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/[^\s'"`(]*ljos-codeblock-prerender-[^/\s'"]+\/examples\/[0-9a-f]{16}\//g, "");

// The examples a bundle's refusal names, each with what was said of
// it: every error Rolldown gives with the file it is in. A refusal of
// which any error names no example's file is no one's to blame.
const blame = (error, batch) => {
  const errors = error?.errors?.length ? error.errors : [error];
  return blameEach(
    errors.map((each) => ({ at: [each?.id, each?.loc?.file], said: plain(each.message).split("\n").find((line) => line.trim()) ?? "" })),
    batch,
  );
};

// `[{ at: [file…], said }]` by the example of the batch each is in, or
// none at all when one of them is in none.
const blameEach = (told, batch) => {
  const blamed = new Map();
  const ours = new Map(batch.map(([hash]) => [hash.slice(0, 16), hash]));
  for (const { at: files, said } of told) {
    const at = files.find((file) => typeof file === "string" && /\/examples\/[0-9a-f]{16}\//.test(file));
    const hash = at && ours.get(at.match(/\/examples\/([0-9a-f]{16})\//)[1]);
    if (!hash) return new Map();
    blamed.set(hash, [...(blamed.get(hash) ?? []), said.trim()]);
  }
  return blamed;
};

// A child process, awaited without holding the event loop the other
// batches build on: `{ status, stdout, stderr, error }`, as spawnSync's.
const run = (command, args, env) =>
  new Promise((done) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    const out = [];
    const err = [];
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));
    const timer = setTimeout(() => child.kill("SIGKILL"), 600_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      done({ status: null, stdout: "", stderr: "", error });
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      done({
        status: signal ? null : status,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
        error: signal ? new Error(`killed by ${signal}`) : undefined,
      });
    });
  });

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
// Ljós's graph), as a prerendered site's is. `LJOS_PRERENDER_JOBS`
// says how many batches are made at once (by default as many as
// the cores and free memory allow).
// A `cacheDir` holds one stamp's answers, and drops the rest: a
// caller that prerenders under several (each kernel, say) gives each
// its own.
// `dark` makes each example a second time, as a reader who asked for
// the dark scheme is first shown it (`{ [hash]: { file, dark } }`, the
// second `<hash>-dark.html`): an example that paints from the palette
// paints dark there, and a picture of it drawn from the light one
// would stand light on a dark page. It is the same bundle, run again.
export async function renderPrerenders(examples, { cacheDir, qmlc, width = 1280, height = 720, dark = false, checked = false, env = process.env } = {}) {
  mkdirSync(cacheDir, { recursive: true });
  const at = join(cacheDir, "manifest.json");
  const stamp = prerenderStamp({ qmlc, width, height, dark, env });
  const manifest = {};
  const byHash = new Map(examples.map((example) => [hashExample(example), example]));
  // What another compiler or runtime made is not this one's answer, a
  // failure no more than a prerender: it is dropped, and made again
  // when an example asks for it. Nor is an example these docs no longer
  // have: kept, every edit to the docs would grow the cache by one.
  if (existsSync(at))
    for (const [hash, had] of Object.entries(JSON.parse(readFileSync(at, "utf8")))) if (had?.stamp === stamp && byHash.has(hash)) manifest[hash] = had;
  const save = () => writeFileSync(at, `${JSON.stringify(manifest, null, 2)}\n`);
  const failures = [];
  // Said in the manifest, so the build that embeds them leaves the
  // block plain instead of promising it live. A failure is as much this
  // compiler's and runtime's answer as a prerender, and finding which
  // example of a batch refuses costs several bundles: it is kept, and
  // told again, not found again.
  // A refusal no example is named in (a bundler that ran out of
  // memory or files as readily as one that met a bad block) is this
  // run's answer, and the next run asks again.
  const fail = (example, diagnostics, { again = false } = {}) => {
    failures.push({ example, diagnostics });
    manifest[hashExample(example)] = { failed: true, diagnostics, stamp, ...(again ? { again } : {}) };
  };
  let missing = [...byHash].filter(([hash, example]) => {
    const had = manifest[hash];
    if (had?.failed && !had.again) {
      failures.push({ example, diagnostics: had.diagnostics ?? [] });
      return false;
    }
    // One whose dark making refused (`darkFailed`) has all it will get
    // from this stamp: its light render, which the dark falls back to.
    return !had?.file || !existsSync(join(cacheDir, had.file)) || (dark && !had.darkFailed && !(had.dark && existsSync(join(cacheDir, had.dark))));
  });
  // A cache restored from an older run holds what older compilers and
  // runtimes made too: what this manifest does not name goes, so the
  // cache is only ever this run's answers, not every run's.
  const done = () => {
    save();
    pruneCache(cacheDir, { keep: new Set(Object.values(manifest).flatMap((had) => [had.file, had.dark])), pattern: /^[0-9a-f]{16}(-dark)?\.html$/ });
    return { manifest, failures };
  };
  if (missing.length === 0) return done();

  // What qmlc refuses never reaches the bundle, where one refusal
  // would refuse them all unnamed: unless the caller has just asked
  // qmlc of these very examples (`checked`), and kept back its refusals.
  if (qmlc && !checked) {
    const refused = await checkExamplesAll(missing.map(([, example]) => example), { qmlc, env });
    for (const { example, diagnostics } of refused) fail(example, diagnostics);
    const bad = new Set(refused.map(({ example }) => hashExample(example)));
    missing = missing.filter(([hash]) => !bad.has(hash));
    if (missing.length === 0) {
      save();
      return { manifest, failures };
    }
  }

  // One bundle for a batch, rendered in one Node process. A bundle
  // that will not build names the files it refused, and so the
  // examples whose refusal it is: they are failed with its words and
  // the rest built again without them. Only a refusal that names no
  // example splits the batch, down to the one it is: a poisoned batch
  // must name its own block, not refuse them all.
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
          `import { reactivityHalted, renderToString } from "codeblock:server";`,
          ...imports,
          `export const pages = {\n${entries.join("\n")}\n};`,
          `export { reactivityHalted, renderToString };`,
          ``,
        ].join("\n"),
      );
      // The stage stands outside any workspace: link this package in,
      // so the bare `ljos-web/…` specifiers compiled QML and the
      // plugin write resolve as they do in a page's own build.
      mkdirSync(join(stage, "node_modules"), { recursive: true });
      symlinkSync(runtime, join(stage, "node_modules/ljos-web"), "dir");
      // Bundled in a process of its own (`prerender-bundle.js`), so the
      // batches of the lanes are bundled at once. What the runtime
      // lacks is told for every example of the batch in its one bundle,
      // not one bundle each: a batch with a dozen such examples is
      // built twice, not a dozen times.
      let lacks = [];
      try {
        const bundled = await run(process.execPath, [join(import.meta.dirname, "prerender-bundle.js"), JSON.stringify({ stage, qmlc, kernel: kernelNamed(env) })], env);
        if (bundled.error) throw new Error(`could not bundle the code blocks: ${bundled.error.message}`);
        const answer = bundled.status === 0 ? JSON.parse(bundled.stdout.trim().split("\n").at(-1) || "null") : null;
        if (!answer) throw new Error(`the code block bundler stopped without an answer:\n${(bundled.stderr || bundled.stdout).trim()}`);
        lacks = answer.lacks ?? [];
        if (answer.error) throw Object.assign(new Error(answer.error.message), answer.error);
        if (lacks.length > 0) throw Object.assign(new Error(lacks.map(({ said }) => said).join("\n")), { lacks });
      } catch (error) {
        // A bundle stopped by something else has told the lacks it met
        // before, and they are as much their examples' answer.
        const blamed = error?.lacks ? blameEach(error.lacks, batch) : blame(error, batch);
        if (!error?.lacks && blamed.size > 0)
          for (const [hash, words] of blameEach(lacks, batch)) blamed.set(hash, [...(blamed.get(hash) ?? []), ...words]);
        if (blamed.size > 0) {
          for (const [hash, words] of blamed) {
            const example = byHash.get(hash);
            fail(example, words.map((said) => `${example.entry}: the prerender bundle could not be built: ${said}`));
          }
          const rest = batch.filter(([hash]) => !blamed.has(hash));
          if (rest.length > 0) await attempt(rest);
          return;
        }
        if (batch.length === 1) {
          const [, example] = batch[0];
          fail(example, [`${example.entry}: the prerender bundle could not be built: ${plain(error.message).split("\n").slice(0, 4).join(" ")}`], { again: true });
          return;
        }
        // One half, then the other, within this batch's lane: halves
        // made at once would fan out past the lanes, a bundle each.
        const half = Math.ceil(batch.length / 2);
        await attempt(batch.slice(0, half));
        await attempt(batch.slice(half));
        return;
      }
      // Each scheme's render is a process of its own: what an example
      // reads of the scheme it reads as it is made, once. And so is the
      // rest of the batch after an example that halted one.
      const made = async (scheme) => {
        const answers = new Map();
        let halted = true;
        while (halted && answers.size < batch.length) halted = await madeUntilHalted(scheme, answers);
        return answers;
      };
      // Adds what one process answered to `answers`; whether it halted.
      const madeUntilHalted = async (scheme, answers) => {
        const options = JSON.stringify({ width, height, ...(scheme ? { scheme } : {}), ...(answers.size ? { skip: [...answers.keys()] } : {}) });
        const ran = await run(process.execPath, [join(import.meta.dirname, "prerender-run.js"), join(stage, "server/entries.mjs"), options], env);
        if (ran.error) throw new Error(`could not prerender the code blocks: ${ran.error.message}`);
        if (ran.status !== 0) throw new Error(`the code blocks could not be prerendered:\n${(ran.stderr || ran.stdout).trim()}`);
        // Each example's own words come back with it; what the process
        // said outside every example nothing expected, and it stops the
        // build before any of this batch is kept, so the next run makes
        // the batch again and is stopped again rather than served.
        if (ran.stderr.trim()) throw new Error(`the code block prerenderer said, outside any example:\n${ran.stderr.trimEnd()}`);
        let halted = false;
        for (const line of ran.stdout.split("\n").filter(Boolean)) {
          const answer = JSON.parse(line);
          if (answer.halted) halted = true;
          else answers.set(answer.hash, answer);
        }
        return halted;
      };
      // One after the other: a lane's memory is budgeted for one.
      const light = await made(undefined);
      const inDark = dark ? await made("dark") : null;
      for (const { hash, html, error, logged } of light.values()) {
        const example = byHash.get(hash);
        // The dark one is the same example made again: what it says only
        // there is said to be of the dark. What refuses only there is
        // not a failure of the example, whose light render ran: that
        // render is kept, live, and the dark is shown it as it is where
        // there is no dark render (the pictures' light fallback). The
        // dark's refusal is kept beside it (`darkFailed`), for the
        // build's record, and not taken for a failure: as a cached
        // failure it would leave the example plain in both schemes, on
        // every build of this stamp.
        const darkly = inDark?.get(hash);
        if (error !== undefined) fail(example, [`${example.entry}:1: ${error}`, ...(logged ?? []).map(unstaged)]);
        else {
          const shown = darkly?.html !== undefined ? darkly : undefined;
          const darkFailed =
            inDark && !shown
              ? [`${example.entry}:1: in the dark scheme: ${darkly ? darkly.error : "the prerender gave no answer for it"}`, ...(darkly?.logged ?? []).map(unstaged)]
              : undefined;
          const file = `${hash.slice(0, 16)}.html`;
          writeFileSync(join(cacheDir, file), html);
          const shade = shown ? `${hash.slice(0, 16)}-dark.html` : undefined;
          if (shade) writeFileSync(join(cacheDir, shade), shown.html);
          const inLight = (logged ?? []).map(unstaged);
          const onlyDark = (shown?.logged ?? []).map(unstaged).filter((line) => !inLight.includes(line));
          const said = [...inLight, ...onlyDark.map((line) => `in the dark scheme: ${line}`)];
          manifest[hash] = {
            file,
            ...(shade ? { dark: shade } : {}),
            ...bothSchemes(prerenderSize(html), shown && prerenderSize(shown.html)),
            ...(said.length ? { logged: said } : {}),
            ...(darkFailed ? { darkFailed } : {}),
            stamp,
          };
        }
      }
      const answered = new Set(light.keys());
      for (const [, example] of batch) if (!answered.has(hashExample(example))) fail(example, [`${example.entry}:1: the prerender gave no answer for it`]);
      save();
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  };
  // The batches are independent bundles and processes: as many at once
  // as the machine has cores and memory for (`LJOS_PRERENDER_JOBS` says
  // otherwise), and never more than there are.
  const batches = [];
  for (let i = 0; i < missing.length; i += 24) batches.push(missing.slice(i, i + 24));
  const lanes = Math.max(1, Math.min(batches.length, askedJobs(env, "LJOS_PRERENDER_JOBS") ?? fittingJobs(BUNDLE_MEMORY)));
  await Promise.all(
    Array.from({ length: lanes }, async () => {
      while (batches.length > 0) await attempt(batches.shift());
    }),
  );
  // A batch whose bundle would not build records its failures and
  // returns without a render to save; the manifest must still say so.
  return done();
}

// What one batch's bundle holds at its height: vite, the runtime's
// modules and two dozen compiled examples, in a process of its own.
const BUNDLE_MEMORY = 2 * 1024 ** 3;


// Removes each file of `cacheDir` that `pattern` names and `keep` does
// not hold: a cache kept across runs (CI restores the newest one, made
// by an older commit) otherwise grows by every answer it ever held.
export function pruneCache(cacheDir, { keep, pattern }) {
  for (const name of readdirSync(cacheDir)) if (pattern.test(name) && !keep.has(name)) rmSync(join(cacheDir, name), { force: true });
}

// What a manifest's cache holds, read back for the build that embeds
// it: `{ [hash]: { html } }` for a prerendered example (`htmlDark` too
// where its dark one was made, `darkFailed` where that refused), and a failed
// entry as the step that ran them left it (`{ failed, diagnostics }`).
export function loadPrerenders(cacheDir) {
  const at = join(cacheDir, "manifest.json");
  if (!existsSync(at)) return {};
  const manifest = JSON.parse(readFileSync(at, "utf8"));
  const loaded = {};
  for (const [hash, had] of Object.entries(manifest)) {
    if (had?.file && existsSync(join(cacheDir, had.file)))
      loaded[hash] = {
        html: readFileSync(join(cacheDir, had.file), "utf8"),
        ...(had.dark && existsSync(join(cacheDir, had.dark)) ? { htmlDark: readFileSync(join(cacheDir, had.dark), "utf8") } : {}),
        width: had.width,
        height: had.height,
        stamp: had.stamp,
        ...(had.logged ? { logged: had.logged } : {}),
        ...(had.darkFailed ? { darkFailed: had.darkFailed } : {}),
      };
    else if (had?.failed) loaded[hash] = had;
  }
  return loaded;
}
