// ljos.dev's code examples, held to how they read: each is a card
// that names its file or language and copies its code, the code is set
// large enough to read on lines far enough apart, every line of it can
// be reached inside its card on a phone without the page scrolling
// sideways, and every colour the highlighting gives reads on the
// ground it is drawn on, in both schemes (features/code-card.feature).
import { expect, test } from "@playwright/test";

// A page of plain blocks (a shell line, what a command prints) and a
// live one, a page of long live examples, one whose example draws a
// sliver, and the landing's one plain block.
const ROUTES = [
  "/start/first-app/",
  "/quality/motion/",
  "/data/repeater-and-delegates/",
  "/",
];
const VIEWS = [
  ["phone", { width: 390, height: 844 }],
  ["desktop", { width: 1440, height: 900 }],
];
const SCHEMES = ["light", "dark"];
// The site may stand at a base (/ljos-web/ on the project-path build), so
// each route is opened under it, as base.spec.js does.
const base = process.env.LJOS_SITE_BASE ?? "/";

async function opened(browser, viewport, colorScheme, route) {
  const context = await browser.newContext({
    viewport,
    colorScheme,
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  await page.goto(base + route.replace(/^\//, ""));
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  return { context, page };
}

// Every code card the page shows, as the page lays it out: its own
// box, the code in it (the rich, monospaced Text the build highlighted,
// or the editor that took its place), and what each says it is.
const cards = (page) =>
  page.evaluate(() => {
    const shown = (node) => {
      const box = node.getBoundingClientRect();
      return (
        box.width > 0 &&
        box.height > 0 &&
        getComputedStyle(node).visibility !== "hidden"
      );
    };
    return [
      ...document.querySelectorAll('#app [role="group"][aria-label^="Code"]'),
    ]
      .filter(shown)
      .map((card) => {
        const box = card.getBoundingClientRect();
        const code = [...card.querySelectorAll(".qq-rich")].filter(
          (node) =>
            shown(node) &&
            getComputedStyle(node).fontFamily.startsWith("ui-monospace"),
        );
        const words = [...card.querySelectorAll(".qq-text")].filter(
          (node) => shown(node) && node.textContent.trim() !== "",
        );
        return {
          name: card.getAttribute("aria-label"),
          left: box.left,
          right: box.right,
          radius:
            parseFloat(getComputedStyle(card).borderTopLeftRadius) ||
            Math.max(
              0,
              ...[...card.children].map(
                (child) =>
                  parseFloat(getComputedStyle(child).borderTopLeftRadius) || 0,
              ),
            ),
          copies: [...card.querySelectorAll('[role="button"], button')].filter(
            (node) =>
              shown(node) &&
              /^Copy\b/.test(
                node.getAttribute("aria-label") ?? node.textContent.trim(),
              ),
          ).length,
          code: code.map((node) => {
            const style = getComputedStyle(node);
            return {
              size: parseFloat(style.fontSize),
              line: parseFloat(style.lineHeight),
              text: node.textContent.slice(0, 40),
            };
          }),
          // The smallest words the card says anything in.
          smallest: Math.min(
            ...words.map((node) => parseFloat(getComputedStyle(node).fontSize)),
          ),
        };
      });
  });

for (const route of ROUTES) {
  for (const [view, viewport] of VIEWS) {
    test(`${route}'s code examples are cards that say what they hold and copy it, on a ${view}`, async ({
      browser,
    }) => {
      const { context, page } = await opened(browser, viewport, "light", route);
      try {
        const found = await cards(page);
        expect(found.length, "a card for each code example").toBeGreaterThan(0);
        for (const card of found) {
          expect(card.name, "named by its file or language").toMatch(
            /^Code: \S/,
          );
          expect(card.copies, `${card.name}: one Copy`).toBe(1);
          expect(
            card.radius,
            `${card.name}: rounded as the site's cards are`,
          ).toBeGreaterThanOrEqual(6);
          expect(
            card.smallest,
            `${card.name}: nothing in it under 13 px`,
          ).toBeGreaterThanOrEqual(13);
          expect(card.code.length, `${card.name}: its code`).toBeGreaterThan(0);
          for (const code of card.code) {
            expect(
              code.size,
              `${card.name} "${code.text}": 14 px or more`,
            ).toBeGreaterThanOrEqual(14);
            expect(
              code.line / code.size,
              `${card.name} "${code.text}": lines 1.6 apart`,
            ).toBeGreaterThanOrEqual(1.55);
          }
        }
      } finally {
        await context.close();
      }
    });
  }
  test(`${route} on a phone never scrolls sideways, and every line of its code can be reached in its card`, async ({
    browser,
  }) => {
    const { context, page } = await opened(
      browser,
      { width: 390, height: 844 },
      "light",
      route,
    );
    try {
      const said = await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        const out = [];
        // The page, and the app's scrollers that move it up and down.
        if (document.documentElement.scrollWidth > width + 1)
          out.push(
            `the document is ${document.documentElement.scrollWidth} wide`,
          );
        for (const node of document.querySelectorAll("#app qq-flick")) {
          const style = getComputedStyle(node);
          if (
            node.clientHeight > 600 &&
            style.overflowY !== "hidden" &&
            node.scrollWidth > node.clientWidth + 1 &&
            style.overflowX !== "hidden"
          )
            out.push(
              `the page's scroller is ${node.scrollWidth} wide in ${node.clientWidth}`,
            );
        }
        // Code wider than its box is reached by scrolling inside the
        // card; code cut off by a box that does not scroll is lost.
        // Every block of code, card or not: the monospaced rich Text the
        // build highlighted, or the editor that took its place.
        const blocks = [
          ...document.querySelectorAll("#app .qq-rich, #app .cm-content"),
        ].filter(
          (node) =>
            node.classList.contains("cm-content") ||
            getComputedStyle(node).fontFamily.startsWith("ui-monospace"),
        );
        if (blocks.length === 0) out.push("no code on the page");
        for (const code of blocks) {
          const box = code.getBoundingClientRect();
          if (box.width === 0 || getComputedStyle(code).visibility === "hidden")
            continue;
          const wide = Math.max(box.width, code.scrollWidth);
          for (
            let up = code.parentElement;
            up && up.id !== "app";
            up = up.parentElement
          ) {
            const style = getComputedStyle(up);
            if (style.overflowX === "visible") continue;
            const edge = up.getBoundingClientRect();
            if (box.left + wide <= edge.right + 1) continue;
            if (style.overflowX === "auto" || style.overflowX === "scroll")
              break;
            out.push(
              `"${code.textContent.slice(0, 30)}" is cut at ${Math.round(edge.right)} (it is ${Math.round(wide)} wide)`,
            );
            break;
          }
          if (box.left < -1 || Math.min(box.right, width) > width + 1)
            out.push(
              `"${code.textContent.slice(0, 30)}" stands past the page's edge`,
            );
        }
        for (const card of document.querySelectorAll(
          '#app [role="group"][aria-label^="Code"]',
        )) {
          const box = card.getBoundingClientRect();
          if (box.width > 0 && (box.left < -1 || box.right > width + 1))
            out.push(
              `${card.getAttribute("aria-label")} stands past the page's edge`,
            );
        }
        return out;
      });
      expect(said).toEqual([]);
    } finally {
      await context.close();
    }
  });
  for (const colorScheme of ["light", "dark"]) {
    test(`${route}'s highlighted code reads at 4.5:1 on its own ground in ${colorScheme}`, async ({
      browser,
    }) => {
      const { context, page } = await opened(
        browser,
        { width: 1440, height: 900 },
        colorScheme,
        route,
      );
      try {
        const short = await page.evaluate(() => {
          const rgb = (colour) => {
            const [r, g, b, a = 1] = colour.match(/[\d.]+/g).map(Number);
            return { r, g, b, a };
          };
          const luminance = ({ r, g, b }) =>
            [r, g, b]
              .map((c) => c / 255)
              .map((c) =>
                c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
              )
              .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
          const ratio = (a, b) => {
            const [high, low] = [luminance(a), luminance(b)].sort(
              (x, y) => y - x,
            );
            return (high + 0.05) / (low + 0.05);
          };
          // The ground a word is drawn on: the first box under it that paints.
          const ground = (node) => {
            for (let up = node; up; up = up.parentElement) {
              const colour = rgb(getComputedStyle(up).backgroundColor);
              if (colour.a >= 0.99) return colour;
            }
            return { r: 255, g: 255, b: 255, a: 1 };
          };
          const out = [];
          const blocks = [...document.querySelectorAll("#app .qq-rich")].filter(
            (node) =>
              getComputedStyle(node).fontFamily.startsWith("ui-monospace"),
          );
          if (blocks.length === 0) out.push("no code on the page");
          for (const code of blocks) {
            if (code.getBoundingClientRect().width === 0) continue;
            const under = ground(code);
            const seen = new Set();
            for (const word of [
              code,
              ...code.querySelectorAll("[class*=tok-]"),
            ]) {
              const tag =
                [...word.classList].find((name) => name.startsWith("tok-")) ??
                "text";
              if (seen.has(tag)) continue;
              seen.add(tag);
              const shade = ratio(rgb(getComputedStyle(word).color), under);
              if (shade < 4.5)
                out.push(
                  `${tag} "${word.textContent.slice(0, 20)}" at ${shade.toFixed(2)}:1`,
                );
            }
          }
          return out;
        });
        expect(short).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
}

// Copy puts the code as written on the clipboard, and says it did.
test("a code example's Copy copies its code, and says so", async ({
  browser,
}) => {
  const { context, page } = await opened(
    browser,
    { width: 1440, height: 900 },
    "light",
    "/start/first-app/",
  );
  try {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const card = page
      .getByRole("group", { name: /^Code: / })
      .filter({ hasNot: page.getByRole("textbox") })
      .first();
    const copy = card.getByRole("button", { name: /^Copy\b/ });
    await copy.click();
    await expect(card.getByText("Copied")).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.trim().length).toBeGreaterThan(0);
    // The card shows every space as one that stays (a no-break space,
    // as rich text keeps no run of plain ones); what is copied has
    // plain spaces, as written, and is every line the card shows.
    const shown = (await card.locator(".qq-rich").first().innerText())
      .replace(/\u00a0/g, " ")
      .replace(/\n+$/, "");
    expect(copied).toBe(shown);
  } finally {
    await context.close();
  }
});

// Into a card's code as a reader goes, and on once the editor is there:
// CodeMirror comes on the first press, and keys before it are lost.
async function intoCode(card) {
  await card.getByRole("textbox").first().click();
  await expect(
    card.locator(".cm-editor.cm-focused"),
    "the code editor has the keyboard",
  ).toBeVisible({ timeout: 30000 });
}

// A live block's Copy copies its code as the reader has it now, with
// their edits.
test("a live example's Copy copies its code as edited", async ({ browser }) => {
  const { context, page } = await opened(
    browser,
    { width: 1440, height: 900 },
    "light",
    "/quality/motion/",
  );
  try {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const card = page
      .getByRole("group", { name: /^Code: / })
      .filter({ has: page.getByRole("textbox") })
      .first();
    const copy = card.getByRole("button", { name: /^Copy\b/ });
    await copy.click();
    await expect(card.getByText("Copied")).toBeVisible();
    const written = await page.evaluate(() => navigator.clipboard.readText());
    expect(written.trim().length).toBeGreaterThan(0);
    await intoCode(card);
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.type("// as edited\n");
    await card.getByRole("button", { name: /^(Copy|Copied)\b/ }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()), {
        message: "the clipboard has the edited code",
      })
      .toBe(`// as edited\n${written}`);
  } finally {
    await context.close();
  }
});

// A page with no clipboard copies nothing, and Copy never says it did.
test("Copy on a page with no clipboard never says Copied", async ({
  browser,
}) => {
  const { context, page } = await opened(
    browser,
    { width: 1440, height: 900 },
    "light",
    "/start/first-app/",
  );
  try {
    await page.evaluate(() =>
      Object.defineProperty(Navigator.prototype, "clipboard", {
        get: () => undefined,
        configurable: true,
      }),
    );
    const card = page.getByRole("group", { name: /^Code: / }).first();
    await card.getByRole("button", { name: /^Copy\b/ }).click();
    // What Copy is told comes back in a promise: past two frames it has.
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        ),
    );
    await expect(card.getByText("Copied")).toHaveCount(0);
    await expect(card.getByRole("button", { name: /^Copy\b/ })).toBeVisible();
  } finally {
    await context.close();
  }
});

// On the narrowest phone a live block of several files still gives each
// file's tab to the reader: whole, under the pointer, clear of Copy.
for (const route of [
  "/language/controllers/",
  "/language/modules-and-imports/",
]) {
  for (const scheme of SCHEMES) {
    test(`${route}'s file tabs can each be reached on a narrow phone, ${scheme}`, async ({
      browser,
    }) => {
      const { context, page } = await opened(
        browser,
        { width: 320, height: 640 },
        scheme,
        route,
      );
      try {
        // A tab's focus is the runtime's, as an item's is in Qt, so only
        // keys give it and it shows only in what they do: out of the code
        // and back to Copy, back to the first file, then on to the last,
        // Space choosing each.
        const card = page
          .locator('[data-object-name="codeCard"]:visible')
          .filter({ has: page.locator('[role="tab"]:visible') })
          .first();
        const tabs = card.locator('[role="tab"]:visible');
        const count = await tabs.count();
        expect(count, "a block of several files").toBeGreaterThan(1);
        const copy = card.getByRole("button", { name: /^(Copy|Copied)\b/ }).first();
        await intoCode(card);
        await page.keyboard.press("Escape");
        await page.keyboard.press("Shift+Tab");
        const steps = [];
        for (let index = count - 1; index >= 0; index--)
          steps.push(["Shift+Tab", index]);
        for (let index = 1; index < count; index++) steps.push(["Tab", index]);
        for (const [key, index] of steps) {
          const tab = tabs.nth(index);
          await page.keyboard.press(key);
          await page.keyboard.press("Space");
          await expect(tab, `${key} gives tab ${index + 1} the keyboard`).toHaveAttribute("aria-selected", "true");
          // Down to the card's head, and never sideways to what it clips.
          await copy.evaluate((node) => node.scrollIntoView({ block: "center", inline: "nearest" }));
          await expect
            .poll(
              () =>
                tab.evaluate((node) => {
                  const card = node.closest('[data-object-name="codeCard"]');
                  const box = node.getBoundingClientRect();
                  const middle = box.top + box.height / 2;
                  const wrong = [];
                  for (const x of [
                    box.left + 1,
                    box.left + box.width / 2,
                    box.right - 1,
                  ]) {
                    if (!node.contains(document.elementFromPoint(x, middle)))
                      wrong.push(`covered or clipped at x=${Math.round(x)}`);
                  }
                  for (const button of card.querySelectorAll('[role="button"], button')) {
                    if (!/^(Copy|Copied)\b/.test(button.getAttribute("aria-label") ?? button.textContent.trim()))
                      continue;
                    const copy = button.getBoundingClientRect();
                    if (box.left < copy.right && box.right > copy.left && box.top < copy.bottom && box.bottom > copy.top)
                      wrong.push("under Copy");
                  }
                  // A card that clips is never scrolled to show what it clipped.
                  for (let up = node.parentElement; up && card.contains(up); up = up.parentElement) {
                    if (getComputedStyle(up).overflowX === "hidden" && up.scrollLeft)
                      wrong.push("the card's clip was scrolled");
                  }
                  return wrong;
                }),
              { message: `tab ${index + 1} of ${count}`, timeout: 3000 },
            )
            .toEqual([]);
        }
      } finally {
        await context.close();
      }
    });
  }
}

// A file whose name is wider than the card's head on the narrowest
// phone: its tab still fits in the head, clear of Copy, and a reader
// still hears the whole name. The docs have no such name, so the test
// gives one to the fetching page's example of two files, everywhere the
// page says it (the tab, the code that fetches it, the prose), and the
// example stays the same example.
const LONG = "north-district-crew-activity-for-the-whole-week.json";
for (const scheme of SCHEMES) {
  test(`a file's long name keeps its tab inside the card's head on a narrow phone, ${scheme}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 320, height: 640 },
      colorScheme: scheme,
      reducedMotion: "no-preference",
    });
    try {
      await context.route("**/data/fetching/**", async (route) => {
        const response = await route.fetch();
        if (!/html|json|javascript/.test(response.headers()["content-type"] ?? ""))
          return route.fulfill({ response });
        const body = (await response.text()).replaceAll("activity.json", LONG);
        await route.fulfill({ response, body });
      });
      const page = await context.newPage();
      await page.goto(base + "data/fetching/");
      await page.waitForSelector('#app[data-ljos-hydrated="true"]');
      // Found by the name a reader hears: the whole of it.
      const tab = page.getByRole("tab", { name: LONG, exact: true }).filter({ visible: true });
      await expect(tab, "a reader hears the whole name").toHaveCount(1);
      const card = page.locator('[data-object-name="codeCard"]:visible').filter({ has: tab });
      const copy = card.getByRole("button", { name: /^(Copy|Copied)\b/ }).first();
      // The tabs come in the order of the page's blocks, and the strip
      // starts at the first: the long name's place is said in each
      // message, so a page that reorders them reads plainly.
      const names = await card
        .locator('[role="tab"]:visible')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label") ?? node.textContent.trim()));
      const at = names.indexOf(LONG);
      const order = `tab ${at + 1} of ${names.join(", ")}`;
      expect(at, `the long name is one of the card's tabs (${order})`).toBeGreaterThanOrEqual(0);
      // Given the keyboard as a reader gives it, wherever it is: its focus
      // scrolls the strip to it. Out of the code to Copy, then back along
      // the tabs from the last.
      await intoCode(card);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Shift+Tab");
      for (let index = names.length - 1; index >= at; index--) await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Space");
      await expect(tab, `Shift+Tab gives it the keyboard (${order})`).toHaveAttribute("aria-selected", "true");
      await copy.evaluate((node) => node.scrollIntoView({ block: "center", inline: "nearest" }));
      await expect
        .poll(
          () =>
            tab.evaluate((node, name) => {
              const card = node.closest('[data-object-name="codeCard"]');
              const [box, edge] = [node.getBoundingClientRect(), card.getBoundingClientRect()];
              const copy = [...card.querySelectorAll('[role="button"], button')]
                .find((button) => /^(Copy|Copied)\b/.test(button.getAttribute("aria-label") ?? button.textContent.trim()))
                .getBoundingClientRect();
              const wrong = [];
              // What the test is about: the whole name could not fit.
              const words = node.querySelector(".qq-text") ?? node;
              const pen = document.createElement("canvas").getContext("2d");
              pen.font = getComputedStyle(words).font;
              if (pen.measureText(name).width <= copy.left - edge.left)
                wrong.push("the name is not wider than the head");
              if (box.left < edge.left || box.right > copy.left) wrong.push("out of the head, or under Copy");
              const middle = box.top + box.height / 2;
              for (const x of [box.left + 1, box.left + box.width / 2, box.right - 1]) {
                if (!node.contains(document.elementFromPoint(x, middle)))
                  wrong.push(`covered or clipped at x=${Math.round(x)}`);
              }
              return wrong;
            }, LONG),
          { message: `the long name's tab, ${order}`, timeout: 3000 },
        )
        .toEqual([]);
    } finally {
      await context.close();
    }
  });
}

// Run and edited, every control of the toolbar is clear of the others
// and of the word that says the code is edited.
for (const scheme of SCHEMES) {
  test(`an edited, running example's toolbar fits a narrow phone, ${scheme}`, async ({
    browser,
  }) => {
    const { context, page } = await opened(
      browser,
      { width: 320, height: 640 },
      scheme,
      "/start/first-app/",
    );
    try {
      const card = page
        .locator('[data-object-name="codeCard"]')
        .filter({ has: page.getByRole("textbox") })
        .first();
      await card.getByRole("button", { name: /^Run / }).click();
      await expect(
        card.getByRole("button", { name: /^Observer for/ }),
      ).toBeVisible({ timeout: 15000 });
      await intoCode(card);
      await page.keyboard.press("ControlOrMeta+Home");
      await page.keyboard.type("// as edited\n");
      await expect(card.locator('[data-object-name="editedBadge"]')).toBeVisible();
      await expect(
        card.getByRole("button", { name: /^Observer for/ }),
      ).toBeVisible({ timeout: 15000 });
      await expect
        .poll(
          () =>
            card.evaluate((node) => {
              const bar = node.querySelector('[data-object-name="codeToolbar"]');
              const within = bar.getBoundingClientRect();
              const parts = [
                ...bar.querySelectorAll('[role="button"], button, [data-object-name="editedBadge"]'),
              ]
                .filter((part) => part.getClientRects().length && getComputedStyle(part).visibility !== "hidden")
                .map((part) => ({
                  name: part.getAttribute("aria-label") ?? part.textContent.trim(),
                  box: part.getBoundingClientRect(),
                }))
                .filter(({ box }) => box.width > 0 && box.height > 0);
              const wrong = [];
              parts.forEach(({ name, box }, index) => {
                if (box.left < within.left - 0.5 || box.right > within.right + 0.5 || box.top < within.top - 0.5 || box.bottom > within.bottom + 0.5)
                  wrong.push(`${name} is outside the toolbar`);
                for (const other of parts.slice(index + 1)) {
                  if (box.left < other.box.right - 0.5 && box.right > other.box.left + 0.5 && box.top < other.box.bottom - 0.5 && box.bottom > other.box.top + 0.5)
                    wrong.push(`${name} overlaps ${other.name}`);
                }
              });
              return wrong;
            }),
          { timeout: 5000 },
        )
        .toEqual([]);
    } finally {
      await context.close();
    }
  });
}

// A page whose examples draw nothing of their own (a signal, a
// property: their point is a value), one whose example draws three
// unpainted items in a row, and one whose examples draw and move.
const STAGES = [
  "/language/signals-and-handlers/",
  "/data/repeater-and-delegates/",
  "/quality/motion/",
];

// The window a picture stands in: its box's first ancestor that clips.
// Run in the page.
const windowAround = (node) => {
  let frame = node.parentElement;
  while (frame && getComputedStyle(frame).overflow === "visible")
    frame = frame.parentElement;
  return frame;
};

// Each live example's window, as the reader sees it before running it.
// What it draws is told from its pixels: how many differ from the
// colour most of it is, and how light that colour is. Each window is
// shot where it is once scrolled to: the page scrolls inside its own
// view, so a box read before scrolling to the next is stale by then.
async function windows(page) {
  const frames = [];
  for (const img of await page
    .locator('#app img[alt="What this example draws"]')
    .elementHandles())
    if (await img.evaluate((node) => node.getBoundingClientRect().width > 0))
      frames.push({ img, frame: await img.evaluateHandle(windowAround) });
  const out = [];
  for (const [index, { img, frame }] of frames.entries()) {
    await frame.evaluate((node) => node.scrollIntoView({ block: "center" }));
    await img.evaluate((node) => node.decode());
    const shot = await frame.screenshot();
    out.push({
      index,
      ...(await page.evaluate(async (png) => {
        const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(
          new Blob([bytes], { type: "image/png" }),
        );
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d");
        context.drawImage(bitmap, 0, 0);
        const { data } = context.getImageData(
          0,
          0,
          bitmap.width,
          bitmap.height,
        );
        const counts = new Map();
        for (let i = 0; i < data.length; i += 4) {
          const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        const [most] = [...counts].sort((a, b) => b[1] - a[1])[0];
        const ground = [most >> 16, (most >> 8) & 255, most & 255];
        let ink = 0;
        for (let i = 0; i < data.length; i += 4)
          if (ground.some((c, k) => Math.abs(data[i + k] - c) > 24)) ink += 1;
        const lightness =
          (0.2126 * ground[0] + 0.7152 * ground[1] + 0.0722 * ground[2]) / 255;
        return { ink, lightness, pixels: data.length / 4 };
      }, shot.toString("base64"))),
    });
  }
  return out;
}

for (const route of STAGES) {
  for (const colorScheme of ["light", "dark"]) {
    test(`${route}'s stages each show something, on a ground of the ${colorScheme} scheme`, async ({
      browser,
    }) => {
      const { context, page } = await opened(
        browser,
        { width: 1440, height: 900 },
        colorScheme,
        route,
      );
      try {
        const found = await windows(page);
        expect(found.length, "a window for each live example").toBeGreaterThan(
          0,
        );
        for (const { index, ink, lightness } of found) {
          // Words or a shape: a few dozen pixels, not the window's own
          // ground alone.
          expect(ink, `window ${index}: draws something`).toBeGreaterThan(40);
          if (colorScheme === "dark")
            expect(
              lightness,
              `window ${index}: stands on the dark scheme's ground`,
            ).toBeLessThan(0.4);
          else
            expect(
              lightness,
              `window ${index}: stands on the light scheme's ground`,
            ).toBeGreaterThan(0.6);
        }
      } finally {
        await context.close();
      }
    });
  }
}

// An empty picture can have any ground: a bare Window's is white, in
// the dark too. Every picture is served as one loud colour, which no
// token of the site's is, so wherever a picture shows, it shows as that.
const LOUD =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" preserveAspectRatio="none"><rect width="1" height="1" fill="#ff00ff"/></svg>';
// With the Run's instruction once the page knows it can run, and without before.
const NOTHING = ["Nothing drawn yet.", "Nothing drawn yet. Run it to see what it does."];
const saysNothing = (frame) =>
  frame.evaluate(
    (node, texts) =>
      [...node.querySelectorAll("*")].some(
        // A narrow window wraps the line, and the wrap is in its text.
        (child) =>
          texts.includes(child.textContent.replace(/\s+/g, " ").trim()) &&
          child.checkVisibility({ visibilityProperty: true }),
      ),
    NOTHING,
  );

for (const colorScheme of ["light", "dark"]) {
  test(`"Nothing drawn yet" hides the picture's own ground in the ${colorScheme} scheme`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme,
    });
    try {
      await context.route("**/Examples/*.png", (route) =>
        route.fulfill({ contentType: "image/svg+xml", body: LOUD }),
      );
      const page = await context.newPage();
      const seen = { empty: 0, drawn: 0 };
      // Examples that draw nothing, and examples that draw.
      for (const route of ["/language/signals-and-handlers/", "/quality/motion/"]) {
        await page.goto(base + route.replace(/^\//, ""));
        await page.waitForSelector('#app[data-ljos-hydrated="true"]');
        for (const img of await page
          .locator('#app img[alt="What this example draws"]')
          .filter({ visible: true })
          .elementHandles()) {
          const frame = await img.evaluateHandle(windowAround);
          await frame.evaluate((node) => node.scrollIntoView({ block: "center" }));
          await img.evaluate((node) => node.decode());
          const says = await saysNothing(frame);
          const png = (await frame.screenshot()).toString("base64");
          const loud = await page.evaluate(async (data) => {
            const bitmap = await createImageBitmap(
              await (await fetch(`data:image/png;base64,${data}`)).blob(),
            );
            const context = new OffscreenCanvas(
              bitmap.width,
              bitmap.height,
            ).getContext("2d");
            context.drawImage(bitmap, 0, 0);
            const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
            let count = 0;
            for (let i = 0; i < pixels.length; i += 4)
              if (pixels[i] > 200 && pixels[i + 1] < 60 && pixels[i + 2] > 200)
                count += 1;
            return count;
          }, png);
          if (says) {
            expect(loud, `${route}: no picture shows under the words`).toBe(0);
            seen.empty += 1;
          } else {
            expect(loud, `${route}: a drawn picture still shows`).toBeGreaterThan(0);
            seen.drawn += 1;
          }
        }
      }
      expect(seen.empty, "a window that says it is empty").toBeGreaterThan(0);
      expect(seen.drawn, "a window with a picture").toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });
}

// The words are ink too, so the stages' test above passes over a picture
// wrongly called empty. These are the docs' own examples, by a line of
// each: whether it draws as it starts is told from its source, and the
// build must say the same, with the picture's own pixels behind it.
const AT_START = {
  "/language/signals-and-handlers/": {
    draws: [],
    empty: [
      'ping(3, "start")',
      'objectName: "entry"',
      "count = 5",
      "function onPing(n)",
      "later(finishBatch)",
    ],
  },
  "/data/repeater-and-delegates/": {
    draws: ['"count " + inst.count'],
    empty: ['objectName: "d" + index'],
  },
  "/quality/motion/": {
    draws: ['qsTr("Menu transition")', 'qsTr("Drawer reveal")'],
    // Its popup starts at opacity 0, and fades in once it runs.
    empty: ['qsTr("Reduced motion")'],
  },
  "/quality/accessibility/": {
    draws: ['qsTr("Compose note")'],
    empty: [],
  },
};

for (const [route, { draws, empty }] of Object.entries(AT_START)) {
  for (const colorScheme of ["light", "dark"]) {
    test(`${route} calls empty only what draws nothing as it starts, in the ${colorScheme} scheme`, async ({
      browser,
    }) => {
      const { context, page } = await opened(
        browser,
        { width: 1440, height: 900 },
        colorScheme,
        route,
      );
      try {
        const sources = await page.evaluate(() =>
          JSON.parse(document.getElementById("ljos-props").textContent)
            .page.blocks.filter((block) => block.kind === "live")
            .map(({ live }) => live.display.map(({ code }) => code).join("\n")),
        );
        const pictures = page
          .locator('#app img[alt="What this example draws"]')
          .filter({ visible: true });
        await expect(pictures, "a picture for each live example").toHaveCount(
          sources.length,
        );
        for (const line of [...draws, ...empty]) {
          const at = sources.flatMap((code, index) =>
            code.includes(line) ? [index] : [],
          );
          expect(at, `the one example with ${line}`).toHaveLength(1);
          const img = await pictures.nth(at[0]).elementHandle();
          await img.evaluate((node) =>
            node.scrollIntoView({ block: "center" }),
          );
          const says = await saysNothing(await img.evaluateHandle(windowAround));
          expect.soft(says, `${line}: says nothing is drawn`).toBe(
            empty.includes(line),
          );
          if (empty.includes(line)) continue;
          const ink = await img.evaluate(async (node) => {
            await node.decode();
            const canvas = new OffscreenCanvas(
              node.naturalWidth,
              node.naturalHeight,
            );
            const context = canvas.getContext("2d");
            context.drawImage(node, 0, 0);
            const pixels = new Uint32Array(
              context.getImageData(0, 0, canvas.width, canvas.height).data.buffer,
            );
            const counts = new Map();
            for (const pixel of pixels)
              counts.set(pixel, (counts.get(pixel) ?? 0) + 1);
            return pixels.length - Math.max(...counts.values());
          });
          expect.soft(ink, `${line}: the picture itself draws`).toBeGreaterThan(40);
        }
      } finally {
        await context.close();
      }
    });
  }
}

// On a phone the reader sees what an example does before how: its
// stage comes first, and code longer than a screenful folds after
// about twelve lines until they ask for all of it. On a desktop
// nothing folds.
const FOLDED = 12;
const LONG = 15;

// Each block's code as the page lays it out, with the card it is in:
// the card's group where it has one, else what holds the code and the
// example's picture.
const folds = (page) =>
  page.evaluate(() => {
    const shown = (node) => {
      const box = node.getBoundingClientRect();
      return (
        box.width > 0 &&
        box.height > 0 &&
        getComputedStyle(node).visibility !== "hidden"
      );
    };
    const PICTURE = 'img[alt="What this example draws"]';
    const holding = (node) => {
      const group = node.closest('[role="group"][aria-label^="Code"]');
      if (group) return group;
      let up = node.parentElement;
      for (
        let i = 0;
        i < 10 && up && up.id !== "app";
        i++, up = up.parentElement
      )
        if ([...up.querySelectorAll(PICTURE)].some(shown)) return up;
      return node.parentElement;
    };
    return [...document.querySelectorAll("#app .qq-rich")]
      .filter(
        (node) =>
          shown(node) &&
          getComputedStyle(node).fontFamily.startsWith("ui-monospace"),
      )
      .map((code, index) => {
        const card = holding(code);
        const picture = [...card.querySelectorAll(PICTURE)].find(shown);
        const line = parseFloat(getComputedStyle(code).lineHeight);
        const box = code.getBoundingClientRect();
        // What of the code shows is what every window between it and
        // its card lets through: a scroller as tall as the code can sit
        // in a fold that clips it.
        let [top, bottom] = [box.top, box.bottom];
        for (
          let up = code.parentElement;
          up && up !== card;
          up = up.parentElement
        )
          if (getComputedStyle(up).overflow !== "visible") {
            const clip = up.getBoundingClientRect();
            [top, bottom] = [
              Math.max(top, clip.top),
              Math.min(bottom, clip.bottom),
            ];
          }
        return {
          index,
          name: card.getAttribute("aria-label") ?? `code block ${index + 1}`,
          lines: Math.round(box.height / line),
          line,
          shownHeight: Math.max(0, bottom - top),
          codeTop: box.top,
          pictureTop: picture ? picture.getBoundingClientRect().top : null,
          showsAll: [...card.querySelectorAll('[role="button"], button')].some(
            (node) =>
              shown(node) &&
              /^Show all\b/.test(
                node.getAttribute("aria-label") ?? node.textContent.trim(),
              ),
          ),
        };
      });
  });

for (const route of ["/quality/motion/", "/data/repeater-and-delegates/"]) {
  test(`${route} on a phone shows each example's stage before its code`, async ({
    browser,
  }) => {
    const { context, page } = await opened(
      browser,
      { width: 390, height: 844 },
      "light",
      route,
    );
    try {
      const live = (await folds(page)).filter(
        (card) => card.pictureTop !== null,
      );
      expect(live.length, "live examples on the page").toBeGreaterThan(0);
      for (const card of live)
        expect(
          card.pictureTop,
          `${card.name}: its stage is above its code`,
        ).toBeLessThan(card.codeTop);
    } finally {
      await context.close();
    }
  });
}

for (const [view, viewport] of [
  ["phone", { width: 390, height: 844 }],
  ["desktop", { width: 1440, height: 900 }],
]) {
  test(`/quality/motion/'s long code ${view === "phone" ? "folds after about twelve lines on a phone, and Show all shows all of it" : "never folds on a desktop"}`, async ({
    browser,
  }) => {
    const { context, page } = await opened(
      browser,
      viewport,
      "light",
      "/quality/motion/",
    );
    try {
      const all = (await folds(page)).filter((card) => card.lines > 0);
      const long = all.filter((card) => card.lines > LONG);
      expect(long.length, "examples longer than a screenful").toBeGreaterThan(
        0,
      );
      for (const card of all) {
        if (view === "phone" && card.lines > LONG) {
          expect(
            card.shownHeight,
            `${card.name}: lines shown before Show all`,
          ).toBeLessThanOrEqual((FOLDED + 1) * card.line + 32);
          expect(card.showsAll, `${card.name}: offers Show all`).toBe(true);
        } else {
          expect(
            card.shownHeight,
            `${card.name}: every line shown`,
          ).toBeGreaterThanOrEqual(card.lines * card.line - 1);
          expect(card.showsAll, `${card.name}: offers no Show all`).toBe(false);
        }
      }
      if (view === "phone") {
        const first = long[0];
        // Only a long block offers it, and this is the first.
        await page
          .getByRole("button", { name: /^Show all\b/ })
          .first()
          .click();
        await expect
          .poll(async () => (await folds(page))[first.index].shownHeight, {
            message: `${first.name}: all of it once asked`,
          })
          .toBeGreaterThanOrEqual(first.lines * first.line - 1);
      }
    } finally {
      await context.close();
    }
  });
}
