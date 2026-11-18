// The pro demos: whole apps on pages of their own (/demos/<name>/),
// each one entry of bundle/Demos/pro.json. What the site makes for one
// is made from its entry alone, so a second demo needs its entry and
// its files and no change to the build, the shell or the demos page.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { expect, test } from "@playwright/test";
import { demos, loaders, pages, projectOf, route, sha256, shippedBy, sourceAt, targetOf, titles } from "../scripts/pro.mjs";

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
