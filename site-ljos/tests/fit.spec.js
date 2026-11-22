// A demo lays itself out for the frame it is given: at a phone's width
// as at a desk's, everything it draws stands inside its frame, so a
// demo never draws over the page around it, and no two of its words
// are drawn over each other (a hint over a badge).
import { expect, test } from "@playwright/test";

const SIZES = [
  ["phone", { width: 390, height: 844 }],
  // A frame narrower than its picture is tall enough for the stacked
  // field guide, with the demos still side by side: the floors hold here.
  ["tablet", { width: 768, height: 1024 }],
  ["desktop", { width: 1280, height: 800 }],
];

// The framed demos on the demos page, by what their Run says.
const DEMOS = ["the 3D demo", "the shader demo", "the field guide", "the motion demo"];

// A demo's Run pressed, as a reader presses it: once it runs, Run is
// gone and the toolbar offers Pause.
async function runDemo(page, what) {
  const button = page.getByRole("button", { name: `Run ${what}` });
  await expect(button, `"Run ${what}" is on the page`).toBeAttached();
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await expect(button, `"Run ${what}" goes once the demo runs`).toBeHidden({ timeout: 30_000 });
  return page.getByRole("button", { name: `Pause ${what}` });
}

// What a running demo draws outside its frame, and which of its words
// are drawn over others, read from its frame's toolbar button. The
// frame is the button's first ancestor taller than the toolbar.
//
// A part is what is shown of an element or a run of words: what an
// ancestor inside the demo clips away (a list's rows past its end) is
// not shown, but a clip as wide as the frame is the edge of the demo's
// own area: a part that edge cuts is a part that does not fit, though
// it stays inside the frame by running under the toolbar. Each finding
// is said with the words or the element it is, so a failure says what
// did not fit and by how much.
function misfits(button) {
  let frame = button;
  while (frame && frame.getBoundingClientRect().height <= 100) frame = frame.parentElement;
  const edge = frame.getBoundingClientRect();
  const slack = 1;
  const round = (n) => Math.round(n);
  const say = (box) => `${round(box.left)},${round(box.top)} ${round(box.right - box.left)}x${round(box.bottom - box.top)}`;
  const named = (node) => {
    const words = (node.nodeType === Node.TEXT_NODE ? node.textContent : node.getAttribute("aria-label") ?? "").trim();
    return words ? JSON.stringify(words.slice(0, 48)) : `<${node.tagName.toLowerCase()}>`;
  };

  // What of the element up to the frame shows: null where an ancestor
  // hides it, else the box its clipping ancestors leave, and the edge it
  // must fit inside: the innermost frame-wide clip's, else the frame's.
  const shownWithin = (element, includeSelf) => {
    let clip = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
    let bound = null;
    for (let at = element; at && at !== frame; at = at.parentElement) {
      const style = getComputedStyle(at);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return null;
      if ((at !== element || includeSelf) && style.overflow !== "visible") {
        const box = at.getBoundingClientRect();
        const framesEdge = box.left <= edge.left + slack && box.right >= edge.right - slack;
        if (framesEdge) bound ??= box;
        else
          clip = {
            left: Math.max(clip.left, box.left),
            top: Math.max(clip.top, box.top),
            right: Math.min(clip.right, box.right),
            bottom: Math.min(clip.bottom, box.bottom),
          };
      }
    }
    return { clip, bound: bound ?? edge };
  };
  const cut = (box, clip) => {
    const part = {
      left: Math.max(box.left, clip.left),
      top: Math.max(box.top, clip.top),
      right: Math.min(box.right, clip.right),
      bottom: Math.min(box.bottom, clip.bottom),
    };
    return part.right - part.left > 0.5 && part.bottom - part.top > 0.5 ? part : null;
  };

  // The demo's own area: the frame's child as wide as the frame that
  // clips, above the toolbar. It fades in once the demo has drawn, and
  // until it is wholly shown, what is in it is not measured as it is.
  const area = [...frame.children].find((child) => {
    const box = child.getBoundingClientRect();
    return getComputedStyle(child).overflow !== "visible" && box.left <= edge.left + slack && box.right >= edge.right - slack && box.height < edge.height - slack;
  });
  const shown = area ? Number(getComputedStyle(area).opacity) : null;

  const outside = [];
  const words = [];
  const walker = document.createTreeWalker(frame, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeType === Node.TEXT_NODE;
    if (text && node.textContent.trim() === "") continue;
    const element = text ? node.parentElement : node;
    const shown = shownWithin(element, text);
    if (!shown) continue;
    const { clip, bound } = shown;
    let boxes;
    if (text) {
      const range = document.createRange();
      range.selectNodeContents(node);
      boxes = [...range.getClientRects()];
    } else boxes = [element.getBoundingClientRect()];
    for (const box of boxes) {
      const part = cut(box, clip);
      if (!part) continue;
      if (part.left < bound.left - slack || part.top < bound.top - slack || part.right > bound.right + slack || part.bottom > bound.bottom + slack)
        outside.push(`${named(node)} at ${say(part)}${bound === edge ? "" : ` (its area ${say(bound)})`}`);
      if (text) words.push({ node, part });
    }
  }
  const over = [];
  for (let i = 0; i < words.length; i++)
    for (let j = i + 1; j < words.length; j++) {
      const a = words[i].part;
      const b = words[j].part;
      if (words[i].node === words[j].node) continue;
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > slack && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > slack)
        over.push(`${named(words[i].node)} at ${say(a)} over ${named(words[j].node)} at ${say(b)}`);
    }
  return { frame: say(edge), shown, outside: [...new Set(outside)], over };
}

// Every demo is measured, and each one's misfits said, though one fails.
const softly = expect.configure({ soft: true });

async function fits(button) {
  const found = await button.evaluate(misfits);
  if (found.shown === null) return [`the frame ${found.frame} has no area of its own that clips the demo`];
  if (found.shown !== 1) return [`the demo is not wholly shown yet: its area's opacity is ${found.shown}`];
  return [...found.outside.map((part) => `outside the frame ${found.frame}: ${part}`), ...found.over.map((pair) => `drawn over: ${pair}`)];
}

// Motion's tallest state is its About card open, the state its frame's
// height floor is sized for, so it is measured open too. The card grows
// to its open height over a few frames; it is measured once it has
// stopped, as a cut-off card would only show once it has.
async function openAbout(page, size, pause) {
  const about = page.getByRole("button", { name: /^About this motion/ });
  await about.click();
  const settled = () =>
    about.evaluate(
      (card) =>
        new Promise((done) => {
          const height = card.getBoundingClientRect().height;
          requestAnimationFrame(() => requestAnimationFrame(() => done(height > 42 && card.getBoundingClientRect().height === height)));
        }),
    );
  await expect.poll(settled, { message: "the About card opens and stops growing" }).toBe(true);
  await softly.poll(() => fits(pause), { message: `the motion demo with its About card open at ${size} width stands inside its frame` }).toEqual([]);
}

// Where Motion's puck is drawn past its tray's edges, read from the
// tray's pointer area (which fills the tray): the puck is the round
// element in the tray. Given a time, the farthest past each edge it is
// drawn on any frame in that time, so a puck that springs back into the
// tray from past its edge is seen past it, not only once it has settled.
// Given a time, it takes its first reading at once, before the next
// frame, comes back, and keeps what it finds in the page (`sampled`):
// what the test does next, a resize, is sampled from where the puck
// stood before it, not only once the page has been reached.
function puckPast(area, ms = 0) {
  const tray = area.parentElement;
  const past = () => {
    const edge = tray.getBoundingClientRect();
    const puck = [...tray.querySelectorAll("*")].find((element) => {
      const width = element.getBoundingClientRect().width;
      return width > 20 && parseFloat(getComputedStyle(element).borderTopLeftRadius) >= width / 2 - 1;
    });
    const box = puck.getBoundingClientRect();
    return { left: edge.left - box.left, top: edge.top - box.top, right: box.right - edge.right, bottom: box.bottom - edge.bottom };
  };
  const worst = past();
  if (!ms) return worst;
  const end = performance.now() + ms;
  globalThis.sampling = new Promise((done) => {
    const frame = () => {
      const now = past();
      for (const side in worst) worst[side] = Math.max(worst[side], now[side]);
      if (performance.now() < end) requestAnimationFrame(frame);
      else done(worst);
    };
    requestAnimationFrame(frame);
  });
}

// On how many frames in a time Motion's puck moves, read from its
// tray's pointer area: a puck that springs on moves on many, one placed
// where it is going stands still. Like `puckPast` given a time, it
// takes its first reading at once, comes back, and keeps the count in
// the page.
function puckMoves(area, ms) {
  const tray = area.parentElement;
  const puck = [...tray.querySelectorAll("*")].find((element) => {
    const width = element.getBoundingClientRect().width;
    return width > 20 && parseFloat(getComputedStyle(element).borderTopLeftRadius) >= width / 2 - 1;
  });
  const at = () => puck.getBoundingClientRect().left - tray.getBoundingClientRect().left;
  let last = at();
  let moves = 0;
  const end = performance.now() + ms;
  globalThis.sampling = new Promise((done) => {
    const frame = () => {
      const now = at();
      if (Math.abs(now - last) > 0.5) moves++;
      last = now;
      if (performance.now() < end) requestAnimationFrame(frame);
      else done(moves);
    };
    requestAnimationFrame(frame);
  });
}

// What the sampler last started in the page found, once its time is up.
// It is read once: a sampler called without a time keeps nothing, and a
// read with no sampler started fails, rather than an older result being
// taken for this one.
const sampled = (page) =>
  page.evaluate(() => {
    const sampling = globalThis.sampling;
    globalThis.sampling = undefined;
    if (!sampling) throw new Error("no sampler given a time was started before this read");
    return sampling;
  });

// Motion running at a desk's width, its puck led into its tray's
// bottom-right corner and settled there.
async function puckInCorner(page) {
  await page.goto("/demos/");
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  const pause = await runDemo(page, "the motion demo");
  await expect.poll(() => fits(pause), { message: "the motion demo is shown and fits" }).toEqual([]);
  const tray = page.getByRole("group", { name: /^Spring tray/ });
  await tray.scrollIntoViewIfNeeded();
  const box = await tray.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height - 2, { steps: 4 });
  await page.mouse.up();
  // How far the puck stands from the tray's right and bottom edges.
  const corner = async () => {
    const past = await tray.evaluate(puckPast);
    const off = (by) => (Math.abs(by) <= 1 ? 0 : Math.round(-by));
    return { right: off(past.right), bottom: off(past.bottom) };
  };
  await expect.poll(corner, { message: "the puck springs into the tray's bottom-right corner" }).toEqual({ right: 0, bottom: 0 });
  return { tray, box };
}

// The window narrowed a little (1280 to 1040), the demo still on screen
// and running: where the puck is drawn past its tray on any frame as the
// tray narrows and for a second after.
async function narrowedPast(page, tray) {
  await tray.evaluate(puckPast, 1500);
  await page.setViewportSize({ width: 1040, height: 800 });
  const past = await sampled(page);
  const shown = await tray.boundingBox();
  expect(shown.y + shown.height > 0 && shown.y < 800, `the tray is still on screen, so the demo runs (${JSON.stringify(shown)})`).toBe(true);
  return Object.entries(past)
    .filter(([, by]) => by > 1)
    .map(([side, by]) => `drawn past the tray's ${side} edge by ${Math.round(by)}`);
}

// A puck the reader led stays in its tray when the frame narrows: a
// turned phone, a narrowed window.
test.describe("when the frame narrows", () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: "no-preference" });

  test("Motion's puck stays in its tray", async ({ page }) => {
    const { tray } = await puckInCorner(page);
    expect(await narrowedPast(page, tray), "the puck in the corner is never drawn past the tray as it narrows").toEqual([]);
    // Then past Motion's compact width, where the tray is shorter too.
    await page.setViewportSize({ width: 390, height: 844 });
    const outside = async () =>
      Object.entries(await tray.evaluate(puckPast))
        .filter(([, by]) => by > 1)
        .map(([side, by]) => `past the tray's ${side} edge by ${Math.round(by)}`);
    await expect.poll(outside, { message: "the puck is inside the narrowed tray" }).toEqual([]);
  });

  // Led from the corner toward a point the narrowed tray still holds
  // (the tray narrows by 64 px, the puck is 54 across), so the clamp
  // leaves its target as it was, and the tray narrows while it is still
  // on its way there: it is still drawn inside.
  test("Motion's puck on its way stays in its tray", async ({ page }) => {
    const { tray, box } = await puckInCorner(page);
    await page.mouse.move(box.x + box.width - 2, box.y + box.height - 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 100, box.y + box.height / 2, { steps: 2 });
    await page.mouse.up();
    expect(await narrowedPast(page, tray), "the puck on its way is never drawn past the tray as it narrows").toEqual([]);
  });

  // Led from the corner toward the tray's middle with the page's clock
  // held from the lead on: the spring then moves only as the test steps
  // it. On the machine's clock the test's own round trips could outlast
  // the spring, and find a settled puck to sample.
  const ledWithClockHeld = async (page) => {
    await page.clock.install();
    const { tray, box } = await puckInCorner(page);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await page.mouse.move(box.x + box.width - 2, box.y + box.height - 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 2 });
    await page.mouse.up();
    return { tray, box };
  };
  const narrowed = async (page, tray, box) => {
    await page.setViewportSize({ width: 1060, height: 800 });
    const width = () => tray.evaluate((area) => area.parentElement.getBoundingClientRect().width);
    // The page lays out on its next frame, up to 16 ms of held time
    // away. It's stepped there by one, so the puck has gone no further.
    await expect
      .poll(async () => {
        await page.clock.runFor(1);
        return width();
      }, { message: "the tray narrows", intervals: [0], timeout: 20_000 })
      .toBeLessThan(box.width - 60);
    expect(await width(), "the narrowed tray still holds the target").toBeGreaterThan(box.width / 2 + 60);
  };
  const stepped = async (page, tray) => {
    const rights = [];
    for (let frame = 0; frame < 30; frame++) {
      await page.clock.runFor(16);
      rights.push((await tray.evaluate(puckPast)).right);
    }
    return rights;
  };

  // The tray narrowed once the puck is well inside it: the clamp leaves
  // its target as it was, so it springs on there rather than jumping (a
  // window a little narrower), also where the narrower tray's edge has
  // come in past it, as a page wider than the window's does.
  test("Motion's puck springs on when the tray narrows a little", async ({ page }) => {
    const { tray, box } = await ledWithClockHeld(page);
    await expect
      .poll(async () => {
        await page.clock.runFor(16);
        return (await tray.evaluate(puckPast)).right < -60;
      }, { message: "the puck is on its way, well inside the tray", intervals: [0] })
      .toBe(true);
    await tray.evaluate(puckMoves, 500);
    await narrowed(page, tray, box);
    await page.clock.runFor(600);
    expect(await sampled(page), "the frames the puck moves on as the tray narrows a little").toBeGreaterThan(5);
  });

  // The same lead, and the tray narrowed before the puck has come as far
  // in as it narrows by, so that it is past the new edge: it springs on
  // from that edge, and is drawn past it on no frame.
  test("Motion's puck past the narrowed edge springs on to a target the tray holds", async ({ page }) => {
    const { tray, box } = await ledWithClockHeld(page);
    await narrowed(page, tray, box);
    const rights = await stepped(page, tray);
    const moves = rights.filter((right, at) => at > 0 && Math.abs(right - rights[at - 1]) > 0.5).length;
    expect(moves, `the frames the puck moves on, from right ${rights.map(Math.round).join(" ")}`).toBeGreaterThan(5);
    expect(Math.max(...rights), "how far it is drawn past the narrowed tray's edge").toBeLessThanOrEqual(1);
  });

  test("Motion's puck led again from past the narrowed edge stays in its tray", async ({ page }) => {
    const { tray, box } = await ledWithClockHeld(page);
    await narrowed(page, tray, box);
    const now = await tray.boundingBox();
    await page.mouse.click(now.x + now.width / 3, now.y + now.height / 2);
    const rights = await stepped(page, tray);
    expect(Math.max(...rights), `how far it is drawn past the edge, from right ${rights.map(Math.round).join(" ")}`).toBeLessThanOrEqual(1);
  });
});

for (const [size, viewport] of SIZES) {
  test.describe(`at ${size} width`, () => {
    test.use({ viewport, reducedMotion: "no-preference" });

    // Each demo is paused once it is measured, as a reader moving on
    // leaves it: one drawing in software takes the page's every frame.
    test("every framed demo on the demos page stays inside its frame", async ({ page }) => {
      await page.goto("/demos/");
      await page.waitForSelector('#app[data-ljos-hydrated="true"]');
      for (const what of DEMOS) {
        const pause = await runDemo(page, what);
        await softly.poll(() => fits(pause), { message: `${what} at ${size} width stands inside its frame` }).toEqual([]);
        if (what === "the motion demo") await openAbout(page, size, pause);
        await pause.click();
        await expect(page.getByRole("button", { name: `Resume ${what}` })).toBeVisible();
      }
    });

    test("the landing's showcase stays inside its frame", async ({ page }) => {
      await page.goto("/");
      await page.waitForSelector('#app[data-ljos-hydrated="true"]');
      const pause = await runDemo(page, "the 3D demo");
      await expect.poll(() => fits(pause), { message: `the showcase at ${size} width stands inside its frame` }).toEqual([]);
    });
  });
}
