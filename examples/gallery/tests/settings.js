// Where the report reads from and writes to. Each has an environment
// variable so that the harness can be run on other examples (its own test
// does).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compilerAt } from "ljos-web/vite";

const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, "../../..");

export const qmlc = compilerAt(process.env.QMLC ?? join(repository, "target/debug/qmlc"));
// Vite's server runs from the gallery, not from where it was named from.
if (process.env.QMLC) process.env.QMLC = qmlc;
export const port = Number(process.env.GALLERY_PORT ?? 4174);
// What says which modules of Qt the runtime has.
export const runtimePackage = join(repository, "packages/runtime/package.json");
// Pictures and the report, for looking at: not checked in.
export const reportDirectory = resolve(process.env.GALLERY_REPORT ?? join(here, "../report"));
// The ratchet: examples that must keep rendering.
export const expectedFile = resolve(process.env.GALLERY_EXPECTED ?? join(repository, "corpus/expected.json"));

export const readExpected = () => (existsSync(expectedFile) ? JSON.parse(readFileSync(expectedFile, "utf8")) : { examples: {} });
