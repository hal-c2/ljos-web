// Shoots a built site as a reader's browser draws it, for /screenshots/:
//
//   node shots/capture.mjs --site solid=dist --site wasm=../dist-wasm \
//     --out dist/screenshots [--sha <commit>] [--date <ISO>] [--only <target>]
//
// Each `--site` is a kernel's build, a directory served here or an
// address already serving one. What is shot is targets.mjs's, on each
// kernel, in light and dark, at each of the target's sizes; a shot whose
// part of the page draws on a canvas is taken again with WebGPU taken
// away (WebGL 2). Each shot is judged as it is taken: a page that threw,
// a demo that did not start, a canvas that drew nothing make it broken;
// a canvas that moves on its own is named, to be left out of the
// comparison.
// Writes <out>/now/<id>.png, a thumbnail beside it (.webp), and
// <out>/manifest.json, which shots/compare.mjs completes against the
// deploy before. Exits 1 when any shot is broken.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { blank, difference, readPng } from "./pictures.mjs";
import { shotId, siteLists, slug, targets } from "./targets.mjs";

const { values } = parseArgs({
  options: {
    site: { type: "string", multiple: true },
    out: { type: "string" },
    sha: { type: "string", default: process.env.GITHUB_SHA ?? "" },
    date: { type: "string", default: new Date().toISOString() },
    repository: { type: "string", default: process.env.GITHUB_REPOSITORY ?? "hal-c2/ljos-web" },
    only: { type: "string", multiple: true, default: [] },
    "thumb-width": { type: "string", default: "560" },
    jobs: { type: "string", default: "3" },
    // The site's lists as one file ({ shells, shellKey, pro }), in place
    // of the bundle's own: what a test shoots a site of its own with.
    lists: { type: "string" },
    "first-frame": { type: "string", default: "15000" },
  },
});
if (!values.out || !values.site?.length) {
  console.error("usage: capture.mjs --site <kernel>=<dir|address> ... --out <dir>");
  process.exit(2);
}
const out = resolve(values.out);
mkdirSync(join(out, "now"), { recursive: true });
const thumbWidth = Number(values["thumb-width"]);

const here = new URL(".", import.meta.url).pathname;
const free = () =>
  new Promise((done, failed) => {
    const server = createServer();
    server.once("error", failed);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });

// A directory is served as the tests serve one (scripts/serve.mjs), at
// the root; an address is shot where it stands.
const servers = [];
async function served(where) {
  if (/^https?:\/\//.test(where)) return where.replace(/\/?$/, "/");
  const port = await free();
  const server = spawn(process.execPath, [join(here, "../scripts/serve.mjs"), resolve(where), String(port), "/"], { stdio: "ignore" });
  servers.push(server);
  const address = `http://127.0.0.1:${port}/`;
  for (let tries = 0; ; tries += 1) {
    try {
      if ((await fetch(address)).ok) return address;
    } catch {}
    if (tries > 100) throw new Error(`${where}: the server did not answer`);
    await new Promise((later) => setTimeout(later, 100));
  }
}

// The two GPU settings a shot is taken with. WebGL 2 is a browser with
// WebGPU off and its entry point gone, as a reader's browser without it.
// Chromium reads one --enable-features, the last, so each names all it
// turns on. Vulkan lets WebGPU use the machine's GPU where it has one;
// without one, Chromium falls back to SwiftShader.
const SHARED = ["--enable-unsafe-webgpu", "--use-angle=vulkan", "--ignore-gpu-blocklist"];
const gpus = {
  webgpu: { args: [...SHARED, "--enable-features=Vulkan,WebGPU"], init: null },
  webgl2: {
    args: [...SHARED, "--enable-features=Vulkan", "--disable-features=WebGPU"],
    init: () => {
      delete Navigator.prototype.gpu;
    },
  },
};

const lists = values.lists ? JSON.parse(readFileSync(values.lists, "utf8")) : siteLists();
const wanted = targets(lists).filter((target) => values.only.length === 0 || values.only.some((name) => target.target.startsWith(name) || name.startsWith(target.target)));

const frames = (page, count) =>
  page.evaluate(
    (count) =>
      new Promise((done) => {
        const next = (left) => (left === 0 ? done() : requestAnimationFrame(() => next(left - 1)));
        next(count);
      }),
    count,
  );

// The page has drawn what it will: hydrated, its fonts and pictures in,
// and some frames on so that what started has drawn.
async function settled(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const loaded = (image) =>
      new Promise((done) => {
        image.addEventListener("load", done, { once: true });
        image.addEventListener("error", done, { once: true });
        setTimeout(done, 5000);
      });
    await Promise.all([...document.images].filter((image) => !image.complete).map(loaded));
  });
  await frames(page, 10);
  await page.waitForTimeout(1500);
}

// Each section of a page: the highest box that starts with one of its
// level-2 headings and holds no other, marked so it can be shot alone.
const markSections = (page) =>
  page.evaluate(() => {
    const headings = [...document.querySelectorAll('[role="heading"][aria-level="2"], h2')].filter((heading) => heading.getBoundingClientRect().height > 0);
    return headings.map((heading, index) => {
      let box = heading;
      for (let up = heading.parentElement; up && up.id !== "app"; up = up.parentElement) {
        const top = Math.abs(up.getBoundingClientRect().top - heading.getBoundingClientRect().top) <= 1;
        const others = [...up.querySelectorAll('[role="heading"][aria-level="2"], h2')].some((other) => other !== heading && headings.includes(other));
        if (!top || others) break;
        box = up;
      }
      box.setAttribute("data-ljos-shot", String(index));
      return { index, title: heading.textContent.trim() };
    });
  });

// Presses the part's Run, where it has one, and waits for it to start:
// the button gone, as the demo stands in its picture's place.
async function run(part, problems) {
  const button = part.getByRole("button", { name: /^Run/ }).first();
  if (!(await button.isVisible().catch(() => false))) return;
  await button.scrollIntoViewIfNeeded();
  await button.click();
  try {
    await button.waitFor({ state: "hidden", timeout: 45_000 });
  } catch {
    problems.push("did not start: its Run stayed");
  }
}

// How long a canvas may take to draw its first frame after the page
// settles. A GPU's first frame can come late (its pipelines compile on
// first use), and a canvas read before it is blank though the reader
// sees the scene a moment later; one still blank after this never drew.
const FIRST_FRAME = Number(values["first-frame"]);

// How long a moving canvas is given to show it moves: two reads this
// far apart that differ (anti-aliasing left out) are of one that draws
// a new frame each moment, as a turning scene does.
const MOVES_WITHIN = 500;

// What tells the time (a watch face, a date) is shot at one moment, in
// one zone and language, wherever and whenever the capture runs: else
// each deploy's picture differs from the last by the clock alone. The
// timers are left alone, so what animates still does and a timer that
// throws is still seen to (Playwright's clock runs them itself, and
// what one throws never reaches the page).
const MOMENT = Date.parse("2026-01-01T10:09:30Z");
function holdTime(moment) {
  const Real = Date;
  function Fixed(...given) {
    if (!new.target) return new Real(moment).toString();
    return given.length === 0 ? new Real(moment) : new Real(...given);
  }
  Fixed.prototype = Real.prototype;
  Fixed.now = () => moment;
  Fixed.parse = Real.parse;
  Fixed.UTC = Real.UTC;
  globalThis.Date = Fixed;
}
const ZONE = "UTC";
const LANGUAGE = "en-GB";

// The canvases a part shows, each judged blank or not by its own
// pixels: what is drawn over a canvas (its labels, a control) is hidden
// while it is read, so a canvas that drew nothing under a label is
// still blank. A canvas that moves on its own is checked that it drew,
// and its box, where the part's picture holds it, is given back to be
// left out of the comparison: two runs of one build never catch it on
// the same frame.
async function canvases(page, part, whole, problems) {
  const found = await part.locator("canvas").all();
  let shown = 0;
  const moving = [];
  for (const canvas of found) {
    const box = await canvas.boundingBox();
    if (box === null || box.width < 8 || box.height < 8 || !(await canvas.isVisible())) continue;
    shown += 1;
    const read = async () => {
      await canvas.evaluate((element) => {
        const hidden = [];
        for (let child = element; child.parentElement; child = child.parentElement)
          for (const other of child.parentElement.children)
            if (other !== child && other.style.visibility !== "hidden") {
              hidden.push([other, other.style.visibility]);
              other.style.visibility = "hidden";
            }
        globalThis.__ljosShotHidden = hidden;
      });
      try {
        return readPng(await canvas.screenshot({ animations: "allow" }));
      } finally {
        await page.evaluate(() => {
          for (const [element, was] of globalThis.__ljosShotHidden ?? []) element.style.visibility = was;
          delete globalThis.__ljosShotHidden;
        });
      }
    };
    const until = Date.now() + FIRST_FRAME;
    let first = await read();
    let still = blank(first);
    while (still && Date.now() < until) {
      await page.waitForTimeout(500);
      first = await read();
      still = blank(first);
    }
    if (still) {
      problems.push(`blank canvas (${Math.round(box.width)}×${Math.round(box.height)}) after ${FIRST_FRAME / 1000} s`);
      continue;
    }
    await page.waitForTimeout(MOVES_WITHIN);
    if (difference(first, await read()).ratio === 0) continue;
    // Where the canvas is in the part's picture: the window's, or the
    // part's own box. Read after the scroll that put the part in view.
    const at = whole ? { x: 0, y: 0 } : await part.boundingBox();
    const now = (await canvas.boundingBox()) ?? box;
    moving.push({ x: Math.round(now.x - at.x), y: Math.round(now.y - at.y), width: Math.round(now.width), height: Math.round(now.height) });
  }
  return { shown, moving };
}

const shots = [];
const onGpu = new Set();

async function save(shot, png) {
  const file = `now/${shot.id}.png`;
  const thumb = `now/${shot.id}.webp`;
  writeFileSync(join(out, file), png);
  await sharp(png).resize({ width: thumbWidth, withoutEnlargement: true }).webp({ quality: 80 }).toFile(join(out, thumb));
  const { width, height } = readPng(png);
  if (blank(readPng(png))) shot.problems.push("blank picture");
  const ok = shot.problems.length === 0;
  shots.push({
    rank: shot.rank,
    id: shot.id,
    target: shot.target,
    kind: shot.kind,
    title: shot.title,
    route: shot.route,
    kernel: shot.kernel,
    gpu: shot.gpu,
    scheme: shot.scheme,
    shell: shot.shell,
    viewport: shot.viewport,
    file,
    thumb,
    width,
    height,
    health: { ok, problems: shot.problems },
    moving: shot.moving,
    before: null,
    diff: null,
    status: ok ? "new" : "broken",
    accepted: null,
  });
  console.log(`${ok ? "ok    " : "BROKEN"} ${shot.id}${ok ? "" : `: ${shot.problems.join("; ")}`}`);
}

async function visit(browser, gpu, init, site, kernel, target, rank, scheme, viewport) {
  // Sections are shot whole, so the window is as tall as the tallest one.
  const size = target.take === "sections" ? { ...viewport, height: 1400 } : viewport;
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, colorScheme: scheme, reducedMotion: "no-preference", timezoneId: ZONE, locale: LANGUAGE });
  await context.addInitScript(holdTime, MOMENT);
  if (init) await context.addInitScript(init);
  if (target.shell && lists.shellKey) await context.addInitScript(([key, shell]) => localStorage.setItem(key, shell), [lists.shellKey, target.shell]);
  const page = await context.newPage();
  let threw = [];
  page.on("pageerror", (error) => threw.push(`threw: ${String(error.message).split("\n")[0].slice(0, 200)}`));
  const base = { kind: target.kind, route: target.route, kernel, scheme, shell: target.shell, viewport: size };
  const loading = [];
  try {
    await page.goto(new URL(target.route.slice(1), site).href, { waitUntil: "load", timeout: 60_000 });
    await page.waitForSelector('#app[data-ljos-hydrated="true"]', { timeout: 60_000 });
  } catch (error) {
    loading.push(`did not load: ${String(error.message).split("\n")[0]}`);
  }
  await settled(page).catch(() => {});
  // Each part of the page a shot is of: the window, or each section.
  const parts =
    target.take === "view"
      ? [{ name: target.target, title: target.title, part: page.locator("body"), whole: true }]
      : (await markSections(page)).map((section) => ({
          name: `demo-${slug(section.title)}`,
          title: section.title,
          part: page.locator(`[data-ljos-shot="${section.index}"]`),
          whole: false,
        }));
  const atLoad = [...loading, ...threw];
  for (const [index, { name, title, part, whole }] of parts.entries()) {
    const key = `${name}.${viewport.name}`;
    // WebGL 2 is shot only for what drew on a canvas with WebGPU.
    if (gpu === "webgl2" && !onGpu.has(key)) continue;
    threw = [];
    const problems = [...atLoad];
    if (!whole) await part.scrollIntoViewIfNeeded();
    await run(part, problems);
    await settled(page);
    if (!whole) await part.scrollIntoViewIfNeeded();
    const { shown: drawn, moving } = await canvases(page, part, whole, problems);
    if (drawn > 0 && gpu === "webgpu") onGpu.add(key);
    problems.push(...threw);
    const used = drawn > 0 ? gpu : null;
    const png = whole ? await page.screenshot({ animations: "allow" }) : await part.screenshot({ animations: "allow" });
    await save({ ...base, rank: [rank, index], id: shotId({ target: name, kernel, gpu: used, scheme, viewport }), target: name, title, gpu: used, problems, moving }, png);
  }
  await context.close();
}

// A few pages at once: each waits mostly on its demo settling.
async function pool(jobs, width) {
  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: Math.min(width, queue.length) }, async () => {
      while (queue.length > 0) await queue.shift()();
    }),
  );
}

try {
  for (const entry of values.site) {
    const [kernel, where] = entry.split(/=(.*)/s);
    const site = await served(where);
    for (const [gpu, { args, init }] of Object.entries(gpus)) {
      const browser = await chromium.launch({ args });
      try {
        const jobs = wanted.flatMap((target, rank) =>
          ["light", "dark"].flatMap((scheme) => target.viewports.map((viewport) => () => visit(browser, gpu, init, site, kernel, target, rank, scheme, viewport))),
        );
        await pool(jobs, Number(values.jobs));
      } finally {
        await browser.close();
      }
    }
  }
} finally {
  for (const server of servers) server.kill();
}

// In the order of the site's lists, then by kernel, renderer, scheme and size.
const compared = (a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.id.localeCompare(b.id);
shots.sort(compared);
for (const shot of shots) delete shot.rank;

const manifest = {
  format: "ljos-shots",
  version: 1,
  repository: values.repository,
  sha: values.sha,
  date: values.date,
  threshold: 0,
  previous: null,
  gone: [],
  shots,
};
writeFileSync(join(out, "manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`);
const broken = shots.filter((shot) => shot.status === "broken");
console.log(`${shots.length} shots, ${broken.length} broken, in ${out}`);
process.exit(broken.length > 0 ? 1 : 0);
