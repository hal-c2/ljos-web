// The pro demos: whole apps on pages of their own (/demos/<name>/),
// each one entry of bundle/Demos/pro.json. What the site makes for one
// is made from its entry alone, so a second demo needs its entry and
// its files and no change to the build, the shell or the demos page.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { expect, test } from "@playwright/test";
import { changedIn, demos, listedIn, loaders, pages, picturesOf, projectOf, route, sha256, shippedBy, sourceAt, targetOf, titles } from "../scripts/pro.mjs";
import { execFileSync } from "node:child_process";

const walk = (root, directory = root) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(root, join(directory, entry.name)) : [relative(root, join(directory, entry.name))]));

const second = {
  name: "harbour",
  dir: "Harbour",
  app: "HarbourDemo.qml",
  entry: "Main.qml",
  title: "Harbour board",
  description: "Ships coming in.",
  upstream: { repository: "example/apps", path: "harbour", leave: ["assets/raw.blend"] },
};

test("a second demo is its entry: its route, title, page, loaders and served files", () => {
  const two = [...demos, second];
  expect(two.map(route)).toEqual([...demos.map(route), "/demos/harbour/"]);
  expect(titles(two, " — Ljós")["/demos/harbour/"]).toBe("Harbour board — Ljós");
  expect(pages(two, " — Ljós").at(-1)).toEqual({ route: "/demos/harbour/", title: "Harbour board — Ljós", description: "Ships coming in.", props: { route: "/demos/harbour/" } });
  expect(sourceAt(second)).toBe("demos/harbour/source");
  const made = loaders(two);
  expect(made).toContain('case "harbour": return import("./HarbourDemo.qml");');
  expect(made).toContain('case "harbour": return import("./harbour-project.json");');
  for (const demo of demos) expect(made).toContain(`case ${JSON.stringify(demo.name)}: return import(${JSON.stringify(`./${demo.app}`)});`);
});

// pro-later.js is committed, so a checkout that has not been built is
// still one project for `ljos check` (pro-live.js imports it); the build
// writes it again, and this keeps the two the same.
test("the committed loaders are the ones the table makes", () => {
  expect(readFileSync(new URL("../bundle/Demos/pro-later.js", import.meta.url), "utf8")).toBe(loaders(demos));
});

test("a demo's editor holds its QML and TypeScript, as the pin names them", () => {
  const root = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "pro-"));
  mkdirSync(join(root, "logic"));
  writeFileSync(join(root, "Main.qml"), "import QtQuick\nItem {}\n");
  writeFileSync(join(root, "logic/sea.ts"), "export const tide = 1;\n");
  writeFileSync(join(root, "UPSTREAM.json"), JSON.stringify({ commit: "c0ffee", files: { "Main.qml": "", "logic/sea.ts": "", "assets/ship.glb": "" } }));
  const project = projectOf(root, (code, lang) => [{ code, lang }]);
  expect(project.commit).toBe("c0ffee");
  expect(project.files.map(({ path, lang }) => [path, lang])).toEqual([
    ["Main.qml", "qml"],
    ["logic/sea.ts", "ts"],
  ]);
});

test("a demo ships its QML, TypeScript and assets, and leaves what made them", () => {
  const shipped = shippedBy(second);
  expect(["Main.qml", "logic/sea.ts", "assets/ship.glb"].every(shipped)).toBe(true);
  expect(["assets/raw.blend", "README.md", "Cargo.toml", "src/lib.rs"].some(shipped)).toBe(false);
});

// sync-demo.mjs reads the checkout through git: a path with a space, a
// quote or a letter outside ASCII is the file's own name, and a file
// renamed into or out of the app is changed on both sides.
test("a checkout's files are read by their own names, renames on both sides", () => {
  const root = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "sync-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "sync@example.invalid");
  git("config", "user.name", "sync");
  mkdirSync(join(root, "app/logic"), { recursive: true });
  mkdirSync(join(root, "app/assets"));
  for (const path of ["app/logic/door controls.ts", "app/assets/hjól.glb", "app/Main.qml", "app/Old.qml"]) writeFileSync(join(root, path), "1\n");
  git("add", "-A");
  git("commit", "-qm", "app");
  expect(listedIn(git("ls-files", "-z", "--", "app"), "app").sort()).toEqual(["Main.qml", "Old.qml", "assets/hjól.glb", "logic/door controls.ts"]);
  writeFileSync(join(root, "app/logic/door controls.ts"), "2\n");
  git("mv", "app/Old.qml", "New.qml");
  expect(changedIn(git("status", "--porcelain=v1", "-z", "--", "app", "New.qml"), "app").sort()).toEqual(["Old.qml", "logic/door controls.ts"]);
});

// A rename git found in the worktree carries its R in the second column.
test("a rename marked in the worktree column is changed on both sides", () => {
  expect(changedIn(" R notes.txt\0app/Old.qml\0", "app")).toEqual(["Old.qml"]);
  // The source of a copy is a path, not a record: none of it is cut away.
  expect(changedIn(" C app/Copy.qml\0bigapp/Main.qml\0", "app")).toEqual(["Copy.qml"]);
});

for (const demo of demos) {
  const target = targetOf(demo);
  const upstream = JSON.parse(readFileSync(join(target, "UPSTREAM.json"), "utf8"));

  test(`${route(demo)}'s files are those of the commit they name`, () => {
    expect(upstream.repository).toBe(demo.upstream.repository);
    expect(upstream.path).toBe(demo.upstream.path);
    expect(upstream.commit).toMatch(/^[0-9a-f]{40}$/);
    const changed = Object.entries(upstream.files).filter(([path, hash]) => !existsSync(join(target, path)) || sha256(readFileSync(join(target, path))) !== hash);
    expect(changed.map(([path]) => path), `change ${demo.upstream.repository}'s ${demo.upstream.path} and run scripts/sync-demo.mjs ${demo.name}`).toEqual([]);
  });

  test(`${route(demo)}'s copy holds what the app runs on and nothing else`, () => {
    const here = walk(target).filter((path) => path !== "UPSTREAM.json").sort();
    expect(here).toEqual(Object.keys(upstream.files).sort());
    expect(here.every(shippedBy(demo))).toBe(true);
    expect(here).toContain(demo.entry);
  });
}

// A WebP's size, from its header: lossy (VP8), lossless (VP8L) or
// extended (VP8X).
const webpSize = (bytes) => {
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8X") return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
  if (chunk === "VP8 ") return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  const bits = bytes.readUInt32LE(21);
  return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
};

// Every picture an entry names is there, in the shape it stands for: the
// demo's own, and its compact one where it has one, so a frame is never
// given a picture stretched to it (Nav.proPicture).
for (const demo of demos) {
  test(`${route(demo)}'s pictures are there, each in its shape`, () => {
    for (const { file, width, height } of picturesOf(demo)) {
      const path = new URL(`../bundle/assets/${file}`, import.meta.url);
      expect(existsSync(path), file).toBe(true);
      const size = webpSize(readFileSync(path));
      expect(Math.abs(size.height - Math.round((size.width * height) / width)), `${file} is ${size.width} by ${size.height}`).toBeLessThanOrEqual(1);
    }
  });
}
