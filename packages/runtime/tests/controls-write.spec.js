// `controls.js write`, the copy of ljos-ui's QML into `controls/`, run as
// `mise run controls` runs it: in a Node process of its own.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as plain, expect } from "@playwright/test";
import { check } from "../controls.js";

const CONTROLS_JS = join(import.meta.dirname, "../controls.js");

// A checkout's two directories: `crates/ljos_controls/qml` (a style and
// Ljós's own controls) and `crates/ljos_design_qml/qml`. Many files, so a
// write takes long enough for another to start while it runs.
function checkout(at) {
  const from = join(at, "controls");
  const design = join(at, "design");
  const files = {
    [`${from}/QtQuick/Controls/Basic`]: 600,
    [`${from}/Ljos/Controls`]: 600,
    [`${design}/Ljos/Design`]: 300,
  };
  for (const [directory, count] of Object.entries(files)) {
    mkdirSync(directory, { recursive: true });
    for (let i = 0; i < count; i++) writeFileSync(join(directory, `Part${i}.qml`), `import QtQuick\nItem { objectName: "part ${i}" }\n`);
  }
  return { from, design };
}

const write = (from, rev, root, design) =>
  new Promise((resolve) => {
    const script = `import { write } from ${JSON.stringify(CONTROLS_JS)}; write(...process.argv.slice(1));`;
    const run = spawn(process.execPath, ["--input-type=module", "-e", script, from, rev, root, design], { stdio: ["ignore", "ignore", "pipe"] });
    let said = "";
    run.stderr.on("data", (chunk) => (said += chunk));
    run.on("close", (code) => resolve({ code, said }));
  });

plain("writes at once each finish, and leave one whole tree and nothing beside it", async () => {
  const at = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-controls-"));
  try {
    const { from, design } = checkout(at);
    const into = join(at, "runtime");
    const root = join(into, "controls");
    const rev = "0".repeat(40);
    const runs = await Promise.all([write(from, rev, root, design), write(from, rev, root, design), write(from, rev, root, design)]);
    expect(runs, "every write finished, and said nothing went wrong").toEqual(runs.map(() => ({ code: 0, said: "" })));
    expect(check(root), "the tree is whole: every file, and each qmldir its files make").toEqual([]);
    expect(readdirSync(into), "no write's own tree or lock is left").toEqual(["controls"]);
  } finally {
    rmSync(at, { recursive: true, force: true });
  }
});
