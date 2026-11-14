// The same pages with WebAssembly and without. Everything a page shows
// is HTML rendered through Solid, which needs no WebAssembly; only the
// compiler behind a live code block is wasm, and there is no other. So
// each page is opened as a browser that runs WebAssembly has it, and
// again with `globalThis.WebAssembly` gone (Safari's Lockdown Mode, a
// policy without 'wasm-unsafe-eval'):
//
// - a page without a live block is the same page: the same words, the
//   same elements in the same places, the same picture;
// - a page with live blocks is the same page outside them, and each
//   block is the build's picture of its example on both; with
//   WebAssembly it runs once the reader reaches for it (payload.spec),
//   and without, it says live editing needs WebAssembly, and nothing
//   wasm is fetched.
//
// Time is held on both, so what moves has moved as far.
import { expect, test } from "@playwright/test";

const HELD_AT = Date.UTC(2026, 0, 1);
// Pages without a live block, then pages with them.
const PAGES = ["/", "/start/install/", "/rust/overview/", "/demos/", "/start/", "/start/first-app/", "/controls/buttons-and-toggles/", "/ui/animation/", "/data/models/"];
// The pages that hold the Pantry, whose own shell is compiled live too:
// without WebAssembly its fallback shell runs and says why, once.
const PANTRY = new Set(["/", "/demos/"]);
// `ljos-web/wasm-check.js`'s NEEDS_WASM, as a reader reads it.
const NEEDS_WASM = /^Live editing needs WebAssembly/;
const PICTURE = 'img[alt="What this example draws"]';

async function opened(browser, path, wasm) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, colorScheme: "light" });
  await context.clock.pauseAt(HELD_AT);
  if (!wasm) await context.addInitScript(() => delete globalThis.WebAssembly);
  const page = await context.newPage();
  const fetched = [];
  page.on("request", (request) => fetched.push(request.url()));
  await page.goto(path);
  await expect
    .poll(
      async () => {
        await page.clock.fastForward(50);
        return page.locator('#app[data-ljos-hydrated="true"]').count();
      },
      { timeout: 30_000 },
    )
    .toBe(1);
  // As long on both, past any debounce and the first second of motion.
  for (let i = 0; i < 40; i++) await page.clock.fastForward(50);
  // A live block compiles, and says what its example lacks, in real
  // time after a held-clock debounce: move both until the page has said
  // nothing new for half a second.
  let [said, still] = ["", 0];
  for (let i = 0; i < 200 && still < 10; i++) {
    await page.clock.fastForward(50);
    await page.waitForTimeout(50);
    const now = await page.evaluate(() => document.body.innerText);
    [said, still] = [now, now === said ? still + 1 : 0];
  }
  expect(still, `${path} ${wasm ? "with" : "without"} WebAssembly stopped changing`).toBeGreaterThanOrEqual(10);
  await page.evaluate(() => document.fonts.ready);
  return { context, page, fetched };
}

// The page as a reader has it, less its live blocks' stages and what
// they say (the stage is the picture's box; what it says is the line
// after it): its words, and its elements with what they look like.
// `placed` keeps where each element is and how big: on a page with
// live blocks a block's note moves what is below it and grows what
// holds it, so there the picture above the first block says it.
const read = (page, placed) =>
  page.evaluate(
    ([picture, placed]) => {
      const skipped = new Set();
      for (const img of document.querySelectorAll(picture)) {
        const stage = img.parentElement.parentElement.parentElement;
        skipped.add(stage);
        if (stage.nextElementSibling) skipped.add(stage.nextElementSibling);
      }
      const words = [];
      const out = [];
      const walk = (node, depth) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent.trim();
          if (text) {
            out.push(`${"  ".repeat(depth)}"${text}"`);
            words.push(text);
          }
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE || skipped.has(node)) return;
        if (node.tagName === "SCRIPT" || node.tagName === "STYLE") return;
        const style = getComputedStyle(node);
        // What no reader sees, and the note only one side has (what
        // holds it is hidden on the other).
        if (style.display === "none") return;
        if (/^Live editing needs WebAssembly[^.]*\.$/.test(node.innerText.replace(/\s+/g, " ").trim())) return;
        const box = node.getBoundingClientRect();
        const at = placed ? ` ${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}` : "";
        out.push(`${"  ".repeat(depth)}<${node.tagName.toLowerCase()} ${style.display} ${style.visibility} ${style.color} ${style.backgroundColor}${at}>`);
        for (const child of node.childNodes) walk(child, depth + 1);
      };
      walk(document.body, 0);
      return { words, tree: out.join("\n") };
    },
    [PICTURE, placed],
  );

// Each live block: whether the build's picture shows, and what the
// block says under its stage.
const blocks = (page) =>
  page.locator(PICTURE).evaluateAll((imgs) =>
    imgs.map((img) => {
      const stage = img.parentElement.parentElement.parentElement;
      return { picture: img.checkVisibility(), said: stage.nextElementSibling?.innerText.trim() ?? "" };
    }),
  );

// Where the first live block's stage or the first note starts, in the
// page; the page's height where there is neither.
const firstBlockAt = (page) =>
  page.evaluate((picture) => {
    const tops = [document.documentElement.scrollHeight];
    const img = document.querySelector(picture);
    if (img) tops.push(img.parentElement.parentElement.parentElement.getBoundingClientRect().top + scrollY);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode())
      if (/^Live editing needs WebAssembly/.test(node.textContent.trim())) {
        tops.push(node.parentElement.getBoundingClientRect().top + scrollY);
        break;
      }
    return Math.floor(Math.min(...tops));
  }, PICTURE);

const shot = (page, height) =>
  page.screenshot({ animations: "disabled", caret: "hide", fullPage: true, clip: { x: 0, y: 0, width: 1280, height } });

// How many pixels of two pictures of the same size differ, read by the
// browser so no image library is needed here.
const differing = (page, a, b) =>
  page.evaluate(
    async ([a, b]) => {
      const pixels = async (base64) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d");
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height);
      };
      const [one, two] = [await pixels(a), await pixels(b)];
      if (one.width !== two.width || one.height !== two.height) return { size: [one.width, one.height, two.width, two.height] };
      let count = 0;
      for (let i = 0; i < one.data.length; i += 4)
        if (one.data[i] !== two.data[i] || one.data[i + 1] !== two.data[i + 1] || one.data[i + 2] !== two.data[i + 2]) count++;
      return { count };
    },
    [a.toString("base64"), b.toString("base64")],
  );

for (const path of PAGES) {
  test(`${path} without WebAssembly is the page with it, but for what its live blocks can do`, async ({ browser }) => {
    const on = await opened(browser, path, true);
    const off = await opened(browser, path, false);
    try {
      expect(await off.page.evaluate(() => typeof WebAssembly), "the page runs without WebAssembly").toBe("undefined");
      expect(off.fetched.filter((url) => /\.wasm(\?|$)/.test(url)), "without it the page fetches no wasm").toEqual([]);

      const [withIt, without] = [await blocks(on.page), await blocks(off.page)];
      expect(without.length, "the same live blocks").toBe(withIt.length);
      // A page whose blocks or demo say live editing needs WebAssembly
      // is moved below the note; with it, none says so.
      const notes = async (page) => (await page.evaluate(() => document.body.innerText)).split("\n").filter((line) => NEEDS_WASM.test(line.trim())).length;
      expect(await notes(on.page), "with WebAssembly nothing says it is needed").toBe(0);
      expect(await notes(off.page), "without it each block, and the Pantry, says it is needed").toBe(without.length + (PANTRY.has(path) ? 1 : 0));
      const live = withIt.length > 0 || PANTRY.has(path);

      // Outside the blocks: the same words, the same elements; placed
      // the same wherever nothing above them is a block.
      const [readOn, readOff] = [await read(on.page, !live), await read(off.page, !live)];
      expect(readOff.words, "the same words").toEqual(readOn.words);
      expect(readOff.tree, "the same elements").toBe(readOn.tree);
      const above = Math.min(await firstBlockAt(on.page), await firstBlockAt(off.page));
      expect(await differing(on.page, await shot(on.page, above), await shot(off.page, above)), "the same picture").toEqual({ count: 0 });

      if (live) {
        // Both are the build's picture until the reader reaches for a
        // block (payload.spec runs one on its first edit): the compiler
        // is not fetched even where it could run.
        expect(on.fetched.filter((url) => /ljos_web_compiler/.test(url)), "with WebAssembly the compiler waits for an edit").toEqual([]);
        for (const [i, block] of withIt.entries()) {
          expect(block.picture, `block ${i} is the build's picture until it is reached for`).toBe(true);
          expect(block.said, `block ${i} has what it needs`).not.toMatch(NEEDS_WASM);
        }
        for (const [i, block] of without.entries()) {
          expect(block.picture, `block ${i} keeps the build's picture`).toBe(true);
          expect(block.said, `block ${i} says why it is not live`).toMatch(NEEDS_WASM);
        }
      }
    } finally {
      await on.context.close();
      await off.context.close();
    }
  });
}
