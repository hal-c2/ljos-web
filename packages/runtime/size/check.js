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
// DECISION: View3D's renderer within 1,400 kB gzip of wasm and 30 kB of its
// glue. Only a page that makes a View3D on it fetches them, once, and that is
// measured here: 1,309 kB and 21 kB at wgpu 30 with glTF and the snippets. The
// room is for the features the mapping has yet to reach, not another backend.
const VIEW3D_WASM = 1_400_000;
const VIEW3D_JS = 30_000;
const VIEW3D = /ljos_web_3d/;
// A class only the JavaScript renderer's View3D makes.
const VIEW3D_ITEM = "qq-view3d";

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
  if (files.some((file) => VIEW3D.test(file.name))) {
    failed = true;
    console.error(`the ${kernel} page has View3D's renderer in it, and no View3D`);
  }
  const assets = join(dist, "assets");
  if (files.some((file) => file.name.endsWith(".js") && readFileSync(join(assets, file.name), "utf8").includes(VIEW3D_ITEM))) {
    failed = true;
    console.error(`the ${kernel} page has QtQuick3D's JavaScript in it, and no View3D`);
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
const measured = (name, dir = compiler) => {
  const bytes = readFileSync(join(dir, name));
  return { name, raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length };
};
const wasm = measured("ljos_web_compiler.wasm");
console.log(`compiler ${wasm.name}: ${wasm.raw} B, ${wasm.gzip} B gzip`);
over("compiler wasm", wasm.gzip, COMPILER_WASM);
// As written, not minified: what a page's build makes of them is less.
const scripts = ["index.js", "modules.js", "link.js"].map(measured);
for (const script of scripts) console.log(`compiler ${script.name}: ${script.raw} B, ${script.gzip} B gzip`);
over("compiler js", scripts.reduce((sum, script) => sum + script.gzip, 0), COMPILER_JS);
const view3d = join(import.meta.dirname, "../QtQuick3D/wgpu");
for (const [what, name, budget] of [
  ["3D wasm", "ljos_web_3d_bg.wasm", VIEW3D_WASM],
  ["3D js", "ljos_web_3d.js", VIEW3D_JS],
]) {
  const file = measured(name, view3d);
  console.log(`${what} ${file.name}: ${file.raw} B, ${file.gzip} B gzip`);
  over(what, file.gzip, budget);
}
process.exit(failed ? 1 : 0);
