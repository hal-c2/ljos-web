// The compiler's wasm and the linker that runs what it compiles.
//
// DECISION (linking): each compiled file becomes a module at a blob URL,
// with the specifiers of its imports rewritten. An import map cannot be
// added to once the page has loaded a module, and a registry the runtime
// gave would make compiled QML other code than `qmlc`'s. Files of a project
// import each other in cycles (a file may import itself), which blob URLs,
// each made from its finished text, cannot: so each file also gets a stand-in
// module that exports its names as bindings the linker sets once the file
// has run, and files import each other's stand-ins. The runtime's modules
// are each one module that re-exports what the page loaded, so compiled QML
// and the page's own share one instance of each.
const url = new URL("./ljos_web_compiler.wasm", import.meta.url);
const wasm = WebAssembly.compileStreaming(fetch(url));
let instance;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// The wasm's answer to `request`. A panic in it aborts and leaves its
// memory as it was then, so the next compile starts a new instance of the
// module fetched once.
async function ask(request) {
  instance ??= await WebAssembly.instantiate(await wasm);
  const { memory, alloc, free, compile, answer_len } = instance.exports;
  const bytes = encoder.encode(JSON.stringify(request));
  try {
    const at = alloc(bytes.length);
    new Uint8Array(memory.buffer, at, bytes.length).set(bytes);
    const answer = compile(at, bytes.length);
    const length = answer_len();
    const text = decoder.decode(new Uint8Array(memory.buffer, answer, length));
    free(answer, length);
    return JSON.parse(text);
  } catch (error) {
    instance = undefined;
    return { diagnostics: [{ file: request.entry, message: `the compiler failed: ${error.message}` }] };
  }
}

// The QML modules a page has that are not Qt's or the runtime's own by
// name: `ljos-web/Qt5Compat/GraphicalEffects` given makes that module one
// the QML may import.
const installed = (modules) =>
  Object.keys(modules)
    .filter((specifier) => specifier.startsWith("ljos-web/Q"))
    .map((specifier) => specifier.slice("ljos-web/".length).replaceAll("/", "."));

const asked = ({ files, entry, aliases = [] }, modules) => ({
  files: files instanceof Map ? Object.fromEntries(files) : files,
  entry,
  aliases,
  modules: Object.keys(modules),
  installed: installed(modules),
});

export async function translate(request, { modules }) {
  const answer = await ask(asked(request, modules));
  if (answer.diagnostics) return answer;
  return { modules: answer.modules.map(({ file, code }) => ({ file, code })), warnings: answer.warnings };
}

// What the bridges read: each module of the page's a compile used, by a
// number of its own.
const KEY = Symbol.for("ljos-web/compiler");
const loaded = (globalThis[KEY] ??= new Map());
const bridges = new WeakMap();
const blob = (code) => URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
const LINK = "ljos-web link";

// A module whose exports are those of `namespace`, which the page loaded.
function bridge(namespace) {
  let at = bridges.get(namespace);
  if (!at) {
    const number = loaded.size;
    loaded.set(number, namespace);
    const names = Object.keys(namespace);
    const lines = [`const $m = globalThis[Symbol.for("ljos-web/compiler")].get(${number});`];
    names.forEach((name, index) => lines.push(`const $${index} = $m[${JSON.stringify(name)}];`));
    lines.push(`export { ${names.map((name, index) => `$${index} as ${JSON.stringify(name)}`).join(", ")} };`);
    at = blob(lines.join("\n"));
    bridges.set(namespace, at);
  }
  return at;
}

// A file's stand-in: its exports, set by `LINK` once the file has run.
function standIn(exports) {
  const names = [...exports];
  const locals = names.map((_, index) => `$${index}`);
  return blob(
    [
      names.length > 0 ? `let ${locals.join(", ")};` : "",
      `export { ${[...names.map((name, index) => `${locals[index]} as ${JSON.stringify(name)}`), `$link as ${JSON.stringify(LINK)}`].join(", ")} };`,
      `function $link($n) { ${names.map((name, index) => `${locals[index]} = $n[${JSON.stringify(name)}];`).join(" ")} }`,
    ].join("\n"),
  );
}

export async function compile(request, { modules, base }) {
  const answer = await ask(asked(request, modules));
  if (answer.diagnostics) return answer;
  const root = new URL(base ?? document.baseURI, location.href);
  const files = new Map(answer.modules.map((module) => [module.file, module]));

  // The page's modules this compile needs, each loaded once.
  const specifiers = new Set(answer.modules.flatMap((module) => module.links.filter((link) => link.module).map((link) => link.module)));
  const namespaces = new Map();
  try {
    await Promise.all([...specifiers].map(async (specifier) => namespaces.set(specifier, await modules[specifier]())));
  } catch (error) {
    return { diagnostics: [{ message: `a module of the page's did not load: ${error.message}` }] };
  }

  const standIns = new Map(answer.modules.map((module) => [module.file, standIn(module.exports)]));
  const made = new Map();
  for (const module of answer.modules) {
    const address = new URL(module.file, root).href;
    const edits = [
      ...module.links.map(({ start, end, file, module }) => ({
        start,
        end,
        text: JSON.stringify(file !== undefined ? standIns.get(file) : bridge(namespaces.get(module))),
      })),
      // `import.meta.url` is the file's address, not the blob's, so a path
      // the file names is taken from where the file is.
      ...module.metas.map(([start, end]) => ({ start, end, text: `({ url: ${JSON.stringify(address)} })` })),
    ].sort((a, b) => b.start - a.start);
    let code = module.code;
    for (const { start, end, text } of edits) code = code.slice(0, start) + text + code.slice(end);
    made.set(module.file, blob(`${code}\n//# sourceURL=${address}\n`));
  }

  // Each file runs after those it imports, except around a cycle, and
  // its stand-in is set before the next runs: what a file does as it runs
  // (`Object.setPrototypeOf(Panel, Base)`) has the files before it.
  const order = [];
  const visited = new Set();
  const visit = (file) => {
    if (visited.has(file)) return;
    visited.add(file);
    for (const link of files.get(file).links) if (link.file !== undefined) visit(link.file);
    order.push(file);
  };
  visit(answer.modules[0].file);
  for (const module of answer.modules) visit(module.file);

  const namespacesOf = new Map();
  for (const file of order) {
    try {
      const namespace = await import(/* @vite-ignore */ made.get(file));
      (await import(/* @vite-ignore */ standIns.get(file)))[LINK](namespace);
      namespacesOf.set(file, namespace);
    } catch (error) {
      return { diagnostics: [{ file, message: error.message }] };
    } finally {
      URL.revokeObjectURL(made.get(file));
    }
  }
  const module = namespacesOf.get(answer.modules[0].file);
  return { component: module.default, module, warnings: answer.warnings };
}
