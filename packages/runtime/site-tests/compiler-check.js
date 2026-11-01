// Most of these tests build a site with `qmlc`. Without one they fail one by
// one, each saying it could not run it, some only that a refusal was another:
// this says the cause once, before any of them.
import { spawnSync } from "node:child_process";
import { qmlc } from "./bundle.js";

// Run as the tests run it, so that a bare name is looked for on the PATH.
// `--types` of no module does nothing and answers.
export const runnable = (compiler, env = process.env) => !spawnSync(compiler, ["--types"], { env }).error;

export default function compilerCheck() {
  if (!runnable(qmlc)) throw new Error(`no compiler at ${qmlc}: build it (\`cargo build -p ljos_web --bin qmlc\`), or say where it is with QMLC`);
}
