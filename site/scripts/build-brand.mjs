// Derives raster brand images from src/assets/*.svg. The party
// sources are copied byte for byte from ljos-ui f57084e3
// (docs/brand/, PR #274) and are never edited here. One logo serves
// both themes (user decision): violet #8260da measures 4.31:1 on
// the paper background and 3.62:1 on the dark one, so there are no
// dark variants. The favicon is the mark file unchanged; the touch
// icon keeps padding around the mark inside its square slot (the
// mark's own viewBox has none to spare at the edges that matter).
import { execSync } from "node:child_process";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, "src/assets");
const PAPER = "#fbf9f5";

cpSync(join(assets, "ljos-mark.svg"), join(root, "public/favicon.svg"));

const inner = (file) => readFileSync(join(assets, file), "utf8")
  .replace(/^[\s\S]*?<\/desc>/, "").replace(/<\/svg>\s*$/, "");
const rsvg = (svgText, out, w, h) => {
  const tmp = join(root, ".brand-tmp.svg");
  writeFileSync(tmp, svgText);
  execSync(`rsvg-convert -w ${w} -h ${h} -o ${out} ${tmp}`);
  execSync(`rm ${tmp}`);
};
// Touch icon: mark centred with ~12% padding on paper (mark viewBox
// is 0 -3 188 188, so shift it into a 236 square).
rsvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 236 236"><rect width="236" height="236" fill="${PAPER}"/><g transform="translate(24 27)">${inner("ljos-mark.svg")}</g></svg>`,
  join(root, "public/apple-touch-icon.png"), 180, 180);
// OG image: full logo centred on paper.
rsvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="${PAPER}"/><g transform="translate(179 115) scale(1.8)"><g transform="translate(16 20.2)">${inner("ljos.svg")}</g></g></svg>`,
  join(root, "public/og-image.png"), 1200, 630);
console.log("brand rasters written");
