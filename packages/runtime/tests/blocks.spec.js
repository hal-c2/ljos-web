// Ljos.Blocks on the web: ljos-ui's features/blocks/slots.feature and
// shell-loader.feature (at 0cd3287c), scenario for scenario, in their words.
// Where the web cannot do what the native step does, the scenario says what
// it does in its place.
import { expect, open, test } from "./open.js";

// `a/b`: the item named `b` somewhere inside the item named `a`, from the
// scene's root; null when there is none.
async function named(page, path) {
  return page.evaluate((path) => window.named(path) !== null, path);
}

async function read(page, path, property) {
  return page.evaluate(
    ([path, property]) => {
      let value = window.named(path);
      for (const step of property.split(".")) value = value?.[step];
      return value;
    },
    [path, property],
  );
}

async function opened(page, scene) {
  await open(page, scene);
  await page.evaluate(() => {
    const kids = (object) => [...(object.children ?? []), ...(object.item?.$node && !object.children?.includes(object.item) ? [object.item] : [])];
    const search = (from, name) => {
      const queue = [...kids(from)];
      while (queue.length) {
        const at = queue.shift();
        if (at.objectName === name) return at;
        queue.push(...kids(at));
      }
      return null;
    };
    window.named = (path) => {
      let at = window.scene;
      for (const name of path.split("/")) {
        if (name === "root" && at === window.scene) continue;
        at = search(at, name);
        if (!at) return null;
      }
      return at;
    };
  });
}

test.describe("A Slot shows what the application contributes to it", () => {
  test.describe("Contributions show in order", () => {
    test("Appended contributions follow their order, then the order they were made", async ({ page }) => {
      await opened(page, "slotsorder");
      expect(await read(page, "a", "x")).toBe(0);
      expect(await read(page, "b", "x")).toBe(10);
      expect(await read(page, "c", "x")).toBe(20);
      expect(await read(page, "slot", "count")).toBe(3);
    });

    test("The Slot's own delegate stays with appended contributions", async ({ page }) => {
      await opened(page, "slotsown");
      expect(await read(page, "own", "x")).toBe(0);
      expect(await read(page, "added", "x")).toBe(10);
    });

    test("Prepended contributions come before the Slot's own delegate, in their order", async ({ page }) => {
      await opened(page, "slotsprepend");
      expect(await read(page, "first", "x")).toBe(0);
      expect(await read(page, "second", "x")).toBe(10);
      expect(await read(page, "own", "x")).toBe(20);
      expect(await read(page, "added", "x")).toBe(30);
    });

    test("A replacing contribution takes the place of the delegate and of those before it", async ({ page }) => {
      await opened(page, "slotsreplace");
      expect(await named(page, "own")).toBe(false);
      expect(await named(page, "early")).toBe(false);
      expect(await read(page, "instead", "x")).toBe(0);
      expect(await read(page, "late", "x")).toBe(10);
    });
  });

  test.describe("With nothing contributed the Slot shows its own delegate", () => {
    test("A Slot nobody contributes to shows its delegate", async ({ page }) => {
      await opened(page, "slotsempty");
      expect(await read(page, "placeholder", "text")).toBe("Nothing here");
      expect(await named(page, "other")).toBe(false);
      expect(await read(page, "slot", "count")).toBe(1);
    });

    test("A Slot with no delegate and no contribution shows nothing", async ({ page }) => {
      // The scenes' `test` fails on any warning: "the log has no warnings".
      await opened(page, "slotsnone");
      expect(await read(page, "slot", "count")).toBe(0);
    });
  });

  test.describe("Contributions come and go while the application runs", () => {
    const plug = (page, on) =>
      page.evaluate(async (on) => {
        window.named("root").plugin = on;
        window.flush();
        // The Loader imports the plugin's module, which comes later.
        await new Promise((resolve) => setTimeout(resolve, 50));
        window.flush();
      }, on);

    test("A contribution made later shows", async ({ page }) => {
      await opened(page, "slotsplugin");
      await plug(page, true);
      await expect.poll(() => named(page, "plugged")).toBe(true);
      expect(await named(page, "own")).toBe(false);
    });

    test("A contribution destroyed goes, and the Slot's delegate comes back", async ({ page }) => {
      await opened(page, "slotsplugin");
      await plug(page, true);
      await expect.poll(() => named(page, "plugged")).toBe(true);
      await plug(page, false);
      expect(await named(page, "plugged")).toBe(false);
      expect(await named(page, "own")).toBe(true);
      expect(await read(page, "slot", "count")).toBe(1);
    });

    test.describe(() => {
      // The contribution's fault is warned of, and the page has none.
      test.use({ told: [/broken plugin/] });

      // A handler of it that throws is the web's "a native handler panics".
      test("A contribution whose plugin fails goes with it", async ({ page }) => {
        const thrown = [];
        page.on("pageerror", (error) => thrown.push(error.message));
        await opened(page, "slotsplugin");
        await plug(page, true);
        await expect.poll(() => named(page, "plugged")).toBe(true);
        await page.evaluate(() => {
          window.named("plugged").poke();
          window.flush();
        });
        await expect.poll(() => named(page, "plugged")).toBe(false);
        expect(await named(page, "own")).toBe(true);
        expect(thrown).toEqual([]);
      });
    });
  });

  test.describe("A contribution that does not work takes nothing with it", () => {
    test.use({ told: [/^Contribution: /] });

    // Thrown by a binding as the delegate is made, which natively is a plugin's panic.
    test("A contribution whose binding throws as it is made goes, and the page runs", async ({ page }) => {
      const thrown = [];
      page.on("pageerror", (error) => thrown.push(error.message));
      await opened(page, "slotsbad");
      await expect.poll(() => named(page, "made-badly")).toBe(false);
      expect(await named(page, "good")).toBe(true);
      expect(await named(page, "later")).toBe(true);
      expect(await read(page, "slot", "count")).toBe(2);
      expect(thrown).toEqual([]);
    });

    test("A contribution whose binding throws later goes, and the page runs", async ({ page }) => {
      const thrown = [];
      page.on("pageerror", (error) => thrown.push(error.message));
      await opened(page, "slotsbad");
      await expect.poll(() => named(page, "made-badly")).toBe(false);
      await page.evaluate(() => {
        window.named("root").broken = true;
        window.flush();
      });
      await expect.poll(() => named(page, "later")).toBe(false);
      expect(await named(page, "good")).toBe(true);
      expect(await read(page, "slot", "count")).toBe(1);
      expect(thrown).toEqual([]);
    });

    // Not a binding, which its object's boundary takes: the delegate itself,
    // as a plugin's component that throws before it has an object.
    test("A contribution whose delegate itself throws goes, and the page runs", async ({ page }) => {
      const thrown = [];
      page.on("pageerror", (error) => thrown.push(error.message));
      await opened(page, "slotsbad");
      await expect.poll(() => named(page, "made-badly")).toBe(false);
      await page.evaluate(() => {
        const contribution = window.named("root").spare;
        contribution.delegate = () => {
          throw new Error("delegate threw");
        };
        contribution.slot = "tools";
        window.flush();
      });
      await expect.poll(() => page.evaluate(() => window.named("root").spare.$out[0]())).toBe(true);
      expect(await named(page, "good")).toBe(true);
      expect(await read(page, "slot", "count")).toBe(2);
      expect(thrown).toEqual([]);
    });
  });

  test.describe("Every Slot of a name shows its contributions", () => {
    test("Two Slots of one name both show a contribution", async ({ page }) => {
      await opened(page, "slotstwo");
      expect(await read(page, "left", "children.0.text")).toBe("12:00");
      expect(await read(page, "right", "children.0.text")).toBe("12:00");
    });

    test("A contribution that names another slot moves there", async ({ page }) => {
      await opened(page, "slotsmoving");
      await page.evaluate(() => {
        window.objects.moving.slot = "right";
        window.flush();
      });
      expect(await read(page, "right", "children.0.objectName")).toBe("thing");
      expect(await read(page, "right-slot", "count")).toBe(1);
      expect(await read(page, "left-slot", "count")).toBe(0);
    });
  });

  test.describe("A block's slot is a list of contributions it hands to a Slot", () => {
    test("Contributions given to a block's slot show in its Slot", async ({ page }) => {
      await opened(page, "slotsblock");
      expect(await read(page, "bar/open", "x")).toBe(0);
      expect(await read(page, "bar/save", "x")).toBe(10);
    });
  });
});

// The files a test serves as the user's: not part of the build, so the page
// fetches and compiles them (`ljos-web/compiler`). `files` maps a path under
// `/user/` to its text; a later call serves what it says from then on.
async function serve(page, files) {
  const served = (page.$served ??= {});
  Object.assign(served, files);
  if (page.$routed) return;
  page.$routed = true;
  await page.route("**/user/*.qml", (route) => {
    const name = new URL(route.request().url()).pathname.replace(/^.*\/user\//, "");
    const text = served[name];
    return text === undefined ? route.fulfill({ status: 404, body: "" }) : route.fulfill({ body: text, contentType: "text/plain" });
  });
}

// Until the loader has done what it was asked: its source fetched and
// compiled, or the fallback shown.
const settled = (page) => page.waitForFunction(() => window.named("loader")?.status > 0);

test.describe("A ShellLoader shows a user's shell, or the application's own when the user's does not work", () => {
  test.describe("A shell that works is shown", () => {
    test("The user's shell is shown", async ({ page }) => {
      await opened(page, "shellsshown");
      expect(await named(page, "loader/user-shell")).toBe(true);
      expect(await named(page, "default-shell")).toBe(false);
      expect(await read(page, "loader", "error")).toBe("");
      expect(await read(page, "loader", "status")).toBe(1);
      expect(await read(page, "loader", "width")).toBe(50);
    });

    test("A user's shell that is not part of the build is compiled in the page and shown", async ({ page }) => {
      await serve(page, { "Shell.qml": 'import QtQuick\nRectangle { objectName: "user-shell"; width: 50; height: 20 }\n' });
      await opened(page, "shellsfetched");
      await settled(page);
      expect(await named(page, "loader/user-shell")).toBe(true);
      expect(await named(page, "default-shell")).toBe(false);
      expect(await read(page, "loader", "error")).toBe("");
      expect(await read(page, "loader", "status")).toBe(1);
      expect(await read(page, "loader", "width")).toBe(50);
    });
  });

  test.describe("A shell that does not work gives way to the fallback", () => {
    // What gave way is warned of, as natively: the scenes' `test` is told so.
    test.use({ told: [/^ShellLoader: /] });

    test("A shell that does not compile falls back and says where the mistake is", async ({ page }) => {
      const warnings = [];
      page.on("console", (message) => message.type() === "warning" && warnings.push(message.text()));
      await serve(page, { "Shell.qml": "import QtQuick\nRectangle {\n  NoSuchThing { }\n}\n" });
      await opened(page, "shellsfetched");
      await settled(page);
      expect(await named(page, "loader/default-shell")).toBe(true);
      expect(await read(page, "loader", "error")).toMatch(/Shell\.qml:3:\d+: .*NoSuchThing/);
      expect(await read(page, "loader", "status")).toBe(2);
      expect(warnings.some((warning) => /Shell\.qml:3/.test(warning))).toBe(true);
    });

    // DECISION: where a shell threw is the line of the object whose handler
    // threw (2), not of the `throw` (4): compiled QML has no map back to its
    // lines, and the compiler places objects, not statements.
    test("A shell that throws while it is made falls back and says where it threw", async ({ page }) => {
      await serve(page, {
        "Shell.qml": 'import QtQuick\nRectangle {\n  objectName: "user-shell"\n  Component.onCompleted: { throw new Error("no shell today") }\n}\n',
      });
      await opened(page, "shellsfetched");
      await settled(page);
      expect(await named(page, "loader/default-shell")).toBe(true);
      expect(await named(page, "user-shell")).toBe(false);
      expect(await read(page, "loader", "error")).toMatch(/Shell\.qml:2: .*no shell today/);
    });

    // A handler of it that throws is the web's "a native handler panics".
    test("A shell that fails after it was made falls back", async ({ page }) => {
      const thrown = [];
      page.on("pageerror", (error) => thrown.push(error.message));
      await serve(page, {
        "Shell.qml":
          'import QtQuick\nRectangle { objectName: "user-shell"; Item { objectName: "part"; signal poke(); onPoke: { throw new Error("shell broke") } } }\n',
      });
      await opened(page, "shellsfetched");
      await settled(page);
      expect(await named(page, "loader/user-shell")).toBe(true);
      await page.evaluate(() => {
        window.named("part").poke();
        window.flush();
      });
      await expect.poll(() => named(page, "loader/default-shell")).toBe(true);
      expect(await named(page, "user-shell")).toBe(false);
      expect(await read(page, "loader", "status")).toBe(2);
      expect(thrown).toEqual([]);
    });

    // A binding, which unlike a handler is left in the middle of being
    // evaluated when the shell gives way.
    test("A shell whose binding throws while it is made falls back", async ({ page }) => {
      const thrown = [];
      page.on("pageerror", (error) => thrown.push(error.message));
      await serve(page, {
        "Shell.qml": 'import QtQuick\nRectangle {\n  objectName: "user-shell"\n  width: { throw new Error("no width today") }\n}\n',
      });
      await opened(page, "shellsfetched");
      await settled(page);
      expect(await named(page, "loader/default-shell")).toBe(true);
      expect(await named(page, "user-shell")).toBe(false);
      expect(await read(page, "loader", "status")).toBe(2);
      expect(await read(page, "loader", "error")).toMatch(/Shell\.qml:2: .*no width today/);
      expect(thrown).toEqual([]);
    });

    test("A shell whose binding throws later falls back, and the page runs", async ({ page }) => {
      const thrown = [];
      page.on("pageerror", (error) => thrown.push(error.message));
      await serve(page, {
        "Shell.qml":
          'import QtQuick\nRectangle {\n  objectName: "user-shell"\n  property bool broken: false\n  width: { if (broken) throw new Error("broke later"); return 10 }\n}\n',
      });
      await opened(page, "shellsfetched");
      await settled(page);
      expect(await named(page, "loader/user-shell")).toBe(true);
      await page.evaluate(() => {
        window.named("user-shell").broken = true;
        window.flush();
      });
      await expect.poll(() => named(page, "loader/default-shell")).toBe(true);
      expect(await named(page, "user-shell")).toBe(false);
      expect(await read(page, "loader", "status")).toBe(2);
      expect(await read(page, "loader", "error")).toMatch(/broke later/);
      expect(await page.evaluate(() => window.named("loader").$node.children.length)).toBe(1);
      expect(thrown).toEqual([]);
    });

    test("A fallback that fails too leaves nothing shown and says both", async ({ page }) => {
      await serve(page, {
        "Shell.qml": "import QtQuick\nRectangle { NoSuchThing { } }\n",
        "Default.qml": "import QtQuick\nRectangle { AlsoMissing { } }\n",
      });
      await opened(page, "shellsboth");
      await settled(page);
      expect(await read(page, "loader", "error")).toMatch(/Shell\.qml:2.*NoSuchThing[^]*Default\.qml:2.*AlsoMissing/);
      expect(await read(page, "loader", "status")).toBe(3);
      expect(await read(page, "loader", "item")).toBe(null);
    });

    test("A source whose module does not load falls back and says why", async ({ page }) => {
      const thrown = [];
      page.on("pageerror", (error) => thrown.push(error.message));
      await opened(page, "shellsshown");
      await page.evaluate(() => {
        window.named("loader").source = () => Promise.reject(new Error("module failed"));
        window.flush();
      });
      await expect.poll(() => named(page, "loader/default-shell")).toBe(true);
      expect(await read(page, "loader", "error")).toMatch(/module failed/);
      expect(await read(page, "loader", "status")).toBe(2);
      expect(thrown).toEqual([]);
    });

    test("A module that gives no component falls back and says so", async ({ page }) => {
      await opened(page, "shellsshown");
      await page.evaluate(() => {
        window.named("loader").source = () => Promise.resolve({});
        window.flush();
      });
      await expect.poll(() => named(page, "loader/default-shell")).toBe(true);
      expect(await read(page, "loader", "error")).toMatch(/no component/);
    });

    test("A fallback whose module does not load leaves nothing shown and says why", async ({ page }) => {
      await opened(page, "shellsshown");
      await page.evaluate(() => {
        const loader = window.named("loader");
        loader.fallback = () => Promise.reject(new Error("fallback failed"));
        window.flush();
      });
      await page.waitForFunction(() => window.named("loader")?.item !== null);
      await page.evaluate(() => {
        window.named("loader").source = () => Promise.reject(new Error("module failed"));
        window.flush();
      });
      await expect.poll(() => read(page, "loader", "status")).toBe(3);
      expect(await read(page, "loader", "error")).toMatch(/module failed[^]*fallback failed/);
    });

    test.describe(() => {
      test.use({ told: [[/^ShellLoader: /, /Failed to load resource/, /net::ERR_FAILED/], { option: true }] });

      test("A shell whose compiler does not load falls back and says why", async ({ page }) => {
        const thrown = [];
        page.on("pageerror", (error) => thrown.push(error.message));
        await serve(page, { "Shell.qml": "import QtQuick\nRectangle { }\n" });
        await page.route(/compiler\/index\.js/, (route) => route.abort());
        await opened(page, "shellsshown");
        await page.evaluate(() => {
          window.named("loader").source = "user/Shell.qml";
          window.flush();
        });
        await expect.poll(() => read(page, "loader", "error")).toMatch(/^Shell\.qml: cannot compile/);
        await expect.poll(() => named(page, "loader/default-shell")).toBe(true);
        expect(await read(page, "loader", "status")).toBe(2);
        expect(thrown).toEqual([]);
      });
    });

    test("A new source is tried and clears the error when it works", async ({ page }) => {
      await serve(page, {
        "Shell.qml": "import QtQuick\nRectangle { NoSuchThing { } }\n",
        "Other.qml": 'import QtQuick\nRectangle { objectName: "other-shell" }\n',
      });
      await opened(page, "shellsfetched");
      await settled(page);
      await page.evaluate(() => {
        window.named("loader").source = "user/Other.qml";
        window.flush();
      });
      await expect.poll(() => named(page, "loader/other-shell")).toBe(true);
      expect(await named(page, "default-shell")).toBe(false);
      expect(await read(page, "loader", "error")).toBe("");
      expect(await read(page, "loader", "status")).toBe(1);
    });
  });

  // The web's "a reload happens": `reload()` fetches and compiles the
  // source again (A13), and answers the reload's error, or "".
  test.describe("Editing the shell while the application runs", () => {
    test.use({ told: [/^ShellLoader: /] });
    const reload = (page) => page.evaluate(() => window.named("loader").reload());

    // A reload that overtakes the first load takes on what that load would have
    // finished: no one else is left to show the fallback.
    for (const [what, source] of [
      ["cannot be had", "() => Promise.reject(new Error('gone'))"],
      ["cannot be made", "() => Promise.resolve({ default: () => { throw new Error('broken'); } })"],
    ]) {
      test(`A reload before the first load is done shows the fallback when the source ${what}`, async ({ page }) => {
        await opened(page, "shellsfetched");
        await settled(page);
        const said = await page.evaluate(async (source) => {
          const loader = window.named("loader");
          loader.source = eval(source);
          window.flush();
          await loader.reload();
          window.flush();
          return loader.status;
        }, source);
        const FALLBACK = 2;
        expect(said).toBe(FALLBACK);
        expect(await named(page, "default-shell")).toBe(true);
        expect(await read(page, "loader", "error")).not.toBe("");
      });
    }

    test("Mending the shell's file replaces the fallback", async ({ page }) => {
      await serve(page, { "Shell.qml": "import QtQuick\nRectangle { NoSuchThing { } }\n" });
      await opened(page, "shellsfetched");
      await settled(page);
      await serve(page, { "Shell.qml": 'import QtQuick\nRectangle { objectName: "user-shell" }\n' });
      expect(await reload(page)).toBe("");
      expect(await named(page, "loader/user-shell")).toBe(true);
      expect(await named(page, "default-shell")).toBe(false);
      expect(await read(page, "loader", "error")).toBe("");
    });

    // The reload that made it is no longer wanted when it comes to take the
    // old one's place: what it made goes, and is not left in the loader.
    test("A shell a later reload overtook is ended", async ({ page }) => {
      const ended = [];
      page.on("console", (message) => message.text() === "ended" && ended.push(message.text()));
      await opened(page, "shellsended");
      await settled(page);
      // A source that asks for a reload as it is made: between what the first
      // reload made and its putting it in place.
      const said = await page.evaluate(async () => {
        const loader = window.named("loader");
        const source = loader.source;
        const Shell = source.$component ? source : (await source()).default;
        let armed = false;
        let inner;
        loader.source = () =>
          Promise.resolve({
            default: (data) => {
              if (armed && !inner) inner = loader.reload();
              return Shell(data);
            },
          });
        window.flush();
        await new Promise((done) => setTimeout(done, 50));
        armed = true;
        const outer = await loader.reload();
        return [outer, await inner];
      });
      expect(said).toEqual(["", ""]);
      // The first shell, the one the second reload replaced, the one overtaken.
      await expect.poll(() => ended.length).toBe(3);
      expect(await page.evaluate(() => window.named("loader").$node.children.length)).toBe(1);
      expect(await page.evaluate(() => window.named("loader").children.length)).toBe(1);
      expect(await read(page, "loader", "status")).toBe(1);
    });

    // As in reload.spec.js's reloadbadcarry, which is a root's and not a loader's.
    test("A shell whose state cannot be carried is ended, and the old one stays", async ({ page }) => {
      const thrown = [];
      page.on("pageerror", (error) => thrown.push(error.message));
      const ended = [];
      page.on("console", (message) => message.text() === "ended" && ended.push(message.text()));
      await opened(page, "shellsended");
      await settled(page);
      const said = await page.evaluate(async () => {
        const loader = window.named("loader");
        const old = loader.item;
        const source = loader.source;
        const Shell = source.$component ? source : (await source()).default;
        loader.source = () =>
          Promise.resolve({
            default: (data) => {
              const object = Shell(data);
              // Only once it is made: the carrying is what is to fail.
              let armed = false;
              queueMicrotask(() => (armed = true));
              const born = object.$born;
              Object.defineProperty(object, "$born", {
                configurable: true,
                get() {
                  if (armed) throw new Error("carried badly");
                  return born;
                },
              });
              return object;
            },
          });
        window.flush();
        await new Promise((done) => setTimeout(done, 50));
        const kept = loader.item;
        const message = await loader.reload();
        return { message, same: loader.item === kept, old: old !== kept };
      });
      expect(said.message).toMatch(/carried badly/);
      expect(said.same).toBe(true);
      await expect.poll(() => ended.length).toBeGreaterThan(0);
      expect(await page.evaluate(() => window.named("loader").$node.children.length)).toBe(1);
      expect(await page.evaluate(() => window.named("loader").children.length)).toBe(1);
      expect(await read(page, "loader", "status")).toBe(1);
      expect(thrown).toEqual([]);
    });

    test("A shell that an edit breaks stays as it was, and the reload says why", async ({ page }) => {
      await serve(page, { "Shell.qml": 'import QtQuick\nRectangle { objectName: "user-shell" }\n' });
      await opened(page, "shellsfetched");
      await settled(page);
      await serve(page, { "Shell.qml": 'import QtQuick\nRectangle { objectName: "user-shell"; NoSuchThing { } }\n' });
      expect(await reload(page)).toMatch(/^Shell\.qml:2:/);
      expect(await named(page, "loader/user-shell")).toBe(true);
      expect(await named(page, "default-shell")).toBe(false);
      expect(await read(page, "loader", "error")).toBe("");
    });

    // Blocks are the site's: the shell only places them, so another shell
    // shows the same blocks with what they hold, and the shell's own items
    // keep what they were given where the new shell has them (A13).
    test("A reloaded shell keeps the blocks' state and its own items'", async ({ page }) => {
      await serve(page, {
        "Shell.qml": 'import QtQuick\nimport Ljos.Blocks\nColumn {\n  Text { id: note; objectName: "note"; text: "first" }\n  Slot { name: "main" }\n}\n',
      });
      await opened(page, "shellsblocks");
      await settled(page);
      await page.evaluate(() => {
        window.objects.counter.add();
        window.objects.counter.add();
        window.named("note").text = "typed";
        window.flush();
      });
      expect(await read(page, "counter-view", "shown")).toBe(2);
      await serve(page, {
        "Shell.qml": 'import QtQuick\nimport Ljos.Blocks\nColumn {\n  Slot { name: "main" }\n  Text { id: note; objectName: "note"; text: "first" }\n}\n',
      });
      expect(await reload(page)).toBe("");
      expect(await read(page, "counter-view", "shown")).toBe(2);
      expect(await read(page, "counter-view", "y")).toBe(0);
      expect(await read(page, "note", "text")).toBe("typed");
      expect(await read(page, "note", "y")).toBe(10);
    });
  });
});
