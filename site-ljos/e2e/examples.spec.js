// Every live example on every docs page, as a reader meets it: the
// page loads with nothing said in its console; the example's picture
// is there; a press runs it in place; it draws; the reader's first
// move on it (a press on its control, a drag, a key, a pinch) does
// what the example is for and leaves nothing thrown; and what moves on
// its own keeps moving. Without WebAssembly the block says so and
// keeps its picture.
//
// An example the audit found broken is `test.fail` with the audit's
// reason (known.js): its test still runs, stays green while it fails,
// and turns red the day it passes, so the change that fixes it must
// take it out of known.js.
import { NEEDS_WASM, centre, centreOf, classify, drag, expect, expectFramesAdvance, livePages, liveBlock, open, pinch, press, run, signature, test, unexpected } from "./fixtures.js";
import { interactions, invisible, still } from "./interactions.js";
import { brokenExample } from "./known.js";

const CONTROL = '[role="button"],[role="checkbox"],[role="switch"],[role="radio"],[role="slider"],[role="tab"],[role="combobox"],[role="spinbutton"],[role="textbox"]:not([aria-label^="Edit "]),input,textarea';

const pages = livePages().filter((page) => page.examples.length > 0);

test("the build wrote pages with live examples", () => {
  expect(pages.length, "pages with live examples").toBeGreaterThan(20);
});

for (const { route, examples } of pages) {
  test.describe(route, () => {
    test("loads with nothing in its console and every example's picture", async ({ page, errors }) => {
      await open(page, route);
      const pictures = page.locator('img[alt="What this example draws"]');
      await expect(pictures).toHaveCount(examples.length);
      // Each picture is there and decoded, not only an element.
      for (const picture of await pictures.all()) {
        await expect(picture).toBeVisible();
        await expect.poll(() => picture.evaluate((img) => img.complete && img.naturalWidth > 0), { message: "the picture decodes" }).toBe(true);
      }
      await page.waitForTimeout(500);
      expect(unexpected(errors)).toEqual([]);
    });

    for (const example of examples) {
      const kind = classify(example.code);
      const name = `#${example.index} ${kind.root} (${example.hash})`;

      test(`${name} runs, draws and answers the reader`, async ({ page, errors, wasm }) => {
        test.skip(!wasm, "without WebAssembly a block does not run; the next test holds what it says");
        const key = `${route}#${example.index}`;
        const broken = brokenExample(route, example.index);
        test.fail(Boolean(broken), broken ?? "");
        const scripted = interactions[key];
        test.fail(Boolean(scripted?.fails), scripted?.fails ?? "");
        await open(page, route);
        const block = await run(page, example.index);
        const told = (await block.told.innerText().catch(() => "")).trim();
        expect(told, "the block says nothing went wrong").toBe("");
        // A popup nothing opens is made and stays shut: nothing on the
        // stage, and nothing there for the reader to move.
        if (kind.closed) {
          await page.waitForTimeout(400);
          await expect(block.stage.locator("xpath=./*[*]").filter({ visible: true }), "a closed popup draws nothing").toHaveCount(0);
          expect(unexpected(errors)).toEqual([]);
          return;
        }
        // It draws: the running example is laid out, visible and holds
        // what it draws (one Text is one element).
        const shown = block.running;
        const { box } = await centreOf(shown);
        expect(box.width * box.height, "the running example has a size").toBeGreaterThan(100);
        expect(await shown.evaluate((element) => element.querySelectorAll("*").length), "the running example holds what it draws").toBeGreaterThan(0);
        if ((kind.moves || kind.threeD) && !still.has(key)) await expectFramesAdvance(shown, { message: "what moves on its own keeps moving" });

        // The reader's first move. An example named in interactions.js
        // gets what it is for, and must show the change it names; any
        // other, its control if it has one (a press must change what it
        // shows, unless it only changes state it never draws), else a
        // press, a drag, keys and a pinch on its middle, none of which
        // may throw.
        const control = shown.locator(CONTROL).first();
        if (scripted) {
          const at = async (fx, fy) => {
            const own = await shown.boundingBox();
            return { x: own.x + own.width * fx, y: own.y + own.height * fy };
          };
          const words = () => shown.innerText();
          const before = { text: await words(), look: await signature(shown) };
          // Waits on what the reader did, not a clock: an example that
          // fetches or parses its data takes as long as the machine
          // needs, and only the test's own timeout bounds it.
          await scripted.act({ page, stage: shown, at });
          if (typeof scripted.expect === "function") await expect.poll(async () => scripted.expect(await words(), { page, stage: shown }), { message: "the example shows what the reader did", timeout: 0 }).toBe(true);
          else if (scripted.expect === "text") await expect.poll(words, { message: "its words change", timeout: 0 }).not.toBe(before.text);
          else await expect.poll(() => signature(shown), { message: "what it shows changes", timeout: 0 }).not.toBe(before.look);
        } else if (invisible.has(key)) {
          await press((await control.count()) ? control : shown);
        } else if (await control.count()) {
          await centre(control);
          const before = await signature(shown);
          const role = await control.evaluate((element) => element.getAttribute("role") ?? element.tagName.toLowerCase());
          if (/textbox|input|textarea/.test(role)) {
            await press(control);
            await page.keyboard.type("ljós");
          } else if (role === "slider") {
            const { x, y, box: slider } = await centreOf(control);
            await drag(page, { x, y }, { x: x + Math.max(20, slider.width / 4), y });
          } else {
            await press(control);
          }
          await expect.poll(() => signature(shown), { message: `a press on its ${role} changes what it shows`, timeout: 0 }).not.toBe(before);
        } else {
          await centre(shown);
          const { x, y } = await centreOf(shown);
          await page.mouse.click(x, y);
          await drag(page, { x: x - 40, y }, { x: x + 40, y: y + 20 });
          await page.keyboard.press("ArrowRight");
          await pinch(page, x, y);
        }
        await page.waitForTimeout(300);
        expect(unexpected(errors)).toEqual([]);
      });

      test(`${name} without WebAssembly says so and keeps its picture`, async ({ page, errors, wasm }) => {
        test.skip(wasm, "only a browser without WebAssembly");
        await open(page, route);
        const block = liveBlock(page, example.index);
        await press(block.picture);
        await expect(block.block).toContainText(NEEDS_WASM);
        await expect(block.picture).toBeVisible();
        expect(unexpected(errors)).toEqual([]);
      });

      test(`${name} shows its QML source`, async ({ page, wasm }) => {
        test.skip(!wasm, "the source is the same words on both; held once");
        await open(page, route);
        const block = liveBlock(page, example.index);
        // A block of several files shows the first and keeps the
        // rest a tab away: a reader's press on a file's tab shows its
        // editor, which holds that file's words, all of them. The
        // editor draws spaces as no-break spaces; only line ends are
        // left out of the comparison.
        const words = (text) => text.replace(/\u00a0/g, " ").split("\n").map((line) => line.trimEnd()).join("\n").trim();
        for (const [i, file] of example.files.entries()) {
          if (i > 0) await press(block.block.getByRole("tab", { name: file.name, exact: true }));
          const editor = block.block.getByRole("textbox", { name: `Edit ${file.name}`, exact: true });
          await expect(editor, `${file.name}'s editor is shown`).toBeVisible();
          await expect.poll(async () => words(await editor.innerText()), { message: `${file.name}'s editor holds its source` }).toBe(words(file.code));
        }
      });
    }
  });
}
