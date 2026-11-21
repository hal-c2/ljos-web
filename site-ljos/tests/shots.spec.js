// What a deploy shoots for /screenshots/, how a picture is judged and
// how it is held against the deploy before's (site-ljos/shots/; the
// page itself is tests/screenshots.spec.js). The capture is run here on
// sites of the test's own: a good one passes, one whose canvas stays
// blank or that throws fails, as CI fails the deploy that drew it.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";
import { THRESHOLD, acceptedFor, blank, difference, readPng, sinceThen, writePng } from "../shots/pictures.mjs";
import { shellKeyOf, shellsOf, shotId, siteLists, targets, viewports } from "../shots/targets.mjs";

const scripts = new URL("../shots/", import.meta.url).pathname;
const scratch = (name) => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), `${name}-`));

// A picture of one colour, with a block of another where asked.
function picture(width, height, ground, block = null) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const inside = block !== null && x >= block.x && x < block.x + block.width && y >= block.y && y < block.y + block.height;
      const [r, g, b] = inside ? block.colour : ground;
      png.data.set([r, g, b, 255], (y * width + x) * 4);
    }
  return png;
}

test.describe("what is shot", () => {
  test("is read from the site's lists: each shell, each pro demo, the demos page", () => {
    const shells = `var key = "ljos.dev:shell";\nvar names = ["marketing", "workbench", "desktop"];\n`;
    expect(shellsOf(shells)).toEqual(["", "marketing", "workbench", "desktop"]);
    expect(shellKeyOf(shells)).toBe("ljos.dev:shell");
    // A site with no shells has the one it is prerendered in.
    expect(shellsOf(null)).toEqual([""]);
    expect(shellKeyOf(null)).toBeNull();

    const pro = [
      { name: "cockpit", title: "Svala GT" },
      { name: "harbour", title: "Harbour board" },
    ];
    const made = targets({ shells: shellsOf(shells), pro });
    expect(made.map((target) => [target.target, target.route, target.take])).toEqual([
      ["shell-default", "/", "view"],
      ["shell-marketing", "/", "view"],
      ["shell-workbench", "/", "view"],
      ["shell-desktop", "/", "view"],
      ["demos", "/demos/", "sections"],
      ["demo-cockpit", "/demos/cockpit/", "view"],
      ["demo-harbour", "/demos/harbour/", "view"],
    ]);
    for (const target of made.filter((target) => target.take === "view")) expect(target.viewports).toEqual([viewports.desktop, viewports.phone]);
  });

  test("the bundle's own lists name every pro demo", () => {
    const lists = siteLists();
    const pro = JSON.parse(readFileSync(new URL("../bundle/Demos/pro.json", import.meta.url), "utf8"));
    const made = targets(lists).map((target) => target.target);
    for (const demo of pro) expect(made).toContain(`demo-${demo.name}`);
    expect(made).toContain("shell-default");
  });

  test("a shot's id names its part, kernel, renderer, scheme and size", () => {
    expect(shotId({ target: "demo-cockpit", kernel: "wasm", gpu: "webgl2", scheme: "dark", viewport: viewports.phone })).toBe("demo-cockpit.wasm.webgl2.dark.phone");
    expect(shotId({ target: "shell-default", kernel: "solid", gpu: null, scheme: "light", viewport: viewports.desktop })).toBe("shell-default.solid.dom.light.desktop");
  });
});

test.describe("a picture", () => {
  test("of one colour is blank, and one with something drawn is not", () => {
    expect(blank(picture(200, 100, [14, 14, 16]))).toBe(true);
    // A gradient's last bits are noise, not a drawing.
    const ramp = picture(200, 100, [14, 14, 16]);
    for (let i = 0; i < ramp.data.length; i += 4) ramp.data[i] = 14 + (i % 3);
    expect(blank(ramp)).toBe(true);
    expect(blank(picture(200, 100, [14, 14, 16], { x: 20, y: 20, width: 40, height: 30, colour: [232, 163, 61] }))).toBe(false);
    expect(blank(new PNG({ width: 0, height: 0 }))).toBe(true);
  });

  test("differs from the one before by the share of its pixels that moved", () => {
    const before = picture(100, 100, [247, 245, 240], { x: 0, y: 0, width: 10, height: 10, colour: [26, 25, 23] });
    expect(difference(before, before).ratio).toBe(0);
    const moved = picture(100, 100, [247, 245, 240], { x: 50, y: 50, width: 10, height: 10, colour: [26, 25, 23] });
    const { ratio, picture: where } = difference(before, moved);
    expect(ratio).toBeCloseTo(0.02, 3);
    expect(ratio).toBeGreaterThan(THRESHOLD);
    expect(where.width).toBe(100);
    // Another size is wholly different, with no picture of where.
    expect(difference(before, picture(100, 90, [247, 245, 240]))).toEqual({ ratio: 1, picture: null });
  });

  test("that moves on its own is compared only where it holds still", () => {
    const before = picture(100, 100, [247, 245, 240], { x: 0, y: 0, width: 40, height: 40, colour: [232, 163, 61] });
    const turned = picture(100, 100, [247, 245, 240], { x: 0, y: 0, width: 40, height: 40, colour: [107, 75, 216] });
    const moving = [{ x: 0, y: 0, width: 40, height: 40 }];
    expect(difference(before, turned).ratio).toBeGreaterThan(THRESHOLD);
    expect(difference(before, turned, moving).ratio).toBe(0);
    // What changes beside it still counts, as a share of what is compared.
    const beside = picture(100, 100, [26, 25, 23], { x: 0, y: 0, width: 40, height: 40, colour: [107, 75, 216] });
    expect(difference(before, beside, moving).ratio).toBe(1);
    // Boxes the picture does not reach are cut to it.
    expect(difference(before, turned, [{ x: -10, y: -10, width: 60, height: 60 }]).ratio).toBe(0);
  });

  test("changed on purpose is taken only from what a pull request said since the deploy before", () => {
    const list = [
      { ids: ["demo-cockpit.*"], reason: "The cockpit's dock moved to the left.", pr: 140 },
      { ids: ["shell-default.solid.dom.light.phone"], reason: "Bigger header.", pr: 141 },
    ];
    expect(acceptedFor(list, "demo-cockpit.wasm.webgpu.dark.desktop")).toEqual({ reason: "The cockpit's dock moved to the left.", pr: 140 });
    expect(acceptedFor(list, "shell-default.solid.dom.light.phone")).toEqual({ reason: "Bigger header.", pr: 141 });
    expect(acceptedFor(list, "shell-default.solid.dom.dark.phone")).toBeNull();
    // The deploy before was built with the first entry already: it is no
    // pass for the cockpit changing again.
    const since = sinceThen(list, [list[0]]);
    expect(acceptedFor(since, "demo-cockpit.wasm.webgpu.dark.desktop")).toBeNull();
    expect(acceptedFor(since, "shell-default.solid.dom.light.phone")).not.toBeNull();
  });
});

// A capture's directory, its manifest and pictures written here.
function shotsDir(sha, pictures) {
  const dir = scratch(`shots-${sha}`);
  mkdirSync(join(dir, "now"));
  const shots = Object.entries(pictures).map(([id, png]) => {
    writeFileSync(join(dir, "now", `${id}.png`), writePng(png));
    return { id, target: id.split(".")[0], kind: "demo", title: id, route: "/", kernel: "solid", gpu: null, scheme: "light", shell: "", viewport: viewports.desktop, file: `now/${id}.png`, thumb: `now/${id}.webp`, width: png.width, height: png.height, health: { ok: true, problems: [] }, before: null, diff: null, status: "new", accepted: null };
  });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ format: "ljos-shots", version: 1, repository: "hal-c2/ljos-web", sha, date: "2026-11-20T12:00:00Z", threshold: 0, previous: null, gone: [], shots }));
  return dir;
}

const compare = (...args) => spawnSync(process.execPath, [join(scripts, "compare.mjs"), ...args], { encoding: "utf8" });

test.describe("held against the deploy before", () => {
  const ground = [247, 245, 240];
  const mark = (x) => ({ x, y: 10, width: 20, height: 20, colour: [26, 25, 23] });

  test("a change no pull request names fails the check; one it names passes, with its reason", () => {
    const before = shotsDir("aaaaaaa1", { "a.solid.dom.light.desktop": picture(80, 60, ground, mark(5)), "b.solid.dom.light.desktop": picture(80, 60, ground, mark(5)), "c.solid.dom.light.desktop": picture(80, 60, ground) });
    const now = shotsDir("bbbbbbb2", { "a.solid.dom.light.desktop": picture(80, 60, ground, mark(5)), "b.solid.dom.light.desktop": picture(80, 60, ground, mark(40)), "n.solid.dom.light.desktop": picture(80, 60, ground) });
    const none = join(now, "accepted.json");
    writeFileSync(none, JSON.stringify({ changes: [] }));
    const red = compare("--shots", now, "--before", join(before, "manifest.json"), "--accepted", none, "--check");
    expect(red.status, red.stdout + red.stderr).toBe(1);
    expect(red.stdout).toContain("changed b.solid.dom.light.desktop");

    const manifest = JSON.parse(readFileSync(join(now, "manifest.json"), "utf8"));
    const by = Object.fromEntries(manifest.shots.map((shot) => [shot.id, shot]));
    expect(manifest.previous).toEqual({ sha: "aaaaaaa1", date: "2026-11-20T12:00:00Z" });
    expect(manifest.gone).toEqual(["c.solid.dom.light.desktop"]);
    expect(by["a.solid.dom.light.desktop"].status).toBe("same");
    expect(by["a.solid.dom.light.desktop"].before.file).toBe("before/a.solid.dom.light.desktop.png");
    expect(by["b.solid.dom.light.desktop"].status).toBe("changed");
    expect(by["b.solid.dom.light.desktop"].diff.file).toBe("diff/b.solid.dom.light.desktop.png");
    expect(readPng(readFileSync(join(now, by["b.solid.dom.light.desktop"].diff.file))).width).toBe(80);
    expect(by["n.solid.dom.light.desktop"].status).toBe("new");

    const said = join(now, "said.json");
    writeFileSync(said, JSON.stringify({ changes: [{ ids: ["b.*"], reason: "The mark moved right.", pr: 7 }] }));
    const again = shotsDir("bbbbbbb2", { "a.solid.dom.light.desktop": picture(80, 60, ground, mark(5)), "b.solid.dom.light.desktop": picture(80, 60, ground, mark(40)) });
    const green = compare("--shots", again, "--before", join(before, "manifest.json"), "--accepted", said, "--check");
    expect(green.status, green.stdout + green.stderr).toBe(0);
    const passed = JSON.parse(readFileSync(join(again, "manifest.json"), "utf8"));
    expect(passed.shots.find((shot) => shot.id.startsWith("b.")).accepted).toEqual({ reason: "The mark moved right.", pr: 7 });
    expect(passed.declared).toEqual([{ ids: ["b.*"], reason: "The mark moved right.", pr: 7 }]);
  });

  test("with no deploy before, every picture is new and nothing fails", () => {
    const now = shotsDir("ccccccc3", { "a.solid.dom.light.desktop": picture(40, 30, ground, mark(5)) });
    const result = compare("--shots", now, "--before", join(now, "nothing.json"), "--check");
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const manifest = JSON.parse(readFileSync(join(now, "manifest.json"), "utf8"));
    expect(manifest.previous).toBeNull();
    expect(manifest.shots[0].status).toBe("new");
  });
});

// A site of the test's own, as the capture opens one: a hydrated page
// whose canvas is drawn late (its first frame after the page settles,
// as a GPU's can be), never, or which throws once it runs.
const page = (script) => `<!doctype html>
<html><head><meta charset="utf-8"><title>Fixture</title></head>
<body style="margin:0;background:#f7f5f0;color:#1a1917;font:16px sans-serif">
<div id="app" data-ljos-hydrated="true"><h1>A fixture</h1><canvas width="360" height="240"></canvas></div>
<script>${script}</script></body></html>`;
const draw = `const canvas = document.querySelector("canvas").getContext("2d");
const ramp = canvas.createLinearGradient(0, 0, 360, 240);
ramp.addColorStop(0, "#e8a33d");
ramp.addColorStop(1, "#6b4bd8");
canvas.fillStyle = ramp;
canvas.fillRect(0, 0, 360, 240);`;
const sites = {
  good: page(`setTimeout(() => { ${draw} }, 1800);`),
  blank: page(""),
  throws: page(`${draw}\nsetTimeout(() => { throw new Error("the scene has no camera"); }, 100);`),
  // A scene that turns: each frame another colour, as time goes on.
  moving: page(`const canvas = document.querySelector("canvas").getContext("2d");
const turn = (now) => {
  canvas.fillStyle = "#0e0e10";
  canvas.fillRect(0, 0, 360, 240);
  canvas.fillStyle = "#e8a33d";
  canvas.fillRect(Math.floor(now / 4) % 240, 80, 120, 80);
  requestAnimationFrame(turn);
};
requestAnimationFrame(turn);`),
};

function capture(kind) {
  const root = scratch(`site-${kind}`);
  writeFileSync(join(root, "index.html"), sites[kind]);
  const lists = join(root, "lists.json");
  writeFileSync(lists, JSON.stringify({ shells: [""], shellKey: null, pro: [] }));
  const out = scratch(`capture-${kind}`);
  const result = spawnSync(process.execPath, [join(scripts, "capture.mjs"), "--site", `solid=${root}`, "--out", out, "--lists", lists, "--only", "shell-default", "--first-frame", "6000", "--sha", "fixture"], { encoding: "utf8" });
  return { result, manifest: JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")) };
}

test.describe("a render", () => {
  test.describe.configure({ mode: "parallel", timeout: 240_000 });

  test("that draws, even late, is shot whole, on WebGPU and WebGL 2", () => {
    const { result, manifest } = capture("good");
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(manifest.shots.map((shot) => shot.id).sort()).toEqual(
      ["webgl2", "webgpu"].flatMap((gpu) => ["dark", "light"].flatMap((scheme) => ["desktop", "phone"].map((size) => `shell-default.solid.${gpu}.${scheme}.${size}`))).sort(),
    );
    for (const shot of manifest.shots) expect(shot.health, shot.id).toEqual({ ok: true, problems: [] });
    // It holds still once drawn, so all of it is compared.
    for (const shot of manifest.shots) expect(shot.moving, shot.id).toEqual([]);
  });

  test("that moves on its own is healthy, and its canvas is marked as left out of the comparison", () => {
    const { result, manifest } = capture("moving");
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(manifest.shots.length).toBeGreaterThan(0);
    for (const shot of manifest.shots) {
      expect(shot.health, shot.id).toEqual({ ok: true, problems: [] });
      // The canvas, where the picture holds it: under the fixture's heading.
      expect(shot.moving, shot.id).toHaveLength(1);
      expect(shot.moving[0], shot.id).toMatchObject({ x: 0, width: 360, height: 240 });
      expect(shot.moving[0].y, shot.id).toBeGreaterThan(0);
    }
  });

  test("whose canvas stays blank is broken, and the capture fails", () => {
    const { result, manifest } = capture("blank");
    expect(result.status, result.stdout).toBe(1);
    expect(manifest.shots.length).toBeGreaterThan(0);
    for (const shot of manifest.shots) {
      expect(shot.status, shot.id).toBe("broken");
      expect(shot.health.problems.join("; "), shot.id).toContain("blank canvas (360×240)");
    }
  });

  test("that throws is broken, and the capture fails", () => {
    const { result, manifest } = capture("throws");
    expect(result.status, result.stdout).toBe(1);
    for (const shot of manifest.shots) {
      expect(shot.status, shot.id).toBe("broken");
      expect(shot.health.problems, shot.id).toContain("threw: the scene has no camera");
    }
  });
});
