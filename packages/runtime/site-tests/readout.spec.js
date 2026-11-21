// What is read out of Qt's plugins into the cache, which every build that
// shares it reads: two builds at once, as the site's tests run them, each
// see a folder whole or not at all, and neither takes away what the other
// reads.
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";

const vite = pathToFileURL(join(import.meta.dirname, "../vite.js")).href;
const WHITE = Buffer.from("a white picture").toString("base64");

// A build's reading of `folder`, in a process of its own as each build is:
// the names it read, as JSON on its output.
function reading(tool, directory) {
  const script = `import { readOut } from ${JSON.stringify(vite)};
const { names } = readOut(${JSON.stringify(tool)}, "QtQuick3D.Effects", "qrc:/qtquick3deffects/maps", ${JSON.stringify(directory)});
console.log(JSON.stringify(names));`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
  let out = "";
  let err = "";
  child.stdout.on("data", (data) => (out += data));
  child.stderr.on("data", (data) => (err += data));
  return new Promise((done) => child.on("close", (code) => done({ code, err, names: code === 0 ? JSON.parse(out) : null })));
}

test("a build that reads a folder out of Qt while another is still reading it gets it whole, and both keep it", async () => {
  const root = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-read-out-"));
  try {
    const started = join(root, "started");
    const release = join(root, "release");
    // The first Qt to be asked reads nothing, as one that runs out of time
    // on a busy machine does, and only once the second build is done.
    const slow = join(root, "slow-qml");
    writeFileSync(slow, `#!/bin/sh\ntouch '${started}'\nwhile [ ! -e '${release}' ]; do sleep 0.05; done\n`);
    // The second reads the folder's one picture.
    const quick = join(root, "quick-qml");
    writeFileSync(quick, `#!/bin/sh\nprintf 'qml: kept white.png ${WHITE}\\n' >&2\n`);
    chmodSync(slow, 0o755);
    chmodSync(quick, 0o755);
    const directory = join(root, "cache", "6.12.0", "QtQuick3D", "Effects", "qtquick3deffects", "maps");

    const first = reading(slow, directory);
    await expect.poll(() => existsSync(started), { timeout: 10_000 }).toBe(true);
    const second = await reading(quick, directory);
    writeFileSync(release, "");
    const firstDone = await first;

    expect(second).toEqual({ code: 0, err: "", names: ["white.png"] });
    // The first read nothing itself, and has what the second kept.
    expect(firstDone).toEqual({ code: 0, err: "", names: ["white.png"] });
    expect(readdirSync(directory).filter((name) => !name.startsWith("."))).toEqual(["white.png"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("what Qt read nothing of is not kept, and the next build asks it again", async () => {
  const root = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-read-out-"));
  try {
    const silent = join(root, "silent-qml");
    writeFileSync(silent, "#!/bin/sh\n");
    const quick = join(root, "quick-qml");
    writeFileSync(quick, `#!/bin/sh\nprintf 'qml: kept white.png ${WHITE}\\n' >&2\n`);
    chmodSync(silent, 0o755);
    chmodSync(quick, 0o755);
    const directory = join(root, "cache", "maps");

    expect(await reading(silent, directory)).toEqual({ code: 0, err: "", names: [] });
    expect(existsSync(directory)).toBe(false);
    expect(await reading(quick, directory)).toEqual({ code: 0, err: "", names: ["white.png"] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
