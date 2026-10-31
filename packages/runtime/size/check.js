// The page budget (docs/LJOS_WEB.md A8): a QtQuick page's JS and wasm, gzip,
// within 250 kB on either kernel, and the kernel's wasm within 30 kB.
// usage: node size/check.js <solid dist> <wasm dist>
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const PAGE = 250_000;
const KERNEL = 30_000;

function sizes(dist) {
  const dir = join(dist, "assets");
  return readdirSync(dir)
    .filter((name) => /\.(js|wasm)$/.test(name))
    .map((name) => {
      const bytes = readFileSync(join(dir, name));
      return { name, raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length };
    });
}

let failed = false;
const over = (what, size, budget) => {
  const line = `${what}: ${size} B gzip (budget ${budget} B)`;
  if (size > budget) {
    failed = true;
    console.error(`over budget: ${line}`);
  } else console.log(line);
};
for (const [kernel, dist] of [["solid", process.argv[2]], ["wasm", process.argv[3]]]) {
  const files = sizes(dist);
  for (const file of files) console.log(`${kernel} ${file.name}: ${file.raw} B, ${file.gzip} B gzip`);
  over(`${kernel} page`, files.reduce((sum, file) => sum + file.gzip, 0), PAGE);
  const wasm = files.filter((file) => file.name.endsWith(".wasm"));
  if (kernel === "wasm") {
    if (wasm.length !== 1) {
      failed = true;
      console.error(`the wasm page has ${wasm.length} wasm files, not the kernel's one`);
    } else over("kernel wasm", wasm[0].gzip, KERNEL);
  }
}
process.exit(failed ? 1 : 0);
