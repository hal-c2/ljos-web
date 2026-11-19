// A prerendered site is built twice over at once: the page, and the
// server bundle the renders are made from, each by a Vite build with a
// plugin of its own. What the compiler says of a file is the same for
// both, and each run of it holds the event loop both builds share, so a
// build asks it each thing once.
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSite } from "../site.js";
import { bundle, compilerFile, design } from "./bundle.js";
import { expect, part, test } from "./served.js";

// Each run of the compiler, as where it was run and what it was asked,
// one run to a line: the stand-in logs it and runs the real one.
function counting(root) {
  const log = join(root, "asked.log");
  const file = join(root, "qmlc");
  writeFileSync(file, `#!/bin/sh\n{ printf '%s\\037' "$PWD" "$@"; echo; } >> '${log}'\nexec '${compilerFile}' "$@"\n`);
  chmodSync(file, 0o755);
  return { file, asked: () => readFileSync(log, "utf8").split("\n").filter(Boolean) };
}

test("a prerendered site asks the compiler each thing once, though its page and server bundle are built apart", async () => {
  const made = bundle("project");
  try {
    const qmlc = counting(made.root);
    await part("build the site", () => buildSite({ dir: made.dir, out: made.out, qmlc: qmlc.file, with: [design], prerender: true }));
    const asked = qmlc.asked();
    const runs = new Map();
    for (const line of asked) runs.set(line, (runs.get(line) ?? 0) + 1);
    const again = [...runs].filter(([, count]) => count > 1).map(([line, count]) => `${count}× ${line.split("\x1f").slice(1).join(" ")}`);
    expect(again).toEqual([]);
    // It was asked: the entry was compiled, through the stand-in.
    expect(asked.some((line) => line.endsWith("Shell.qml\x1f"))).toBe(true);
    expect(readFileSync(join(made.out, "index.html"), "utf8")).not.toContain('<div id="app"></div>');
  } finally {
    made.remove();
  }
});
