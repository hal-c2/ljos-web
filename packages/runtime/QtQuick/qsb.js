// What a shader of Qt's is when no tool of Qt's is at hand. For the build only:
// `glsl.js` is not on a page that has no 3D.
import { conditioned, FUNCTIONS, Reader, TYPES, words } from "../QtQuick3D/glsl.js";

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp samplerCube;
precision highp sampler3D;
precision highp sampler2DArray;
precision highp sampler2DShadow;
`;

// What a value worked out from cannot be a constant of OpenGL ES.
const VARYING = /^(texture|texel|dFd|fwidth)/;

const SAID = { gl_VertexIndex: "gl_VertexID", gl_InstanceIndex: "gl_InstanceID" };

const isCode = (word) => word.kind !== "space" && word.kind !== "line";

// `const float blur = size * 2.0;`: OpenGL 4.4 lets a constant be anything
// that does not change once worked out, and OpenGL ES only what is known
// before a shader runs. What it cannot have stops being said to be constant.
function unconstant(all) {
  const known = new Set();
  const out = [];
  let parens = 0;
  for (let at = 0; at < all.length; at++) {
    const { text } = all[at];
    if (text === "(") parens++;
    else if (text === ")") parens--;
    if (text !== "const" || parens > 0) {
      out.push(all[at]);
      continue;
    }
    let end = at;
    while (end < all.length && all[end].text !== ";") end++;
    const code = all.slice(at + 1, end).filter(isCode);
    const declared = [];
    let depth = 0;
    let settled = true;
    let inName = true;
    for (let index = 1; index < code.length; index++) {
      const word = code[index];
      if (word.text === "(" || word.text === "[") depth++;
      else if (word.text === ")" || word.text === "]") depth--;
      else if (depth === 0 && word.text === ",") inName = true;
      else if (depth === 0 && word.text === "=") inName = false;
      else if (word.kind === "name" && code[index - 1].text !== ".") {
        if (inName) {
          declared.push(word.text);
          inName = false;
        } else if (!TYPES.has(word.text) && !known.has(word.text) && word.text !== "true" && word.text !== "false" && !(FUNCTIONS.has(word.text) && !VARYING.test(word.text))) settled = false;
      }
    }
    for (const name of declared) settled ? known.add(name) : known.delete(name);
    if (settled) out.push(all[at]);
    else if (all[at + 1]?.kind === "space") at++;
  }
  return out;
}

// A qualifier list's `layout(...)`, when it is to stay: where a vertex is read
// from and where a fragment goes are said the same in OpenGL ES. What it
// leaves out is binding points, and a place for what passes between stages,
// which it links by name.
function laidOut(said, stage, inner) {
  const held = (stage === "vertex" && said.has("in")) || (stage === "fragment" && said.has("out"));
  const location = inner.find((word) => word.text === "location");
  if (!held || !location) return "";
  const value = inner[inner.indexOf(location) + 2]?.text;
  return `layout(location = ${value}) `;
}

// Where one thing outside any function ends, from where it starts: a function
// ends at its `}`, and all else at a `;`.
function statement(all, at) {
  let depth = 0;
  let end = at;
  let last = "";
  let body = "";
  for (; end < all.length; end++) {
    const { text } = all[end];
    if (text === "{" && depth++ === 0) body = last;
    else if (text === "}" && --depth === 0 && body === ")") return end + 1;
    else if (text === ";" && depth === 0) return end + 1;
    if (isCode(all[end])) last = text;
  }
  return end;
}

// A block's members as they are said, without what only a block has.
function members(code) {
  const text = [];
  for (let at = 0; at < code.length; at++) {
    const { text: word } = code[at];
    if (word === "layout") {
      while (code[at].text !== ")") at++;
    } else if (word !== "row_major" && word !== "column_major") text.push(word);
  }
  return text.join(" ").split(/\s*;\s*/).filter(Boolean);
}

// A shader written for Qt, as `qsb` takes it (OpenGL 4.4 for Vulkan), made one
// a browser takes (OpenGL ES 3.0): what `qsb` does for the same purpose, by
// way of `glsl.js`, which knows what kind of number each expression is. A
// block with a name becomes a struct of that name, as `qsb` makes it; one
// without becomes uniforms of those names. So the two give the same uniforms
// to the runtime. What is not understood is left, for the browser to report.
export function forBrowser(source, stage) {
  const all = unconstant(words(conditioned(source, { QSHADER_VIEW_COUNT: 1 })));
  let text = "";
  for (let at = 0; at < all.length; ) {
    if (!isCode(all[at])) {
      text += all[at++].text;
      continue;
    }
    const end = statement(all, at);
    text += outside(all.slice(at, end), stage);
    at = end;
  }
  const read = new Reader().fitted(text);
  let body = read.text;
  if (read.begun.length) {
    // What is begun with something worked out is done when the shader starts.
    const main = /\bvoid\s+main\s*\(\s*(?:void\s*)?\)\s*\{/.exec(body);
    if (main) body = `${body.slice(0, main.index)}void qt_begin() {\n${read.begun.join("\n")}\n}\n${main[0]}\n    qt_begin();${body.slice(main.index + main[0].length)}`;
  }
  return HEAD + body;
}

function outside(words, stage) {
  const code = words.filter(isCode);
  if (code[0].text === "precision" || code.some((word) => word.text === "gl_PerVertex")) return "";
  const close = code[0].text === "layout" ? code.findIndex((word) => word.text === ")") : -1;
  const rest = code.slice(close + 1);
  const open = rest.findIndex((word) => word.text === "{");
  if (open >= 0 && rest.slice(0, open).some((word) => word.text === "uniform")) return blockOf(rest, open);
  if (close < 0) return plain(words);
  // `layout(std140) uniform;`, `layout(early_fragment_tests) in;`.
  if (rest.length <= 2) return "";
  return laidOut(new Set(rest.map((word) => word.text)), stage, code.slice(2, close)) + rest.map((word) => word.text).join(" ") + "\n";
}

function plain(words) {
  return words.map((word) => (word.kind === "name" && SAID[word.text]) || word.text).join("");
}

function blockOf(code, open) {
  const name = code[open - 1].text;
  let close = open;
  for (let depth = 0; close < code.length; close++) {
    if (code[close].text === "{") depth++;
    else if (code[close].text === "}" && --depth === 0) break;
  }
  const inside = members(code.slice(open + 1, close));
  const instance = code.slice(close + 1, -1).map((word) => word.text).join("");
  if (instance) return `struct qt_block_${name} {\n${inside.map((one) => `    ${one};`).join("\n")}\n};\nuniform qt_block_${name} ${instance};\n`;
  return `${inside.map((one) => `uniform ${one};`).join("\n")}\n`;
}
