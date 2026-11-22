// An example's two pictures (one for each scheme), and what the build
// reads off them: whether the dark page needs its own, and whether
// they show nothing at all. Apart from build.mjs, which builds the
// site as it is imported, so a spec can hold the rules to a browser.
import { createHash } from "node:crypto";

// Draws an example on each scheme's paper (an example with no dark
// render is its one render on both) and says of each whether it is
// blank: the picture the empty stage makes, to the byte. Not paper
// within a tolerance: pale content is content.
export async function drawPictures(page, { html, htmlDark, width, height, stages, to = {} }) {
  await page.setViewportSize({ width, height });
  const shot = async (stage, drawn, path) => {
    await page.setContent(`${stage}<div id="app" style="position:relative;width:${width}px;height:${height}px">${drawn}</div>`);
    return page.screenshot({ path, clip: { x: 0, y: 0, width, height } });
  };
  const blank = {};
  for (const [scheme, drawn] of Object.entries({ light: html, dark: htmlDark ?? html })) {
    const empty = await shot(stages[scheme], "");
    blank[scheme] = (await shot(stages[scheme], drawn, to[scheme])).equals(empty);
  }
  return { blank };
}

// Told by the pictures, not the markup: the same markup is another
// picture on the other paper wherever the paper shows through it.
export const shipsDark = ({ light, dark }) => !light.equals(dark);

// The verdicts are kept by the light picture (named for the render, the
// browser and both papers) and by the check that gave them, so another
// rule judges again.
export const verdictKey = (picture, check = drawPictures) =>
  `${picture}:${createHash("sha256").update(String(check)).digest("hex").slice(0, 12)}`;
