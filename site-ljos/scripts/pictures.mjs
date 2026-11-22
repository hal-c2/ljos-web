// An example's two pictures (one for each scheme), and what the build
// reads off them: whether the dark page needs its own, and whether
// they show nothing at all. Apart from build.mjs, which builds the
// site as it is imported, so a spec can hold the rules to a browser.
import { createHash } from "node:crypto";

// Draws an example on each scheme's paper (an example with no dark
// render is its one render on both) and says whether it is blank:
// paper and nothing else on both. One alone can't say, since white
// content on light paper is within a step of the paper.
export async function drawPictures(page, { html, htmlDark, width, height, papers, stages, to = {} }) {
  await page.setViewportSize({ width, height });
  let blank = true;
  for (const [scheme, drawn] of Object.entries({ light: html, dark: htmlDark ?? html })) {
    await page.setContent(`${stages[scheme]}<div id="app" style="position:relative;width:${width}px;height:${height}px">${drawn}</div>`);
    const png = await page.screenshot({ path: to[scheme], clip: { x: 0, y: 0, width, height } });
    blank &&= await page.evaluate(paperOnly, { png: png.toString("base64"), paper: papers[scheme] });
  }
  return { blank };
}

// Told by the pictures, not the markup: the same markup is another
// picture on the other paper wherever the paper shows through it.
export const shipsDark = ({ light, dark }) => !light.equals(dark);

// A verdict is kept by its light picture (named for the render, the
// browser and both papers) and by the check that gave it, so another
// tolerance or rule judges again.
export const verdictKey = (picture, check = paperOnly) =>
  `${picture}:${createHash("sha256").update(String(check)).digest("hex").slice(0, 12)}`;

// Run in the drawing page: whether a picture (a PNG, as base64) is
// the paper and nothing else. Its pixels are the browser's to decode;
// within a few steps of the paper is paper still (the edge of a
// shadow the app's root casts on nothing).
export async function paperOnly({ png, paper }) {
  const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0);
  const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
  const ground = [1, 3, 5].map((at) => parseInt(paper.slice(at, at + 2), 16));
  for (let i = 0; i < data.length; i += 4)
    if (Math.abs(data[i] - ground[0]) > 24 || Math.abs(data[i + 1] - ground[1]) > 24 || Math.abs(data[i + 2] - ground[2]) > 24) return false;
  return true;
}
