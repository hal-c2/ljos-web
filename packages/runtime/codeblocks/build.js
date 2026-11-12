// The build side of a live code block: hold every example to compiling
// (`qmlc`, the same compiler the page runs), give it a content hash, and
// write the static HTML a reader without JavaScript sees — the code, a
// picture of what it draws, and the payload hydration runs from.
//
// Pictures are drawn by the browser itself: a headless page compiles
// each example with the compiler in the page, mounts it, and takes
// `ljos-web/picture` of it, so the picture is what the running result
// replaces, pixel for pixel in kind. They are cached by content hash;
// an example whose code did not change is not drawn again.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { assemble, exampleFiles } from "./parse.js";

export { assemble };

// What an example is, for a cache: the files that compile, by name, and
// which is the entry. An edit anywhere changes it; nothing else does.
export function hashExample(example) {
  const { entry, files } = exampleFiles(example);
  const hash = createHash("sha256");
  hash.update(`${entry}\n`);
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
const payload = (example, picture) =>
  JSON.stringify({
    v: 1,
    entry: example.entry,
    before: example.before,
    ...(example.harness ? { harness: example.harness, harnessTemplate: example.harnessTemplate, harnessFile: example.harnessFile } : {}),
    display: example.display,
    ...(picture ? { picture } : {}),
  }).replaceAll("<", "\\u003c");

// The prerendered half of a block: the code, readable as code (a search
// engine and a reader without JavaScript get the same words), beside
// the picture, in a stage of the picture's own size so that the running
// result takes its place without the page moving. `picture` is
// `{ src, width, height }` — the root's logical size, from a manifest
// `renderPictures` wrote; without one the stage says so in words.
export function renderStatic(example, { picture } = {}) {
  const files = example.display
    .map(
      (file) =>
        `<div class="ljos-codeblock__source" data-file="${esc(file.name)}">` +
        (example.display.length > 1 ? `<p class="ljos-codeblock__file">${esc(file.name)}</p>` : "") +
        `<pre><code class="language-${esc(file.lang)}">${esc(file.code.replace(/\n$/, ""))}</code></pre></div>`,
    )
    .join("");
  const stage = picture
    ? `<img src="${esc(picture.src)}" width="${picture.width}" height="${picture.height}" alt="What this code draws" loading="lazy">`
    : `<p class="ljos-codeblock__nopicture">This example runs in the page, with JavaScript on.</p>`;
  const size = picture ? ` style="width:${picture.width}px;height:${picture.height}px"` : "";
  const head =
    (example.before ? `<span class="ljos-codeblock__before">Before</span>` : "") +
    (example.display.length === 1 ? `<span class="ljos-codeblock__file">${esc(example.harness ? `${example.entry} (in the ${example.harness} harness)` : example.display[0].name)}</span>` : "");
  return (
    `<figure class="ljos-codeblock" data-ljos-codeblock data-state="static">` +
    `<div class="ljos-codeblock__head">${head}</div>` +
    `<div class="ljos-codeblock__body"><div class="ljos-codeblock__code">${files}</div>` +
    `<div class="ljos-codeblock__stage"${size}>${stage}</div></div>` +
    `<script type="application/json" data-ljos-codeblock-data>${payload(example, picture)}</script></figure>`
  );
}

// A picture of every example that has none under `cacheDir`, drawn in a
// headless browser by the runtime itself. Answers `{ manifest,
// failures }`: the manifest `{ [hash]: { file, width, height } }`, also
// written to `cacheDir/manifest.json`, and each example that did not
// run, with the page's words about it. Drawing runs the example, so
// this is the run half of the build-time check; which failures fail a
// build is the caller's to say, as with `checkExamples`.
export async function renderPictures(examples, { cacheDir, port = 0 } = {}) {
  mkdirSync(cacheDir, { recursive: true });
  const at = join(cacheDir, "manifest.json");
  const manifest = existsSync(at) ? JSON.parse(readFileSync(at, "utf8")) : {};
  const missing = examples.filter((example) => {
    const had = manifest[hashExample(example)];
    return !had?.file || !existsSync(join(cacheDir, had.file));
  });
  if (missing.length === 0) return { manifest, failures: [] };

  const [{ chromium }, { createServer }] = await Promise.all([import("@playwright/test"), import("vite")]);
  const server = await createServer({
    configFile: false,
    root: import.meta.dirname,
    logLevel: "error",
    server: { host: "127.0.0.1", port, strictPort: port !== 0 },
  });
  await server.listen();
  const address = server.httpServer.address();
  const base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : port}`;
  const browser = await chromium.launch();
  const failures = [];
  try {
    const page = await browser.newPage();
    let problems = [];
    page.on("pageerror", (error) => problems.push(error.message));
    // One page for all of them: the compiler is fetched once, and each
    // example replaces the last where it stood.
    await page.goto(`${base}/picture.html`);
    await page.waitForFunction(() => window.ready);
    for (const example of missing) {
      problems = [];
      const hash = hashExample(example);
      const { entry, files } = exampleFiles(example);
      const made = await page
        .evaluate((request) => window.renderBlock(request), { files, entry })
        .catch((error) => ({ diagnostics: [{ file: entry, message: error.message }] }));
      if (made.diagnostics || problems.length > 0) {
        failures.push({
          example,
          diagnostics: [...(made.diagnostics ?? []).map((d) => `${d.file ?? entry}:${d.line ?? 1}: ${d.message}`), ...problems],
        });
        continue;
      }
      // The moment it is drawn at: an animation's first frame is the
      // picture every reader gets, the same for each build.
      const file = `${hash.slice(0, 16)}.png`;
      writeFileSync(join(cacheDir, file), Buffer.from(made.png, "base64"));
      manifest[hash] = { file, width: made.width, height: made.height };
      writeFileSync(at, `${JSON.stringify(manifest, null, 2)}\n`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
  return { manifest, failures };
}
