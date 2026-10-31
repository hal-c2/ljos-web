// Most of these tests build a site with `qmlc`. Without one they fail one by
// one, each saying it could not run it, some only that a refusal was another:
// this says the cause once, before any of them.
import { accessSync, constants } from "node:fs";
import { qmlc } from "./bundle.js";

export default function compilerCheck() {
  try {
    accessSync(qmlc, constants.X_OK);
  } catch {
    throw new Error(`no compiler at ${qmlc}: build it (\`cargo build -p ljos_web --bin qmlc\`), or say where it is with QMLC`);
  }
}
