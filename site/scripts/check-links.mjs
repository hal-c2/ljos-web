// Every internal link in the built HTML must resolve to a built page.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const htmlFiles = [];
(function walk(d) { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith(".html")) htmlFiles.push(p); } })(dist);
let broken = 0, checked = 0;
for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  for (const m of html.matchAll(/href="(\/[^"#]*)/g)) {
    const route = decodeURIComponent(m[1]);
    if (route.startsWith("/_astro/") || /\.[a-z0-9]+$/i.test(route)) { if (!existsSync(join(dist, route))) { console.error(`broken asset ${route} in ${file}`); broken++; } continue; }
    checked++;
    if (!existsSync(join(dist, route, "index.html")) && !existsSync(join(dist, route))) { console.error(`broken link ${route} in ${file.replace(dist, "")}`); broken++; }
  }
}
console.log(`check-links: ${checked} internal links in ${htmlFiles.length} pages, ${broken} broken`);
process.exit(broken ? 1 : 0);
