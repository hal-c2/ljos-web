// `ljos-web/compiler`: QML compiled in the page, as `qmlc` compiles it, and
// run against the modules the page already has.
//
// Nothing of the compiler is fetched until the first compile: this module
// is a few hundred bytes, and the wasm and the linker come with a dynamic
// import. A page that never compiles pays for neither.
import { modules as runtime } from "./modules.js";

let loading;
const compiler = () => (loading ??= import("./link.js"));

// `modules`: what an import of compiled QML may be, by specifier
// (`"ljos-web/QtQuick"`), each a function giving the module or a promise of
// it. `base`: the address the project's files are at, from which a path a
// file names (`images/logo.png`) is taken.
export function createCompiler({ modules = runtime, base } = {}) {
  return {
    // `{ files, entry, aliases, types }` to `{ component, module, warnings }`,
    // or `{ diagnostics: [{ message, file, line, column, endLine, endColumn,
    // severity, code? }] }`, 1-based and spanning what `ljos check` spans
    // (docs/LJOS_WEB.md, "ERGO: compiler"). `types` names
    // the project's type dumps among `files`, whose types stand in as
    // `ljos run --types` makes them; otherwise every `ljostypes.json` there.
    compile: async (request) => (await compiler()).compile(request, { modules, base }),
    // The same, unlinked: each file's module as `qmlc` prints it.
    translate: async (request) => (await compiler()).translate(request, { modules }),
  };
}

export const { compile, translate } = createCompiler();
