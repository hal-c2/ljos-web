// What native types cost a page (docs/LJOS_WEB.md A22). A page with none pays
// nothing: its bundle names nothing of the faces and has no wasm but the
// kernel's. One with them pays the face runtime, once, and its own wasm.
// usage: node size/faces.js <page dist> <face page dist> <crate dir>…
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { gzipSync } from "node:zlib";

// DECISION: the budgets are what these are now with about a fifth of room, so
// that what would add to every application (replay in a type that doesn't
// paint, the text engine linked twice) is seen when it comes.
const FACE_RUNTIME = 2_500;
const CRATE_WASM = { "wasm-counter": 25_000, "wasm-gauge": 85_000 };
const CRATE_JS = { "wasm-counter": 5_000, "wasm-gauge": 9_000 };
const FACE_MARKS = ["ljos-face", "ljosPaintDraw", "__ljos_id"];

const zipped = (bytes) => gzipSync(bytes, { level: 9 }).length;

function assets(dist) {
  const dir = join(dist, "assets");
  return readdirSync(dir)
    .filter((name) => /\.(js|wasm)$/.test(name))
    .map((name) => ({ name, bytes: readFileSync(join(dir, name)) }));
}
const total = (files) => files.reduce((sum, file) => sum + zipped(file.bytes), 0);

let failed = false;
const over = (what, size, budget) => {
  const line = `${what}: ${size} B gzip (budget ${budget} B)`;
  if (size > budget) {
    failed = true;
    console.error(`over budget: ${line}`);
  } else console.log(line);
};

const [pageDist, faceDist, ...crates] = process.argv.slice(2);
const page = assets(pageDist);
for (const mark of FACE_MARKS) {
  if (page.some((file) => file.bytes.includes(mark))) {
    failed = true;
    console.error(`a page with no native types has ${mark} in it`);
  }
}
const own = page.filter((file) => file.name.endsWith(".wasm") && !file.name.includes("kernel"));
if (own.length > 0) {
  failed = true;
  console.error(`a page with no native types has wasm of its own: ${own.map((file) => file.name)}`);
}
console.log(`no native types: ${total(page)} B gzip, nothing of the faces in it`);

const faced = total(assets(faceDist));
over("face and visual runtime over that page", faced - total(page), FACE_RUNTIME);

for (const crate of crates) {
  const name = basename(crate);
  const pkg = join(crate, "pkg");
  const files = readdirSync(pkg);
  const wasm = files.find((file) => file.endsWith("_bg.wasm"));
  const glue = files.find((file) => file.endsWith(".js"));
  over(`${name} wasm`, zipped(readFileSync(join(pkg, wasm))), CRATE_WASM[name]);
  over(`${name} wasm-bindgen glue`, zipped(readFileSync(join(pkg, glue))), CRATE_JS[name]);
}
process.exit(failed ? 1 : 0);
