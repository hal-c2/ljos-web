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
