// What the site contract rules out, each refused before anything is
// compiled or written.
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { buildSite } from "../site.js";
import { bundle, design, qmlc } from "./bundle.js";

const file = (manifest, path) => manifest.files.find((entry) => entry.path === path);
const add = (dir, manifest, path, text) => {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), text);
  manifest.files.push({ path, bytes: Buffer.byteLength(text) });
  manifest.files.sort((a, b) => (a.path < b.path ? -1 : 1));
};

// A line put at the top of a listed file, the manifest kept true of it.
const edit = (dir, manifest, path, line) => {
  const text = `${line}${readFileSync(join(dir, path), "utf8")}`;
  writeFileSync(join(dir, path), text);
  file(manifest, path).bytes = Buffer.byteLength(text);
};

const REFUSED = [
  ["a bundle of another format is refused", (_, m) => (m.format = "ljos-bundle"), /a ljos-bundle 1 for web is not a site bundle this builds/],
  ["a bundle of another version is refused", (_, m) => (m.version = 2), /a ljos-site 2 for web is not a site bundle this builds/],
  ["a bundle for another target is refused", (_, m) => (m.target = "native"), /a ljos-site 1 for native is not a site bundle this builds/],
  ["a manifest with a field the contract does not have is refused", (_, m) => (m.run = ["ljos", "run"]), /ljos-site.json has a field the contract does not: run/],
  ["a file entry with a field the contract does not have is refused", (_, m) => (file(m, "Shell.qml").hash = "x"), /ljos-site.json.files\[\d+\] has a field the contract does not: hash/],
  ["a manifest without a field the contract requires is refused", (_, m) => delete m.left_out, /ljos-site.json has no left_out/],
  ["a commit that is not one is refused", (_, m) => (m.ljos_web = "main"), /main is not an ljos-web commit/],
  ["a file in the bundle the manifest does not list is refused", (dir) => writeFileSync(join(dir, "stray.txt"), "?\n"), /stray.txt is in the bundle but not in its manifest/],
  ["a listed file that is not there is refused", (dir) => rmSync(join(dir, "images/logo.svg")), /images\/logo.svg is listed but is not there/],
  ["a listed file of another size is refused", (dir) => writeFileSync(join(dir, "theme.json"), "{}\n"), /theme.json is 3 bytes; the manifest says 15/],
  ["a file listed twice is refused", (_, m) => m.files.push({ ...file(m, "Shell.qml") }), /Shell.qml is listed twice/],
  ["a path out of the bundle is refused", (_, m) => m.files.push({ path: "../outside.qml", bytes: 1 }), /\.\.\/outside.qml is not a plain path below the bundle/],
  ["an absolute path is refused", (_, m) => m.files.push({ path: "/etc/hostname", bytes: 1 }), /\/etc\/hostname is not a plain path below the bundle/],
  ["a designer's mock module is refused", (dir, m) => add(dir, m, "mocks/App/Media/Player.qml", "import QtQuick\nItem {}\n"), /mocks\/App\/Media\/Player.qml is a designer's, not the site's/],
  ["types written in Rust are refused", (dir, m) => add(dir, m, "ljostypes.json", "{}\n"), /ljostypes.json declares types written in Rust/],
  ["a link in the bundle is refused", (dir) => symlinkSync("images", join(dir, "pictures")), /pictures is a link/],
  ["an entry that is not a listed document is refused", (_, m) => (m.entry = "Main.qml"), /the entry Main.qml is not a listed document/],
  ["a theme that is not a listed file is refused", (_, m) => (m.theme = "dark.json"), /the theme dark.json is not a listed file/],
  ["a module whose qmldir is not listed is refused", (_, m) => (m.modules[0].qmldir = "App/Player/qmldir"), /App.Media's qmldir App\/Player\/qmldir is not a listed qmldir/],
  ["a module its qmldir does not declare is refused", (_, m) => (m.modules[0].module = "App.Music"), /App\/Media\/qmldir declares App.Media; the manifest says App.Music/],
  ["a module named twice is refused", (_, m) => m.modules.push({ ...m.modules[0] }), /App.Media is in modules twice/],
  ["a qmldir that declares a module the manifest does not name is refused", (_, m) => (m.modules = []) && (m.imports = [...m.imports, "App.Media"].sort()), /App\/Media\/qmldir declares module App.Media, which modules does not name/],
  ["a type a qmldir names that is not listed is refused", (dir, m) => {
    rmSync(join(dir, "App/Media/Player.qml"));
    m.files = m.files.filter((entry) => entry.path !== "App/Media/Player.qml");
  }, /App\/Media\/qmldir names App\/Media\/Player.qml, which is not listed/],
  ["an import ljos-web does not provide is refused", (_, m) => (m.imports = [...m.imports, "QtWebEngine"].sort()), /it imports QtWebEngine, which ljos-web does not provide/],
  ["imports out of order are refused", (_, m) => m.imports.reverse(), /imports is not sorted, each once/],
  ["a document's import the manifest does not say is refused", (_, m) => (m.imports = m.imports.filter((module) => module !== "Ljos.Design")), /Shell.qml imports Ljos.Design, which the manifest neither lists as a module nor imports/],
  ["a path import out of the bundle is refused", (dir, m) => edit(dir, m, "Shell.qml", 'import "../outside"\n'), /Shell.qml imports \.\.\/outside, which is outside the bundle/],
  ["a script import out of the bundle is refused", (dir, m) => edit(dir, m, "Shell.qml", 'import "../secret.js" as S\n'), /Shell.qml imports \.\.\/secret.js, which is outside the bundle/],
  ["a path import that climbs out from below is refused", (dir, m) => edit(dir, m, "App/Media/Player.qml", 'import "../../../outside"\n'), /App\/Media\/Player.qml imports \.\.\/\.\.\/\.\.\/outside, which is outside the bundle/],
  ["an absolute path import is refused", (dir, m) => edit(dir, m, "Shell.qml", 'import "/etc/qml"\n'), /Shell.qml imports \/etc\/qml, which is outside the bundle/],
  ["a URL import is refused", (dir, m) => edit(dir, m, "Shell.qml", 'import "https://example.com/Module"\n'), /Shell.qml imports https:\/\/example.com\/Module, which is outside the bundle/],
  ["a path import of a file not listed is refused", (dir, m) => edit(dir, m, "Shell.qml", 'import "absent.js" as A\n'), /Shell.qml imports absent.js, which is not listed/],
  ["a path import of a directory with nothing listed is refused", (dir, m) => edit(dir, m, "Shell.qml", 'import "absent"\n'), /Shell.qml imports absent, which is not listed/],
  ["a path import in single quotes is seen", (dir, m) => edit(dir, m, "Shell.qml", "import '../outside'\n"), /Shell.qml imports \.\.\/outside, which is outside the bundle/],
  ["a path import after a comment is seen", (dir, m) => edit(dir, m, "Shell.qml", '/* c */ import "../outside"\n'), /Shell.qml imports \.\.\/outside, which is outside the bundle/],
  ["a path import after another with no semicolon is seen", (dir, m) => edit(dir, m, "Shell.qml", 'import QtQuick import "../outside"\n'), /Shell.qml imports \.\.\/outside, which is outside the bundle/],
  ["a document the parser cannot read is refused where it is wrong", (dir, m) => edit(dir, m, "Shell.qml", "import\n"), /Shell\.qml:\d+:\d+: /],
  ["a path import after another on its line is seen", (dir, m) => edit(dir, m, "Shell.qml", 'import QtQuick; import "../outside"\n'), /Shell.qml imports \.\.\/outside, which is outside the bundle/],
  ["a block whose file is outside the bundle is refused", (dir, m) => edit(dir, m, "App/Media/qmldir", "# block Secret 1.0 ../../../Secret.qml\n"), /App\/Media\/qmldir names \.\.\/\.\.\/\.\.\/Secret.qml, which is outside the bundle/],
  ["a block whose file is not listed is refused", (dir, m) => edit(dir, m, "App/Media/qmldir", "# block Absent 1.0 Absent.qml\n"), /App\/Media\/qmldir names App\/Media\/Absent.qml, which is not listed/],
];

for (const [name, change, refusal] of REFUSED) {
  test(name, async () => {
    const made = bundle("project", change);
    try {
      await expect(buildSite({ dir: made.dir, out: made.out, qmlc, with: [design] })).rejects.toThrow(refusal);
      expect(existsSync(made.out)).toBe(false);
    } finally {
      made.remove();
    }
  });
}

test("a directory without a manifest is no site bundle", async () => {
  const made = bundle("project");
  try {
    rmSync(join(made.dir, "ljos-site.json"));
    await expect(buildSite({ dir: made.dir, out: made.out, qmlc })).rejects.toThrow(/holds no ljos-site.json/);
  } finally {
    made.remove();
  }
});

test("a site that imports Ljos.Design is refused without the directory of its QML, which the error names", async () => {
  const made = bundle("project");
  try {
    await expect(buildSite({ dir: made.dir, out: made.out, qmlc })).rejects.toThrow(/it imports Ljos.Design, .*--with \(ljos-ui's crates\/ljos_design_qml\/qml\)/);
  } finally {
    made.remove();
  }
});

test("a site is not built inside its own bundle", async () => {
  const made = bundle("project");
  try {
    await expect(buildSite({ dir: made.dir, out: join(made.dir, "site"), qmlc, with: [design] })).rejects.toThrow(/is inside the bundle/);
  } finally {
    made.remove();
  }
});

test("what only looks like an import is not one, and a directory may end in a slash", async () => {
  const made = bundle("project", (dir, m) => {
    add(dir, m, "parts/Own.qml", 'import QtQuick\nItem { property string s: "done; import nothing" }\n');
    edit(dir, m, "Shell.qml", '/*\nimport "../old"\nimport Gone\n*/\nimport "parts/"\n');
  });
  try {
    await expect(buildSite({ dir: made.dir, out: made.out, qmlc, with: [design] })).resolves.toMatchObject({ out: made.out });
  } finally {
    made.remove();
  }
});

test("what a document imports by path from the bundle's own files is built", async () => {
  const made = bundle("project", (dir, m) => {
    add(dir, m, "parts/Own.qml", "import QtQuick\nItem {}\n");
    add(dir, m, "parts/own.js", "function one() { return 1 }\n");
    edit(dir, m, "Shell.qml", 'import "parts"\nimport "parts/own.js" as Own\n');
  });
  try {
    await expect(buildSite({ dir: made.dir, out: made.out, qmlc, with: [design] })).resolves.toMatchObject({ out: made.out });
  } finally {
    made.remove();
  }
});
