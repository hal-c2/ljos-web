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

async function opened(browser, viewport, colorScheme, route) {
  const context = await browser.newContext({
    viewport,
    colorScheme,
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  await page.goto(route);
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
