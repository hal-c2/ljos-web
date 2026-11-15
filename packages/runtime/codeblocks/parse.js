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
//   ```ts  file=<F> group=<id>  scripts join the same way, and so do
//   ```json file=<F> group=<id> javascript, json, xml and text: a file
//                               the example reads, shown with the rest
//   ```qml files=<a>,<b>        a root that is given files the site
//                               holds (pictures, sounds), shown nowhere
//
// Exempt tags (never runnable, shown as plain code): sh, rust, toml,
// json, text, xml, gherkin, javascript, diff, unless they are files of
// a group. A bare fence or any other tag is unknown, not quietly plain.

export const EXEMPT = new Set(["sh", "rust", "toml", "json", "text", "xml", "gherkin", "javascript", "diff"]);

// Languages whose blocks can be files of an example. A script is only
// part of an example with file=/group=; on its own it is shown plain.
const SCRIPTS = new Set(["ts", "typescript", "js", "mjs"]);

// Languages of the files an example reads rather than runs: they are
// part of it only as a named file of a group, and plain anywhere else.
const DATA = new Set(["javascript", "json", "xml", "text"]);

const KEYS = new Set(["harness", "file", "group", "files"]);

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
  block.lang === "qml" || (SCRIPTS.has(block.lang) && Boolean(block.file || block.group)) || joins(block);
// A data block is in a group only when it says so: a page shows a JSON
// reply or a JavaScript library as prose does, and those run nowhere.
const joins = (block) => DATA.has(block.lang) && Boolean(block.group);
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
// prose, and they are still one running example. `files(name)` gives the
// bytes of a file the site holds for `files=` (undefined where it holds
// none); a host with no such files gives nothing, and a block that asks
// for one is refused.
export function assemble(blocks, { harnesses = {}, files } = {}) {
  const examples = [];
  const plain = [];
  const unknown = [];
  const groups = new Map();
  for (const block of blocks) {
    if ((EXEMPT.has(block.lang) && !joins(block)) || (SCRIPTS.has(block.lang) && !runnable(block))) plain.push(block);
    else if (!runnable(block)) unknown.push(block);
    else if (block.group) {
      if (!groups.has(block.group)) {
        const example = { display: [], entry: "Main.qml", before: false, group: block.group, blocks: [] };
        groups.set(block.group, example);
        examples.push(example);
      }
      add(groups.get(block.group), block, harnesses, files);
    } else {
      const example = { display: [], entry: "Main.qml", before: false, blocks: [] };
      add(example, block, harnesses, files);
      examples.push(example);
    }
  }
  for (const example of examples) finish(example);
  return { examples, plain, unknown };
}

function add(example, block, harnesses, files) {
  if (block.lang !== "qml" && !block.file)
    throw new Error(`line ${block.line}: a ${block.lang} block of an example needs file= to say which file it is`);
  const name = block.file ?? "Main.qml";
  // A file of an example stays in its project: a build writes these
  // names under a directory of its own, on a reader's machine and on
  // a build's alike.
  if (!inside(name)) throw new Error(`line ${block.line}: file=${name} is not a name inside its example`);
  const taken = (named) => example.display.some((file) => file.name === named) || Object.hasOwn(example.given ?? {}, named);
  if (taken(name)) throw new Error(`line ${block.line}: two blocks are both ${name} of one example`);
  example.display.push({ name, code: ended(block.code), lang: block.lang });
  if (block.files) {
    if (block.file) throw new Error(`line ${block.line}: files= belongs on the example's root, not on file=${block.file}`);
    // The site's files are read from one directory of its own, so a name
    // that climbs out of it, or that only one system reads as a path,
    // would hand an example whatever is beside them.
    for (const held of block.files.split(",")) {
      if (!inside(held) || held.includes("\\")) throw new Error(`line ${block.line}: files=${held} is not a name inside files/`);
      const bytes = files?.(held);
      if (!bytes) throw new Error(`line ${block.line}: files=${held} is not among the site's files`);
      if (taken(held)) throw new Error(`line ${block.line}: two blocks are both ${held} of one example`);
      (example.given ??= {})[held] = bytes;
    }
  }
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
const inside = (name) => name !== "" && !name.startsWith("/") && !name.split("/").includes("..");

function finish(example) {
  const qml = example.display.filter((file) => file.lang === "qml");
  example.entry = qml.find((file) => file.name === "Main.qml")?.name ?? qml[0]?.name ?? "Main.qml";
}

// What compiles, from what an editor shows: the files by name, with the
// harness spliced around the snippet the editor was editing. `given`
// (`{ [name]: text or bytes }`) are files the example reads and its
// page does not show, such as the shell a ShellLoader loads, the JSON a
// model reads, or the picture `files=` names: a site gives them, and a
// file the page shows is the page's.
export function exampleFiles(example) {
  const files = { ...example.given };
  for (const file of example.display) files[file.name] = ended(file.code);
  if (example.harnessTemplate) {
    const at = example.harnessFile ?? example.entry;
    files[at] = spliceHarness(example.harnessTemplate, files[at].replace(/\n$/, ""));
  }
  return { entry: example.entry, files };
}

// The files an example was given, as a payload carries them, and back:
// a text (a shell, a model's JSON) as `{ text }`, so it stays a text the
// compiler reads; the site's bytes (a picture `files=` names) as base64.
// A page has them only from its payload: an example is all of itself
// wherever its page is, as its fences are.
export function packGiven(given) {
  const packed = {};
  for (const [name, content] of Object.entries(given)) {
    if (typeof content === "string") {
      packed[name] = { text: content };
      continue;
    }
    let binary = "";
    for (let at = 0; at < content.length; at += 0x8000) binary += String.fromCharCode(...content.subarray(at, at + 0x8000));
    packed[name] = btoa(binary);
  }
  return packed;
}

export function unpackGiven(packed) {
  const given = {};
  for (const [name, content] of Object.entries(packed)) {
    given[name] = typeof content === "string" ? Uint8Array.from(atob(content), (c) => c.charCodeAt(0)) : content.text;
  }
  return given;
}

// Where a diagnostic of what compiled stands in what an editor shows:
// `{ file, line, column, endLine?, endColumn? }` (1-based, as the
// compiler gives it) to the display file it is in, `{ index, line,
// column, endLine?, endColumn? }`. A harnessed snippet compiled
// spliced, moved down by the marker's line and in by its indent, so its
// positions are moved back; one that falls in the harness around the
// snippet is in no file the reader sees, and answers `{ index: -1 }`.
export function displayPosition(example, diagnostic) {
  const name = diagnostic.file ?? example.entry;
  const index = example.display.findIndex((file) => file.name === name);
  if (index < 0 || !diagnostic.line) return { index };
  const at = { index, line: diagnostic.line, column: diagnostic.column ?? 1 };
  if (diagnostic.endLine) Object.assign(at, { endLine: diagnostic.endLine, endColumn: diagnostic.endColumn ?? 1 });
  if (!example.harnessTemplate || name !== (example.harnessFile ?? example.entry)) return at;
  const lines = String(example.harnessTemplate).split("\n");
  const marker = lines.findIndex((line) => line.trim() === "//! snippet");
  const indent = /^\s*/.exec(lines[marker])[0].length;
  const length = example.display[index].code.replace(/\n$/, "").split("\n").length;
  const back = (line, column) => ({ line: line - marker, column: Math.max(1, column - indent) });
  const start = back(at.line, at.column);
  if (start.line < 1 || start.line > length) return { index: -1 };
  const moved = { index, ...start };
  if (at.endLine) {
    const end = back(Math.min(at.endLine, marker + length), at.endLine > marker + length ? 1e9 : at.endColumn);
    Object.assign(moved, { endLine: end.line, endColumn: end.column });
  }
  return moved;
}

// What a reader is told of a file their example names and does not have
// (`url`, asked for by the example running at `root`): `Main.qml:4:
// shell.qml: No such file or directory`, at the first string of the files
// they see that names it, taken from the file it is written in.
export function notThereLine(display, root, name, url) {
  for (const file of display) {
    const lines = file.code.split("\n");
    for (let line = 0; line < lines.length; line++) {
      for (const [, , literal] of lines[line].matchAll(/(["'])((?:(?!\1)[^\\\n])*)\1/g)) {
        let named;
        try {
          named = new URL(literal, new URL(file.name, root)).href;
        } catch {
          continue;
        }
        if (named === url) return `${file.name}:${line + 1}: ${name}: No such file or directory`;
      }
    }
  }
  return `${name}: No such file or directory`;
}
