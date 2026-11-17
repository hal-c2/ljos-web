// Every live example and every demo, running, in the reader's light and
// dark: what each draws stays readable on what it stands on (axe-core's
// color-contrast, WCAG AA), whichever scheme the browser asks for and
// whichever the reader picks in the header after the page is open.
import AxeBuilder from "@axe-core/playwright";
import { centre, classify, expect, livePages, open, run, test } from "./fixtures.js";

// axe's contrast, and nothing else: the rest of what axe asks is
// tests/a11y.spec.js's.
async function unreadable(page, include) {
  const { violations } = await new AxeBuilder({ page }).include(include).withRules(["color-contrast"]).analyze();
  return violations.flatMap(({ nodes }) => nodes.map((node) => `${node.target.join(" ")} — ${node.failureSummary?.split("\n").slice(1).join(" ").trim()}`));
}

// What each scheme is asked by: the browser's own setting, before
// anything is opened.
const SCHEMES = ["light", "dark"];

// An example whose opening comment says it trips the contrast check is
// there to show what that looks like, and is not read for it.
const showsUnreadable = ({ code }) => /^(\s*\/\/[^\n]*\n)*?\s*\/\/[^\n]*color-text-contrast/.test(code);

// Ljós's own palettes draw placeholder words under AA. Basic's
// placeholderText (packages/runtime/QtQuick/Palette.ts, from ljos-ui's
// palette.rs) is see-through, #88353637 in light and #88c8c9cb in dark,
// so what it comes to depends on what it is drawn on: 3.04:1 on white,
// 3.94:1 on black. A field's own empty-state words are #919191 (2.99:1)
// in light and #707172 (3.99:1) in dark. The palettes' to fix, not an
// example's, so words in those colours are not counted here; the test
// at the end turns red once the palettes meet AA, and this comes out
// with it.
const PLACEHOLDER = { light: ["#88353637", "#919191"], dark: ["#88c8c9cb", "#707172"] };
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
const palettes = (colorScheme) => (line) => {
  const [, seen, background] = /foreground color: (#[0-9a-f]{6}), background color: (#[0-9a-f]{6})/.exec(line) ?? [];
  return seen !== undefined && PLACEHOLDER[colorScheme].some((colour) => drawsAs(colour, background, seen));
};

// A popup nothing opens draws no words to read (examples.spec.js holds
// it shut).
const pages = livePages()
  .map((page) => ({ ...page, examples: page.examples.filter((example) => !showsUnreadable(example) && !classify(example.code).closed) }))
  .filter((page) => page.examples.length > 0);

for (const colorScheme of SCHEMES) {
  test.describe(`in ${colorScheme}`, () => {
    test.use({ colorScheme });

    for (const { route, examples } of pages) {
      test(`${route}: every example's words are readable on what it draws`, async ({ page, wasm }) => {
        test.skip(!wasm, "without WebAssembly no example runs");
        await open(page, route);
        const found = [];
        for (const example of examples) {
          const block = await run(page, example.index);
          // Settled: an example that fades in is read where it lands.
          await page.waitForTimeout(400);
          for (const line of await unreadable(page, await block.running.evaluate((element) => {
            element.setAttribute("data-themes-check", "");
            return "[data-themes-check]";
          }))) if (!palettes(colorScheme)(line)) found.push(`#${example.index} (${example.hash}): ${line}`);
          await block.running.evaluate((element) => element.removeAttribute("data-themes-check"));
        }
        expect(found).toEqual([]);
      });
    }

    // The demos, under their headings on /demos/; the flagship is made
    // as a reader scrolls to it.
    for (const heading of ["A shell you rewrite", "3D you can orbit", "A shader effect", "A whole app", "Motion"]) {
      test(`the demo "${heading}" is readable`, async ({ page, wasm }) => {
        test.skip(!wasm, "without WebAssembly a demo is its picture");
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
test("a scheme picked in the header reaches the demos that are running", async ({ page, wasm }) => {
  test.skip(!wasm, "without WebAssembly a demo is its picture");
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
  test(`in ${colorScheme} Ljós's placeholder colour is still under AA, as excused above`, async ({ page, wasm }) => {
    test.skip(!wasm, "without WebAssembly no example runs");
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
    expect((await unreadable(page, "[data-themes-check]")).filter(palettes(colorScheme)), "the placeholder is still under AA").not.toEqual([]);
  });
}
