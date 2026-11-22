// A reload beside the hidden names the runtime's own types keep on their
// objects (site-ljos/features/reload.feature): a Controller, a 3D graph and
// a particle system each hold something of theirs as `$declared`.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { build } from "vite";
import qml from "../vite.js";
import { qmlc } from "./bundle.js";
import { expect, part, serve, shared, test } from "./served.js";

const runtime = join(import.meta.dirname, "..");

// Each declares a list, which is what a reload takes a copy of.
const TYPES = {
  Controllers: `import QtQuick
import Ljos.Core

Item {
    property alias subject: subject
    property alias inner: inner

    Controller {
        id: subject
        property var stock: []

        Controller {
            id: inner
        }
    }
}
`,
  Graph: `import QtQuick
import QtGraphs

Item {
    property alias subject: subject
    property alias series: series

    Bars3D {
        id: subject
        property var stock: []

        Bar3DSeries {
            id: series
        }
    }
}
`,
  System: `import QtQuick
import QtQuick3D.Particles3D

Item {
    property alias subject: subject

    ParticleSystem3D {
        id: subject
        running: false
        time: 5
        property var stock: []
    }
}
`,
};
// The same file saved again: a module of its own, as each save is.
const SAVES = ["first", "next"];

const imported = (path) => JSON.stringify(join(runtime, path));
const FILES = {
  "index.html": '<!doctype html><script type="module" src="/main.js"></script>',
  ...Object.fromEntries(SAVES.flatMap((save) => Object.entries(TYPES).map(([name, text]) => [`${save}/${name}.qml`, text]))),
  "main.js": [
    `import { defineType, mount } from ${imported("object.ts")};`,
    `import { reload } from ${imported("reload.js")};`,
    `import { ParticleSystem3D } from ${imported("QtQuick3D/Particles3D/index.js")};`,
    ...SAVES.flatMap((save) => Object.keys(TYPES).map((name) => `import ${save}${name} from "./${save}/${name}.qml";`)),
    `const saves = { ${SAVES.map((save) => `${save}: { ${Object.keys(TYPES).map((name) => `${name}: ${save}${name}`).join(", ")} }`).join(", ")} };`,
    "const opened = (Component, options) => {",
    '  const host = document.body.appendChild(document.createElement("div"));',
    "  return mount(Component, host, {}, options);",
    "};",
    "window.saved = (name) => {",
    "  const handle = opened(saves.first[name], { reloadable: true });",
    "  return { get root() { return handle.object; }, again: () => reload(handle, saves.next[name]) };",
    "};",
    "// A type of the system's runs its setup after the system's own: the time",
    "// it finds there is the one during setup.",
    "window.atSetup = () => {",
    "  let seen = [];",
    '  const Timed = defineType("Timed", ParticleSystem3D, { properties: { stock: null }, setup: (self) => void seen.push(self.$time()) });',
    "  const component = () => (props) => Timed({ ...props, running: false, time: 5, stock: [] });",
    "  opened(component(), { reloadable: false });",
    "  const plain = seen;",
    "  seen = [];",
    "  const handle = opened(component(), { reloadable: true });",
    "  reload(handle, component());",
    "  return { plain, reloadable: seen };",
    "};",
    "",
  ].join("\n"),
};

test.describe("a reload and the names the runtime's types keep", () => {
  test.describe.configure({ mode: "default" });
  let place;
  let server;

  test.beforeAll(shared("build the page and serve it", async () => {
    place = realpathSync(mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-reload-names-")));
    const app = join(place, "app");
    for (const [name, text] of Object.entries(FILES)) {
      const file = join(app, name);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
    await part("build the page", () =>
      build({
        configFile: false,
        root: app,
        base: "./",
        logLevel: "error",
        plugins: [qml({ qmlc, root: app })],
        build: { outDir: join(place, "out"), target: "esnext", chunkSizeWarningLimit: 4000 },
      }),
    );
    server = await part("serve it", () => serve(join(place, "out")));
  }));

  test.afterAll(shared("stop serving it and remove the page", async () => {
    await part("stop serving it", () => server?.stop());
    if (place) rmSync(place, { recursive: true, force: true });
  }));

  test.beforeEach(async ({ page }) => {
    await page.goto(`${server.origin}/`);
    await page.waitForFunction(() => typeof window.saved === "function");
  });

  // Assigns the list, reloads the same file and reads what the new object has.
  const reloaded = (page, name) =>
    page.evaluate(async (name) => {
      // A particle system takes the time it was declared with once the turn
      // it was made in is over.
      const turn = () => new Promise((done) => setTimeout(done, 0));
      const held = ({ subject, inner, series }) => {
        const under = subject.$declared;
        if (inner) return { length: under?.length, own: under?.[0] === inner };
        if (series) return { length: under?.length, own: under?.[0] === series };
        return { time: under, at: subject.$time() };
      };
      const app = window.saved(name);
      await turn();
      const before = held(app.root);
      const was = app.root.subject;
      was.stock = ["mine"];
      let error = null;
      try {
        app.again();
      } catch (thrown) {
        error = String(thrown?.message ?? thrown);
      }
      await turn();
      return { error, before, after: held(app.root), stock: app.root.subject.stock, anew: app.root.subject !== was };
    }, name);

  for (const { name, what, holds } of [
    { name: "Controllers", what: "a Controller", holds: { length: 1, own: true } },
    { name: "Graph", what: "a 3D graph", holds: { length: 1, own: true } },
    { name: "System", what: "a particle system", holds: { time: 5, at: 0 } },
  ]) {
    test(`${what} with an assigned list is reloaded and holds what is its own`, async ({ page }) => {
      const got = await reloaded(page, name);
      expect.soft(got.error, "the reload threw").toBeNull();
      expect.soft(got.anew, "the new file's object").toBe(true);
      expect.soft(got.stock, "what was assigned").toEqual(["mine"]);
      expect.soft(got.before, "its own, before").toEqual(holds);
      expect.soft(got.after, "its own, after").toEqual(holds);
    });
  }

  test("a particle system's time during setup is nought, reloadable or not", async ({ page }) => {
    const got = await page.evaluate(() => window.atSetup());
    expect.soft(got.plain, "a plain mount").toEqual([0]);
    expect.soft(got.reloadable, "mounted to be reloaded, and reloaded").toEqual([0, 0]);
  });
});
