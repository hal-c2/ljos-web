// Every live example and every demo, running, in the reader's light and
// dark: what each draws stays readable on what it stands on (axe-core's
// color-contrast, WCAG AA), whichever scheme the browser asks for and
// whichever the reader picks in the header after the page is open.
import AxeBuilder from "@axe-core/playwright";
import { centre, classify, expect, livePages, open, press, run, test } from "./fixtures.js";

// axe's contrast, and nothing else: the rest of what axe asks is
// tests/a11y.spec.js's.
async function contrast(page, include) {
  const { violations } = await new AxeBuilder({ page }).include(include).withRules(["color-contrast"]).analyze();
  return violations.flatMap(({ nodes }) => nodes.map((node) => ({ target: node.target, line: `${node.target.join(" ")} — ${node.failureSummary?.split("\n").slice(1).join(" ").trim()}` })));
}
const unreadable = async (page, include) => (await contrast(page, include)).map(({ line }) => line);

// What each scheme is asked by: the browser's own setting, before
// anything is opened.
const SCHEMES = ["light", "dark"];

// An example whose opening comment says it trips the contrast check is
// there to show what that looks like, and is not read for it.
const showsUnreadable = ({ code }) => /^(\s*\/\/[^\n]*\n)*?\s*\/\/[^\n]*color-text-contrast/.test(code);

// Ljós's own palettes draw placeholder words under AA. Basic's
// placeholderText is see-through: #88353637 in light
// (packages/runtime/QtQuick/Controls/Basic/index.js:37, from ljos-ui's
// palette.rs) and #88c8c9cb in dark (QtQuick/Palette.ts:89). What it
// comes to depends on what it is drawn on: #919191 on #f9f9f8 (2.99:1)
// or #939494 on white (3.04:1) in light, #707172 on #0c0c0c (3.99:1) in
// dark. That is the palettes' to fix, not an example's. So a field's
// placeholder is not counted here, and nothing else is: the words must
// be drawn in that colour and be the placeholder of an empty field
// beside them, the input that those very words name. Real words in the
// same colour still count. The test at the end turns red once the
// palettes meet AA, and this comes out with it.
const PLACEHOLDER = { light: "#88353637", dark: "#88c8c9cb" };
const rgba = (hex) => {
  const digits = hex.slice(1);
  const [a, rgb] = digits.length === 8 ? [parseInt(digits.slice(0, 2), 16) / 255, digits.slice(2)] : [1, digits];
  return { a, rgb: [0, 2, 4].map((at) => parseInt(rgb.slice(at, at + 2), 16)) };
};
// What a colour comes to on an opaque background, to within rounding.
const drawsAs = (colour, background, seen) => {
  const { a, rgb } = rgba(colour);
  const under = rgba(background).rgb;
  return rgba(seen).rgb.every((channel, at) => Math.abs(channel - (a * rgb[at] + (1 - a) * under[at])) <= 2);
};
const inPlaceholderColour = (colorScheme, line) => {
  const [, seen, background] = /foreground color: (#[0-9a-f]{6}), background color: (#[0-9a-f]{6})/.exec(line) ?? [];
  return seen !== undefined && drawsAs(PLACEHOLDER[colorScheme], background, seen);
};
// The words an axe node draws, and whether they are an empty field's
// placeholder: the field's input or textarea is named by them (a field
// is called by its placeholder until it is given a name), holds no text,
// and is where they are drawn, as a placeholder stands in for the text
// the field would show. Words beside the field that say the same are
// not its placeholder. The field is looked for no further out than the
// TextField that holds both.
const placeholderOf = (page, target) =>
  page.evaluate((selector) => {
    const element = document.querySelector(selector);
    const words = element?.textContent.trim() ?? "";
    const drawn = element?.getBoundingClientRect();
    const under = (field) => {
      const box = field.getBoundingClientRect();
      const [x, y] = [drawn.left + drawn.width / 2, drawn.top + drawn.height / 2];
      return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    };
    for (let at = element?.parentElement, out = 0; at && out < 3; at = at.parentElement, out += 1) {
      const field = [...at.querySelectorAll("input, textarea")].find((each) => each.getAttribute("aria-label") === words && under(each));
      if (field) return { words, placeholder: field.value === "" };
    }
    return { words, placeholder: false };
  }, target.join(" "));

// A field's placeholder is drawn where its text would be. Words beside
// the field that say the same, in the same colour, are the example's own
// and are counted: Notes is the TextArea's placeholder, and is a Text too.
test("words beside an empty field that say what its placeholder says are counted", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  const route = "/controls/value-inputs/";
  const { examples } = livePages().find((each) => each.route === route);
  const example = examples.find((each) => /placeholderText: "Notes"/.test(each.code));
  await open(page, route);
  const block = await run(page, example.index);
  await press(block.block.getByRole("textbox").first());
  await expect(block.block.locator(".cm-editor.cm-focused"), "the code editor has the keyboard").toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(
    example.code.replace("    TextArea {", `    Text { text: "Notes"; color: "${PLACEHOLDER.light}" }\n\n    TextArea {`),
  );
  const notes = block.block.locator(".qq-text").filter({ hasText: /^Notes$/ });
  await expect(notes, "the edit ran: the Text and the placeholder").toHaveCount(2, { timeout: 30_000 });
  // axe reads what text stands on from what is drawn at its point, which
  // is known only inside the window: words below it are left out, not
  // counted. The open editor pushes the example down, so it is centred.
  await centre(block.running);
  for (const at of [0, 1]) await expect(notes.nth(at), "both are in the window for axe to read").toBeInViewport();
  await page.waitForTimeout(400);
  await block.running.evaluate((element) => element.setAttribute("data-themes-check", ""));
  const all = await contrast(page, "[data-themes-check]");
  expect(all.filter(({ line }) => inPlaceholderColour("light", line)), "axe finds both under AA").toHaveLength(2);
  const found = await unexcused(page, "[data-themes-check]", "light", route, new Set());
  expect(found, "the placeholder is excused, the Text beside it is not").toHaveLength(1);
  const counted = await page.evaluate((selector) => document.querySelector(selector).getBoundingClientRect().top, found[0].split(" — ")[0]);
  const [above] = await notes.evaluateAll((each) => each.map((element) => element.getBoundingClientRect().top).sort((a, b) => a - b));
  expect(counted, "and what is counted is the Text, above the field").toBe(above);
});

// Examples from ljos-ui's docs that draw real words in the placeholder
// colour, so they are under AA. Listed by their words, never by colour,
// and only on their own page. The docs are to change them (ljos-ui, the
// docs copy PR). Each listed one must still be found, so the list empties
// as they are fixed.
const UNDER_AA = [{ route: "/quality/layout-and-typography/", words: "Select at least one result to publish" }];

// The listed words an example draws: they are in its code, as a reader
// reads it on the page.
const listedIn = (route, example) => UNDER_AA.filter((each) => each.route === route && example.files.some(({ code }) => code.includes(each.words)));

test("each of UNDER_AA's words is in an example on its page", () => {
  const unplaced = UNDER_AA.filter(({ route }) => !livePages().some((page) => page.route === route && page.examples.some((example) => listedIn(route, example).length > 0)));
  expect(unplaced, "words no example on their page draws: take them out of UNDER_AA").toEqual([]);
});

// What of the contrast check is the example's: everything but the
// palette's placeholders, and the listed words seen on their page.
async function unexcused(page, include, colorScheme, route, seen) {
  const found = [];
  for (const { target, line } of await contrast(page, include)) {
    if (inPlaceholderColour(colorScheme, line)) {
      const { words, placeholder } = await placeholderOf(page, target);
      if (placeholder) continue;
      const listed = UNDER_AA.find((each) => each.route === route && each.words === words);
      if (listed) {
        seen.add(listed);
        continue;
      }
    }
    found.push(line);
  }
  return found;
}

// A popup nothing opens draws no words to read (examples.spec.js holds
// it shut).
const pages = livePages()
  .map((page) => ({ ...page, examples: page.examples.filter((example) => !showsUnreadable(example) && !classify(example.code).closed) }))
  .filter((page) => page.examples.length > 0);

for (const colorScheme of SCHEMES) {
  test.describe(`in ${colorScheme}`, () => {
    test.use({ colorScheme });

    // One test an example, not one a page: the shards are cut by how
    // many tests there are, so a page of twenty examples read in one
    // test made a shard of its own that ran twice as long as the rest.
    for (const { route, examples } of pages) {
      for (const example of examples) {
        test(`${route} #${example.index} (${example.hash}): its words are readable on what it draws`, async ({ page }) => {
          await open(page, route);
          const block = await run(page, example.index);
          // Settled: an example that fades in is read where it lands.
          await page.waitForTimeout(400);
          await block.running.evaluate((element) => element.setAttribute("data-themes-check", ""));
          const seen = new Set();
          expect(await unexcused(page, "[data-themes-check]", colorScheme, route, seen)).toEqual([]);
          expect(
            listedIn(route, example).filter((each) => !seen.has(each)),
            "these listed words are readable now: take them out of UNDER_AA",
          ).toEqual([]);
        });
      }
    }

    // The demos, under their headings on /demos/; the flagship is made
    // as a reader scrolls to it.
    for (const heading of ["A shell you rewrite", "3D you can orbit", "A shader effect", "A whole app", "Motion"]) {
      test(`the demo "${heading}" is readable`, async ({ page }) => {
        await open(page, "/demos/");
        const title = page.locator("#app div.qq-text").filter({ hasText: new RegExp(`^${heading}$`) }).first();
        await centre(title);
        const section = title.locator("xpath=../..");
        await centre(section);
        await page.waitForTimeout(1_200);
        await section.evaluate((element) => element.setAttribute("data-themes-check", ""));
        expect(await unreadable(page, "[data-themes-check]")).toEqual([]);
      });
    }
  });
}

// A pick in the header reaches what is already running: the demos
// follow the page's scheme, not the browser's alone.
test("a scheme picked in the header reaches the demos that are running", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await open(page, "/demos/");
  const title = page.locator("#app div.qq-text").filter({ hasText: /^Motion$/ }).first();
  await centre(title);
  await page.waitForTimeout(800);
  const motion = title.locator("xpath=../..");
  // The colours it paints with, not its picture: the demo moves on its
  // own, so a picture would change with no pick at all.
  const look = () => motion.evaluate((element) => [...element.querySelectorAll("*")].map((child) => `${getComputedStyle(child).backgroundColor}/${getComputedStyle(child).color}`).join());
  const light = await look();
  await page.getByRole("button", { name: "Use the dark theme" }).first().click();
  await expect(page.locator("html")).toHaveAttribute("data-ljos-scheme", "dark");
  await expect.poll(look, { message: "the demo is drawn again in the dark" }).not.toBe(light);
  await motion.evaluate((element) => element.setAttribute("data-themes-check", ""));
  expect(await unreadable(page, "[data-themes-check]")).toEqual([]);
});

// What PLACEHOLDER excuses is still so: a field's placeholder, in
// Ljós's own style, is under AA. Red once the palette is fixed: take
// PLACEHOLDER out then.
for (const colorScheme of SCHEMES) {
  test(`in ${colorScheme} Ljós's placeholder colour is still under AA, as excused above`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    const example = livePages()
      .flatMap(({ route, examples }) => examples.map((each) => ({ route, ...each })))
      // An empty one: a field with words in it shows them, not its
      // placeholder.
      .find(({ code }) => [...code.matchAll(/\b(TextField|TextArea)\s*\{([^}]*)\}/gs)].some(([, , body]) => body.includes("placeholderText:") && !/(^|\s)text:/.test(body)));
    expect(example, "an example with an empty Ljós field and a placeholder").toBeTruthy();
    await open(page, example.route);
    const block = await run(page, example.index);
    await page.waitForTimeout(400);
    await block.running.evaluate((element) => element.setAttribute("data-themes-check", ""));
    const placeholders = [];
    for (const { target, line } of await contrast(page, "[data-themes-check]"))
      if (inPlaceholderColour(colorScheme, line) && (await placeholderOf(page, target)).placeholder) placeholders.push(line);
    expect(placeholders, "the placeholder is still under AA").not.toEqual([]);
  });
}
