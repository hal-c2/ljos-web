// The fence contract of a live code block, shared by the build and by
// the page: which fences are runnable, and how their texts become the
// files of one small project. Nothing here touches the DOM or the disk,
// so what assembles an example at build time is what reassembles it in
// the page after an edit.
//
// The contract (the docs write it the same way):
//
//   ```qml                      a whole app, one file
//   ```qml harness=<name>       a snippet, spliced into the harness at
//                               its one `//! snippet` line
//   ```qml before               the old half of a before/after
//   ```qml file=<F> group=<id>  one file of a multi-file example;
//   ```ts  file=<F> group=<id>  scripts join the same way
//
// Exempt tags (never runnable, shown as plain code): sh, rust, toml,
// json, text, xml, gherkin, javascript, diff. A bare fence or any other
// tag is unknown, not quietly plain.

export const EXEMPT = new Set(["sh", "rust", "toml", "json", "text", "xml", "gherkin", "javascript", "diff"]);

// Languages whose blocks can be files of an example. A script is only
// part of an example with file=/group=; on its own it is shown plain.
const SCRIPTS = new Set(["ts", "typescript", "js", "mjs"]);

const KEYS = new Set(["harness", "file", "group"]);

// `qml harness=window` to `{ lang: "qml", harness: "window" }`. Only
// what the info string says is in the answer.
export function parseInfo(info) {
  const [lang = "", ...rest] = String(info ?? "").trim().split(/\s+/).filter(Boolean);
  const parsed = { lang: lang.toLowerCase() };
  for (const token of rest) {
    if (token === "before") parsed.before = true;
    else if (/^[\w-]+=[^\s]+$/.test(token)) {
      const at = token.indexOf("=");
      const key = token.slice(0, at);
      if (KEYS.has(key)) parsed[key] = token.slice(at + 1);
    }
  }
  return parsed;
}

// `harness=window` (an mdast `meta`, whose `lang` came apart) parsed as
// the rest of the info string it was taken from.
export function parseMeta(lang, meta) {
  return parseInfo([lang ?? "", meta ?? ""].join(" ").trim());
}

// The fenced blocks of a Markdown text, in order, each with its parsed
// info string, its code (ending in one newline) and the 1-based line of
// its fence. An unclosed fence runs to the end of the text. The code
// is as a Markdown reader gives it: the opening fence's own indent —
// a fence inside a list item carries its container's — comes off each
// line, so this and an mdast parse of the same page give the same
// code, and with it the same example and the same hash.
export function extractBlocks(markdown) {
  const blocks = [];
  const lines = String(markdown).split("\n");
  let open = null;
  const close = () => {
    const indent = new RegExp(`^ {0,${open.indent}}`);
    const code = open.code.map((line) => line.replace(indent, "")).join("\n");
    blocks.push({ ...parseInfo(open.info), code: ended(code), line: open.line });
    open = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const fence = /^( *)(`{3,}|~{3,})(.*)$/.exec(lines[i]);
    if (!open) {
      if (fence) open = { mark: fence[2], indent: fence[1].length, info: fence[3].trim(), line: i + 1, code: [] };
    } else if (fence && fence[2][0] === open.mark[0] && fence[2].length >= open.mark.length && fence[3].trim() === "") close();
    else open.code.push(lines[i]);
  }
  if (open) close();
  return blocks;
}

const ended = (code) => (code.endsWith("\n") ? code : `${code}\n`);

// A block a reader may edit and run. `tagged` says the fence claims it
// (a harness, a file, a group, a before): a build holds a claimed block
// to compiling, where an unclaimed one may be a legacy snippet a docs
// tree has not tagged yet.
const runnable = (block) =>
  block.lang === "qml" || (SCRIPTS.has(block.lang) && Boolean(block.file || block.group));
export const tagged = (block) => Boolean(block.harness || block.file || block.group || block.before);

// The snippet in place of the harness's one `//! snippet` line, each of
// its lines indented as that line is. Anything but exactly one marker
// is refused: half a splice would run code nobody wrote.
export function spliceHarness(template, snippet) {
  const lines = String(template).split("\n");
  const at = lines.flatMap((line, i) => (line.trim() === "//! snippet" ? [i] : []));
  if (at.length !== 1)
    throw new Error(`a harness needs exactly one "//! snippet" line, this one has ${at.length}`);
  const indent = /^\s*/.exec(lines[at[0]])[0];
  const inPlace = String(snippet)
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => (line === "" ? line : indent + line));
  lines.splice(at[0], 1, ...inPlace);
  return lines.join("\n");
}

// Blocks become examples, plain blocks, or unknown ones. An example is
// `{ display: [{ name, code, lang }], entry, before, group?, harness?,
// harnessTemplate?, blocks }`: `display` is what an editor shows, in
// the order written; `exampleFiles` says what compiles; `blocks` are
// the fences it was made of, for a renderer placing it back into a
// document. Blocks that share a `group=` are one example however far
// apart they sit: docs introduce an example's files one by one, in
// prose, and they are still one running example.
export function assemble(blocks, { harnesses = {} } = {}) {
  const examples = [];
  const plain = [];
  const unknown = [];
  const groups = new Map();
  for (const block of blocks) {
    if (EXEMPT.has(block.lang) || (SCRIPTS.has(block.lang) && !runnable(block))) plain.push(block);
    else if (!runnable(block)) unknown.push(block);
    else if (block.group) {
      if (!groups.has(block.group)) {
        const example = { display: [], entry: "Main.qml", before: false, group: block.group, blocks: [] };
        groups.set(block.group, example);
        examples.push(example);
      }
      add(groups.get(block.group), block, harnesses);
    } else {
      const example = { display: [], entry: "Main.qml", before: false, blocks: [] };
      add(example, block, harnesses);
      examples.push(example);
    }
  }
  for (const example of examples) finish(example);
  return { examples, plain, unknown };
}

function add(example, block, harnesses) {
  if (block.lang !== "qml" && !block.file)
    throw new Error(`line ${block.line}: a ${block.lang} block of an example needs file= to say which file it is`);
  const name = block.file ?? "Main.qml";
  // A file of an example stays in its project: a build writes these
  // names under a directory of its own, on a reader's machine and on
  // a build's alike.
  if (name.startsWith("/") || name.split("/").includes(".."))
    throw new Error(`line ${block.line}: file=${name} is not a name inside its example`);
  if (example.display.some((file) => file.name === name))
    throw new Error(`line ${block.line}: two blocks are both ${name} of one example`);
  example.display.push({ name, code: ended(block.code), lang: block.lang });
  example.blocks.push(block);
  if (block.before) example.before = true;
  if (block.harness) {
    if (!(block.harness in harnesses))
      throw new Error(`line ${block.line}: harness "${block.harness}" is not among the harnesses given`);
    example.harness = block.harness;
    example.harnessTemplate = harnesses[block.harness];
    example.harnessFile = name;
  }
}

// The entry is `Main.qml` when an example has one, else its first QML
// file as written.
function finish(example) {
  const qml = example.display.filter((file) => file.lang === "qml");
  example.entry = qml.find((file) => file.name === "Main.qml")?.name ?? qml[0]?.name ?? "Main.qml";
}

// What compiles, from what an editor shows: the files by name, with the
// harness spliced around the snippet the editor was editing.
export function exampleFiles(example) {
  const files = {};
  for (const file of example.display) files[file.name] = ended(file.code);
  if (example.harnessTemplate) {
    const at = example.harnessFile ?? example.entry;
    files[at] = spliceHarness(example.harnessTemplate, files[at].replace(/\n$/, ""));
  }
  return { entry: example.entry, files };
}
