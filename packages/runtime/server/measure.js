// A browser's answers to what a prerender asked of its text (server/dom.js:
// a canvas's measureText, a span's width, a font's ex and cap), for a
// site's build to give `buildSite` as `prerender.measure`: the renders'
// text is then set as a browser sets it, in the fonts the page shows,
// and a page does not lay its lines out again as it hydrates.
//
//   import { measureIn } from "ljos-web/measure";
//   const page = await browser.newPage();
//   await page.setContent(`<style>${fontFaces}</style>`);
//   prerender.measure = (keys) => measureIn(page, keys);
//
// The page is the site's own ground: its @font-face rules, so a font is
// the one a reader is sent. Any page with an `evaluate` (Playwright's,
// Puppeteer's) will do.

// How many questions go to the page at once.
const BATCH = 4000;

// Answers `keys` in `page`, in order: each an array (dom.js says of
// what), or null for a question it does not know how to ask.
export async function measureIn(page, keys) {
  const answers = [];
  for (let start = 0; start < keys.length; start += BATCH) answers.push(...(await page.evaluate(answer, keys.slice(start, start + BATCH))));
  return answers;
}

// Run in the page, so it holds all it needs.
async function answer(keys) {
  const SEP = "\u0000";
  const asked = keys.map((key) => key.split(SEP));
  // Every font asked about, loaded first for the letters asked of it: a
  // font shown with `font-display: swap` is measured as its fallback
  // until it has come, and a face for some letters (a `unicode-range`)
  // comes only for those.
  const letters = new Map();
  for (const [, font, ...rest] of asked) {
    if (font === undefined) continue;
    const text = rest.at(-1) ?? "";
    letters.set(font, (letters.get(font) ?? "") + text);
  }
  // A face that does not load fails the build: measured in its fallback,
  // the answers would be kept and every line laid out again as a page
  // hydrates. A font no browser can read (a SyntaxError) is answered
  // nothing, so the prerender guesses at it, as a canvas told it keeps
  // the font it had.
  const unread = new Set();
  await Promise.all(
    [...letters].map(([font, text]) =>
      document.fonts.load(font, [...new Set(text || "x")].join("")).catch((error) => {
        if (error?.name !== "SyntaxError") throw error;
        unread.add(font);
      }),
    ),
  );
  const context = document.createElement("canvas").getContext("2d");
  const span = document.createElement("span");
  span.style.cssText = "position:fixed;left:0;top:0;visibility:hidden;white-space:pre;pointer-events:none";
  const gauge = document.createElement("div");
  gauge.style.cssText = "position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;width:1ex;height:1cap";
  document.body.append(span, gauge);
  const answers = asked.map(([kind, ...rest]) => {
    if (unread.has(rest[0])) return null;
    if (kind === "c" && rest.length === 4) {
      const [font, kerning, caps, text] = rest;
      context.font = font;
      context.fontKerning = kerning;
      context.fontVariantCaps = caps;
      const box = context.measureText(text);
      return [box.width, box.actualBoundingBoxLeft, box.actualBoundingBoxRight, box.actualBoundingBoxAscent, box.actualBoundingBoxDescent, box.fontBoundingBoxAscent, box.fontBoundingBoxDescent];
    }
    if (kind === "s" && rest.length === 5) {
      const [font, kerning, features, variations, text] = rest;
      span.style.font = font;
      span.style.fontKerning = kerning;
      span.style.fontFeatureSettings = features;
      span.style.fontVariationSettings = variations;
      span.textContent = text;
      return [span.getBoundingClientRect().width];
    }
    if (kind === "u" && rest.length === 1) {
      gauge.style.font = rest[0];
      const box = gauge.getBoundingClientRect();
      return [box.width, box.height];
    }
    return null;
  });
  span.remove();
  gauge.remove();
  return answers;
}
