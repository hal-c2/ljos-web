// Derives every brand variant from src/assets/ljos.svg (the user's
// source, kept byte for byte; never edited by this script).
// DECISION (dark variant): the wordmark #211137 is 1.07:1 on the dark
// background, so it takes the light text colour #f4efe8 (14.3:1); the
// midnight violet panel #27143f is 1.02:1, below the 3:1 floor for a
// meaningful shape, so it is lifted to #7f63b8 (3.4:1, same hue
// family, overlap geometry untouched). Amber and yellow already pass
// on both themes and are unchanged.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, "src/assets");
const src = readFileSync(join(assets, "ljos.svg"), "utf8");
const DARK_TEXT = "#f4efe8", VIOLET_DARK = "#7f63b8", PAPER = "#fbf9f5";
const dark = (svg) => svg.replaceAll("#211137", DARK_TEXT).replaceAll("#27143f", VIOLET_DARK);

writeFileSync(join(assets, "ljos-dark.svg"), dark(src));

// The mark alone: the interlocking-panels group, cropped with padding.
const group = src.match(/<g[\s\S]*?<\/g>/)[0];
const markSvg = (body, attrs = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="12 12 212 206"${attrs}><title>Ljós</title>${body}</svg>\n`;
writeFileSync(join(assets, "ljos-mark.svg"), markSvg(group));
writeFileSync(join(assets, "ljos-mark-dark.svg"), markSvg(dark(group)));

// Favicon: the mark, swapping the violet with the OS colour scheme.
const faviconGroup = group.replace('fill="#27143f"', 'class="violet"');
writeFileSync(join(root, "public/favicon.svg"),
  markSvg(`<style>.violet{fill:#27143f}@media (prefers-color-scheme:dark){.violet{fill:${VIOLET_DARK}}}</style>${faviconGroup}`));

// Raster variants via rsvg-convert: touch icon (mark on paper) and
// the OG image (full logo centred on paper), as temporary composites.
const rsvg = (svgText, out, w, h) => {
  const tmp = join(root, ".brand-tmp.svg");
  writeFileSync(tmp, svgText);
  execSync(`rsvg-convert -w ${w} -h ${h} -o ${out} ${tmp}`);
  execSync(`rm ${tmp}`);
};
rsvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 236 236"><rect width="236" height="236" fill="${PAPER}"/>${group.replace('translate(24 24)', 'translate(36 39) scale(1.0) translate(-24 -24)')}</svg>`,
  join(root, "public/apple-touch-icon.png"), 180, 180);
const inner = src.replace(/^[\s\S]*?<\/desc>/, "").replace(/<\/svg>\s*$/, "");
rsvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="${PAPER}"/><g transform="translate(150 101) scale(1.7857)">${inner}</g></svg>`,
  join(root, "public/og-image.png"), 1200, 630);
console.log("brand variants written");
