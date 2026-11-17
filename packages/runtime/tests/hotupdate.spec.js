// A dev server's QML that Qt's modules hold (a root `qt` names, or Ljós's own
// `controls/`) is compiled once, whichever programs come to it. A save is
// taken in: the saved file, the ones beside it and those that import them
// are compiled again, and the rest of what is kept is kept.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "@playwright/test";
import { createServer } from "vite";
import qml from "../vite.js";

const qmlc = process.env.QMLC ?? join(import.meta.dirname, "../../../target/debug/qmlc");

test("a saved QML file of a Qt root is compiled again, with what is beside it and what imports it, and nothing else", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ljos-web-hot-"));
  const own = join(dir, "own");
  const files = {
    "Mine/Shapes/qmldir": "module Mine.Shapes\nBox 1.0 Box.qml\nFrame 1.0 Frame.qml\n",
    "Mine/Shapes/Box.qml": "import QtQuick\n\nItem { width: 1234 }\n",
    "Mine/Shapes/Frame.qml": "import QtQuick\n\nItem { height: 5 }\n",
    "Mine/Use/qmldir": "module Mine.Use\nUse 1.0 Use.qml\n",
    "Mine/Use/Use.qml": "import QtQuick\nimport Mine.Shapes\n\nBox {}\n",
    "Mine/Far/qmldir": "module Mine.Far\nFar 1.0 Far.qml\n",
    "Mine/Far/Far.qml": "import QtQuick\n\nItem { width: 7 }\n",
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(own, path)), { recursive: true });
    writeFileSync(join(own, path), text);
  }
  // The compiler, saying which file each run of it compiles (it is asked
  // about modules too, which is no compile).
  const log = join(dir, "compiled.log");
  const counting = join(dir, "qmlc");
  writeFileSync(counting, `#!/bin/sh\nfor last; do :; done\ncase "$last" in *.qml) echo "\${last##*/}" >> "${log}";; esac\nexec "${qmlc}" "$@"\n`);
  chmodSync(counting, 0o755);
  const runs = () => readFileSync(log, "utf8").trim().split("\n");
  let told;
  const hot = new Promise((resolve) => (told = resolve));
  const server = await createServer({
    configFile: false,
    root: dir,
    logLevel: "silent",
    server: { middlewareMode: true, ws: false, watch: null },
    plugins: [
      qml({ qmlc: counting, qt: [join(import.meta.dirname, "qt"), own], styles: "qt" }),
      // Runs after the plugin's own `hotUpdate`, on the same save.
      { name: "told", hotUpdate() { if (this.environment.name === "client") told(); } },
    ],
  });
  try {
    const client = (name) => server.environments.client.transformRequest(`/own/Mine/${name}`);
    const ssr = (name) => server.environments.ssr.transformRequest(`/own/Mine/${name}`);
    for (const name of ["Shapes/Box.qml", "Shapes/Frame.qml", "Use/Use.qml", "Far/Far.qml"]) await client(name);
    expect(runs()).toEqual(["Box.qml", "Frame.qml", "Use.qml", "Far.qml"]);

    const box = join(own, "Mine/Shapes/Box.qml");
    writeFileSync(box, files["Mine/Shapes/Box.qml"].replace("1234", "5678"));
    server.watcher.emit("change", box);
    await hot;

    expect((await client("Shapes/Box.qml")).code).toContain("5678");
    for (const name of ["Shapes/Frame.qml", "Use/Use.qml"]) await client(name);
    // Another environment asks for them all: what the save touched is
    // compiled again, once, and the rest is what was kept.
    for (const name of ["Shapes/Box.qml", "Shapes/Frame.qml", "Use/Use.qml", "Far/Far.qml"]) await ssr(name);
    expect(runs().slice(4).sort()).toEqual(["Box.qml", "Frame.qml", "Use.qml"]);
    expect((await ssr("Shapes/Box.qml")).code).toContain("5678");
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
