import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { listed, provided } from "../modules.js";

const runtime = join(import.meta.dirname, "..");

test("modules.json is what the package exports, with what is compiled from Qt and from Ljós", () => {
  const list = listed();
  expect(list).toEqual(provided());
  const exported = Object.keys(JSON.parse(readFileSync(join(runtime, "package.json"), "utf8")).exports)
    .filter((key) => /^\.\/[A-Z]/.test(key))
    .map((key) => key.slice(2).replaceAll("/", "."));
  for (const module of exported) expect(list.modules).toContainEqual(expect.objectContaining({ module, from: "runtime" }));
  expect(list.modules).toContainEqual({ module: "QtQuick.Controls", from: "qt", needs: ["qt"] });
  expect(list.modules).toContainEqual({ module: "Ljos.Design", from: "ljos", needs: ["with"] });
  expect(list.modules).toContainEqual({ module: "QtQuick", from: "runtime", needs: [] });
  // What the runtime has of a style is its C++ types; its controls are Qt's QML.
  expect(list.modules).toContainEqual({ module: "QtQuick.Controls.Material", from: "runtime", needs: ["qt"] });
  // Nothing that is no module: the kernel, the plugin, the builder.
  for (const name of ["runtime", "object", "vite", "site"]) expect(list.modules.map(({ module }) => module)).not.toContain(name);
});

test("`ljos-web modules --json` prints the list modules.json holds", () => {
  const ran = spawnSync(process.execPath, [join(runtime, "bin/ljos-web.js"), "modules", "--json"], { encoding: "utf8" });
  expect(ran.status).toBe(0);
  expect(JSON.parse(ran.stdout)).toEqual(listed());
});
