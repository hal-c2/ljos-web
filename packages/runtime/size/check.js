// The page budget (docs/LJOS_WEB.md A8): a QtQuick page's JS and wasm, gzip,
// within 250 kB on either kernel, and the kernel's wasm within 30 kB. The
// compiler (`ljos-web/compiler`) is no part of such a page: it is a line of
// its own, what a page that compiles fetches the first time it does.
// usage: node size/check.js <solid dist> <wasm dist>
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const PAGE = 250_000;
const KERNEL = 30_000;
// DECISION: the compiler's wasm within 1,200 kB gzip and its JS within 5 kB.
// It is fetched once, on a page's first compile, and no frame waits on it;
// the budget is what it is (1,085 kB) with room for Qt's type table to
// grow, so that what would add to it (another parser, a table twice) is
// seen when it comes.
const COMPILER_WASM = 1_200_000;
const COMPILER_JS = 5_000;
const COMPILER = /ljos_web_compiler/;

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
  if (files.some((file) => COMPILER.test(file.name))) {
    failed = true;
    console.error(`the ${kernel} page has the compiler in it, which it never asked for`);
  }
  const wasm = files.filter((file) => file.name.endsWith(".wasm"));
  if (kernel === "wasm") {
    if (wasm.length !== 1) {
      failed = true;
      console.error(`the wasm page has ${wasm.length} wasm files, not the kernel's one`);
    } else over("kernel wasm", wasm[0].gzip, KERNEL);
  }
}
const compiler = join(import.meta.dirname, "../compiler");
const measured = (name) => {
  const bytes = readFileSync(join(compiler, name));
  return { name, raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length };
};
const wasm = measured("ljos_web_compiler.wasm");
console.log(`compiler ${wasm.name}: ${wasm.raw} B, ${wasm.gzip} B gzip`);
over("compiler wasm", wasm.gzip, COMPILER_WASM);
// As written, not minified: what a page's build makes of them is less.
const scripts = ["index.js", "modules.js", "link.js"].map(measured);
for (const script of scripts) console.log(`compiler ${script.name}: ${script.raw} B, ${script.gzip} B gzip`);
over("compiler js", scripts.reduce((sum, script) => sum + script.gzip, 0), COMPILER_JS);
process.exit(failed ? 1 : 0);
