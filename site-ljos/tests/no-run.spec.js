// A framed demo that cannot run here has no Run. The page then asks no
// one to press it, says why in the bar Run would stand in, and is true
// of which demos that happens to: one that needs WebAssembly or WebGL 2
// where the browser has none. No framed demo needs WebGPU.
import { expect, test } from "@playwright/test";

const FRAMED = {
  "/": { "the watch": "webgl2" },
  "/demos/": { "the 3D demo": "webgl2", "the shader demo": "webgl2", "the field guide": "wasm", "the motion demo": "wasm" },
  "/demos/cockpit/": { "the cockpit": "webgl2 wasm" },
  "/demos/watch/": { "the watch": "webgl2" },
};
// What each page has next under a demo's frame, words in its text: a demo's
// own page says what it is above the frame, and how to use it below.
// The words that come after each demo's frame. On the front page the
// watch's own words stand before it (Elegant's Capability), so the
// next words after it are the section below's headline.
const FOLLOWS = {
  "/": { "the watch": "Built together" },
  "/demos/": { "the 3D demo": "A shader effect", "the shader demo": "A whole app", "the field guide": "Motion", "the motion demo": null },
  "/demos/cockpit/": { "the cockpit": "Its files" },
  "/demos/watch/": { "the watch": "Wear it with the pointer" },
};
// Wrapped text is laid out a line at a time, each ended by a line break, so
// words are apart by any space.
const PRESS_RUN = /\bpress(ing)?\s+(its\s+)?run\b/i;
const NOTE = /^A\s+picture\s+of\s+the\s+demo:\s+it\s+runs\s+in\s+a\s+browser\s+with\s+[^,]+,\s+which\s+this\s+one\s+does\s+not\s+offer\.$/;

const LACKS = {
  wasm: () => delete globalThis.WebAssembly,
  webgl2: () => delete globalThis.WebGL2RenderingContext,
  webgpu: () => delete Navigator.prototype.gpu,
};

async function opened(page, path, lacking) {
  await page.addInitScript(LACKS[lacking]);
  await page.goto(path);
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  const demos = Object.entries(FRAMED[path]);
  const stopped = demos.filter(([, needs]) => needs.split(" ").includes(lacking));
  await expect(page.getByText(NOTE).filter({ visible: true }), "a note for each demo that cannot run").toHaveCount(stopped.length);
  for (const [what, needs] of demos)
    await expect(page.getByRole("button", { name: `Run ${what}`, exact: true }), what).toHaveCount(needs.split(" ").includes(lacking) ? 0 : 1);
  return stopped;
}

for (const [path, demos] of Object.entries(FRAMED)) {
  for (const lacking of ["wasm", "webgl2"]) {
    if (!Object.values(demos).some((needs) => needs.split(" ").includes(lacking))) continue;

    test(`${path} without ${lacking} asks no one to press a Run that is not there`, async ({ page }) => {
      await opened(page, path, lacking);
      expect(await page.locator("#app").innerText()).not.toMatch(PRESS_RUN);
    });

    // 390 is a phone; at 320 the note takes a third line.
    for (const width of [1440, 390, 320]) {
      test(`${path} without ${lacking} at ${width} says why in the bar, off the picture`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const stopped = await opened(page, path, lacking);
        const notes = page.getByText(NOTE).filter({ visible: true });
        for (let at = 0; at < stopped.length; at++) {
          const note = notes.nth(at);
          await note.scrollIntoViewIfNeeded();
          const next = width === 320 ? FOLLOWS[path][stopped[at][0]] : null;
          // The frame is the nearest element that holds both note and picture.
          // The picture is in the middle of the demo's area, which may be
          // taller: the area ends as far below it as it begins above.
          const placed = () =>
            note.evaluate((text, next) => {
              let frame = text;
              while (!frame.querySelector("img")) frame = frame.parentElement;
              const picture = [...frame.querySelectorAll("img")].find((img) => img.checkVisibility());
              const [said, drawn, edge] = [text, picture, frame].map((element) => element.getBoundingClientRect());
              const areaBottom = drawn.bottom + (drawn.top - edge.top - 1);
              const seen = {
                belowArea: said.top >= areaBottom - 1,
                inBar: said.bottom <= edge.bottom && said.left >= edge.left && said.right <= edge.right,
              };
              if (next === null) return seen;
              const words = document.createTreeWalker(document.querySelector("#app"), NodeFilter.SHOW_TEXT);
              let follows = null;
              for (let node; !follows && (node = words.nextNode()); ) {
                const element = node.parentElement;
                if (node.data.replace(/\s+/g, " ").includes(next) && !frame.contains(element) && frame.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING && element.checkVisibility()) follows = element;
              }
              return { ...seen, followsBelow: !!follows && follows.getBoundingClientRect().top >= edge.bottom - 1 };
            }, next);
          await expect.poll(placed).toEqual({ belowArea: true, inBar: true, ...(next === null ? {} : { followsBelow: true }) });
        }
      });
    }
  }

  test(`${path} without WebGPU has every demo's Run`, async ({ page }) => {
    await opened(page, path, "webgpu");
  });

  test.describe("where no script runs", () => {
    test.use({ javaScriptEnabled: false });

    test(`${path} as written asks no one to press Run`, async ({ page }) => {
      await page.goto(path);
      expect(await page.locator("#app").innerText()).not.toMatch(PRESS_RUN);
    });
  });
}

for (const path of ["/", "/demos/"]) {
  test(`${path} says a demo keeps its picture only for what it needs`, async ({ page }) => {
    await page.goto(path);
    const said = (await page.locator("#app").innerText()).replace(/\s+/g, " ");
    expect(said).toContain("lacks the WebAssembly or WebGL 2 it needs");
    expect(said).not.toMatch(/lacks WebAssembly, WebGL 2 or WebGPU|where WebAssembly or WebGL 2 is unavailable/);
  });
}
