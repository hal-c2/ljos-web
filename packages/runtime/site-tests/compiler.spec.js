// A compiler run holds Node's event loop until it ends, so its own bound is
// the only one: a compiler that hangs is ended, and says it did not end.
// A dev server's run does not hold it: the server goes on answering.
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createServer } from "vite";
import qml, { compilerRun, runCompiler } from "../vite.js";

test("a compiler run that does not end is ended at its bound, and says so", () => {
  const since = Date.now();
  const ran = runCompiler("sh", ["-c", "sleep 30"], { encoding: "utf8", timeout: 300 });
  // Ended before the run it bounds would have: what tells the bound from
  // a wait for the run is the run's own 30 s, which a loaded machine only
  // lengthens; a few seconds of slack in place of it failed one.
  expect(Date.now() - since).toBeLessThan(30_000);
  expect(ran.error?.code).toBe("ETIMEDOUT");
  expect(ran.error.message).toBe("it did not end within 0.3 s (sh -c sleep 30)");
});

test("a compiler run that ends is as spawnSync gives it", () => {
  const ran = runCompiler("sh", ["-c", "echo said; exit 3"], { encoding: "utf8" });
  expect(ran.error).toBeUndefined();
  expect(ran.status).toBe(3);
  expect(ran.stdout).toBe("said\n");
});

test("a dev server's compiler run that does not end is ended at its bound, and says so", async () => {
  const since = Date.now();
  const ran = await compilerRun("sh", ["-c", "sleep 30"], { encoding: "utf8", timeout: 300 });
  expect(Date.now() - since).toBeLessThan(30_000);
  expect(ran.error?.code).toBe("ETIMEDOUT");
  expect(ran.error.message).toBe("it did not end within 0.3 s (sh -c sleep 30)");
});

test("a dev server's compiler run that ends is as spawnSync gives it", async () => {
  const ran = await compilerRun("sh", ["-c", "echo said; echo told >&2; exit 3"], { encoding: "utf8" });
  expect(ran.error).toBeUndefined();
  expect(ran.status).toBe(3);
  expect(ran.stdout).toBe("said\n");
  expect(ran.stderr).toBe("told\n");
});

// The gallery's samegame was pictured without its pictures: the server held
// by another page's compile did not send them in time.
test("a dev server goes on answering while a file compiles", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ljos-web-compiling-"));
  // A compiler that takes its time over a QML file, and has nothing to say
  // of anything else it is asked.
  const qmlc = join(dir, "qmlc");
  writeFileSync(qmlc, '#!/bin/sh\nfor last; do :; done\ncase "$last" in *.qml) sleep 2; echo "export default function Main() {}";; esac\n', { mode: 0o755 });
  writeFileSync(join(dir, "Main.qml"), "import QtQuick\nItem {}\n");
  const server = await createServer({
    configFile: false,
    root: dir,
    logLevel: "silent",
    server: { middlewareMode: true, hmr: false, watch: null },
    plugins: [qml({ qmlc, qt: [dir], root: dir, styles: "ljos" })],
  });
  try {
    // How many turns the event loop took while the file compiled: a compile
    // that held it gives none until it ends. Counted, not the longest gap
    // between turns, which a loaded machine stretches past any bound.
    let turns = 0;
    const ticking = setInterval(() => turns++, 20);
    const since = Date.now();
    const compiled = await server.transformRequest("/Main.qml").finally(() => clearInterval(ticking));
    expect(Date.now() - since).toBeGreaterThanOrEqual(2000);
    expect(compiled.code).toContain("function Main");
    expect(turns, "turns of the event loop while the file compiled for 2 s").toBeGreaterThanOrEqual(10);
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

// Killing the shell does not kill what it started, and that holds the
// output's pipes: the run ends when they are closed, not when it is killed.
test("a dev server's compiler run that left a process holding its output is ended at its bound", async () => {
  const since = Date.now();
  const ran = await compilerRun("sh", ["-c", "sleep 30; :"], { encoding: "utf8", timeout: 300 });
  expect(Date.now() - since).toBeLessThan(30_000);
  expect(ran.error?.code).toBe("ETIMEDOUT");
});

// Qt's own QML is compiled once and kept. A save while it compiles makes
// what that compile gives back old: it is not kept, or the next load would
// give back what the file said before the save.
test("a file saved while it compiles is compiled again, not given back as it was", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ljos-web-saved-"));
  const qmlc = join(dir, "qmlc");
  // The file is the module it compiles to, read once the compile has begun.
  // Read under another name and moved: `.read` is there only once the read
  // is done, where a redirect makes it before `cat` has read anything.
  writeFileSync(qmlc, '#!/bin/sh\nfor last; do :; done\ncase "$last" in *.qml) cat "$last" > "$last.reading" && mv "$last.reading" "$last.read"; sleep 1; cat "$last.read";; esac\n', { mode: 0o755 });
  const file = join(dir, "Main.qml");
  writeFileSync(file, "export default function Before() {}\n");
  const server = await createServer({
    configFile: false,
    root: dir,
    logLevel: "silent",
    // A save reaches the plugin with hot updates on, the watcher told by hand.
    server: { middlewareMode: true, hmr: true, watch: null },
    plugins: [qml({ qmlc, qt: [dir], root: dir, styles: "ljos" })],
  });
  try {
    const first = server.transformRequest("/Main.qml");
    // Saved once the compile has read the file, however long it took to
    // start: 300 ms on, a loaded machine's compile could read the save.
    while (!existsSync(`${file}.read`)) await new Promise((resolve) => setTimeout(resolve, 10));
    writeFileSync(file, "export default function After() {}\n");
    server.watcher.emit("change", file);
    await first.catch(() => null);
    // Vite's own result is let go of as a page reloaded later would; what
    // the plugin kept is all that is left to give the old file back.
    server.moduleGraph.invalidateAll();
    expect((await server.transformRequest("/Main.qml"))?.code).toContain("function After");
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
