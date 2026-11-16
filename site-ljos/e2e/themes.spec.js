// Every live example and every demo, running, in the reader's light and
// dark: what each draws stays readable on what it stands on (axe-core's
// color-contrast, WCAG AA), whichever scheme the browser asks for and
// whichever the reader picks in the header after the page is open.
import AxeBuilder from "@axe-core/playwright";
import { centre, expect, livePages, open, run, test } from "./fixtures.js";

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

const pages = livePages()
  .map((page) => ({ ...page, examples: page.examples.filter((example) => !showsUnreadable(example)) }))
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
          }))) found.push(`#${example.index} (${example.hash}): ${line}`);
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
