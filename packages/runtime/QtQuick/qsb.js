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
precision highp samplerCubeShadow;
precision highp sampler2DArrayShadow;
precision highp isampler2D;
precision highp isampler3D;
precision highp isamplerCube;
precision highp isampler2DArray;
precision highp usampler2D;
precision highp usampler3D;
precision highp usamplerCube;
precision highp usampler2DArray;
`;

// What a value worked out from cannot be a constant of OpenGL ES.
const VARYING = /^(texture|texel|dFd|fwidth)/;

const SAID = { gl_VertexIndex: "gl_VertexID", gl_InstanceIndex: "gl_InstanceID" };

const PRECISIONS = new Set(["highp", "mediump", "lowp"]);
const INTERPOLATIONS = new Set(["flat", "smooth", "centroid"]);

const isCode = (word) => word.kind !== "space" && word.kind !== "line";

// The words up to the one that closes the bracket at `open`.
function closing(code, open) {
  let close = open;
  for (let depth = 0; close < code.length; close++) {
    if (code[close].text === code[open].text) depth++;
    else if (code[close].text === { "{": "}", "[": "]", "(": ")" }[code[open].text] && --depth === 0) break;
  }
  return close;
}

const said = (code) => code.map((word) => word.text).join("");

// What is between commas at the top of a bracket's inside.
function parted(code) {
  const parts = [[]];
  let depth = 0;
  for (const word of code) {
    if ("{[(".includes(word.text)) depth++;
    else if ("}])".includes(word.text)) depth--;
    if (word.text === "," && depth === 0) parts.push([]);
    else parts.at(-1).push(word);
  }
  return parts.filter((part) => part.length);
}

// `{0.1, 0.2}` as OpenGL ES says it, or null where the type of a brace inside
// is not known here: a struct's member, left for the browser to report.
function constructed(type, sizes, code) {
  const inner = sizes.length ? [type, sizes.slice(1)] : /^mat\d/.test(type) ? [`vec${/(\d)$/.exec(type)[1]}`, []] : null;
  const parts = parted(code).map((part) => {
    if (part[0].text !== "{") return said(part);
    return inner && constructed(inner[0], inner[1], part.slice(1, -1));
  });
  return parts.includes(null) ? null : `${type}${sizes.map((size) => `[${size}]`).join("")}(${parts.join(", ")})`;
}

// The sizes said from `at` on, and where they end.
function sizesFrom(code, at) {
  const sizes = [];
  while (code[at]?.text === "[") {
    const close = closing(code, at);
    sizes.push(said(code.slice(at + 1, close)));
    at = close + 1;
  }
  return { sizes, at };
}

// What a declaration ending in `... =` declares: its type, and the sizes from
// the outermost in.
function beingDeclared(before) {
  let start = before.length;
  while (start > 0 && !";{}".includes(before[start - 1].text)) start--;
  const code = before.slice(start).filter(isCode).filter((word) => word.text !== "const" && !PRECISIONS.has(word.text));
  if (code[0]?.kind !== "name") return null;
  const ofType = sizesFrom(code, 1);
  const last = parted(code.slice(ofType.at)).at(-1);
  if (last?.[0].kind !== "name") return null;
  return { type: code[0].text, sizes: [...sizesFrom(last, 1).sizes, ...ofType.sizes] };
}

// OpenGL 4.4 lets a value be begun with braces, and OpenGL ES only with a
// constructor of its type.
function unbraced(all) {
  const out = [];
  for (let at = 0; at < all.length; at++) {
    out.push(all[at]);
    if (all[at].text !== "=") continue;
    let open = at + 1;
    while (open < all.length && !isCode(all[open])) open++;
    if (all[open]?.text !== "{") continue;
    const declaring = beingDeclared(out.slice(0, -1));
    if (!declaring) continue;
    const close = closing(all, open);
    const made = constructed(declaring.type, declaring.sizes, all.slice(open + 1, close).filter(isCode));
    if (made === null) continue;
    out.push({ kind: "space", text: " " }, ...words(made));
    at = close;
  }
  return out;
}

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
    let type = 0;
    while (PRECISIONS.has(code[type]?.text)) type++;
    const declared = [];
    let depth = 0;
    let settled = true;
    let inName = true;
    for (let index = type + 1; index < code.length; index++) {
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
    // Anything else called that is left for the browser to report.
    if (word === "layout" && code[at + 1]?.text === "(") {
      at = closing(code, at + 1);
    } else if (word !== "row_major" && word !== "column_major") text.push(word);
  }
  return text.join(" ").split(/\s*;\s*/).filter(Boolean);
}

// A shader written for Qt, as `qsb` takes it (OpenGL 4.4 for Vulkan), made one
// a browser takes (OpenGL ES 3.0), by way of `glsl.js`, which knows what kind
// of number each expression is. A block of uniforms with a name becomes a
// struct of that name, as `qsb` makes it; one without becomes uniforms of those
// names. So the two give the same uniforms to the runtime. Blocks between
// stages and values begun with braces are done from what GLSL says of them, not
// from a run of `qsb`: its corpus has neither. A struct's member begun with
// braces of its own, and a block between stages with a size, are not done. What
// is not understood is left, for the browser to report.
export function forBrowser(source, stage) {
  const all = unconstant(unbraced(words(conditioned(source, { QSHADER_VIEW_COUNT: 1 }))));
  const flattened = [];
  let text = "";
  for (let at = 0; at < all.length; ) {
    if (!isCode(all[at])) {
      text += all[at++].text;
      continue;
    }
    const end = statement(all, at);
    text += outside(all.slice(at, end), stage, flattened);
    at = end;
  }
  for (const { instance, member, name } of flattened) text = text.replace(new RegExp(`(?<![\\w.])${instance}\\s*\\.\\s*${member}\\b`, "g"), name);
  const read = new Reader().fitted(text);
  let body = read.text;
  if (read.begun.length) {
    // What is begun with something worked out is done when the shader starts.
    const main = /\bvoid\s+main\s*\(\s*(?:void\s*)?\)\s*\{/.exec(body);
    if (main) body = `${body.slice(0, main.index)}void qt_begin() {\n${read.begun.join("\n")}\n}\n${main[0]}\n    qt_begin();${body.slice(main.index + main[0].length)}`;
  }
  return HEAD + body;
}

function outside(words, stage, flattened) {
  const code = words.filter(isCode);
  if (code[0].text === "precision" || code.some((word) => word.text === "gl_PerVertex")) return "";
  const close = code[0].text === "layout" ? code.findIndex((word) => word.text === ")") : -1;
  const rest = code.slice(close + 1);
  const open = rest.findIndex((word) => word.text === "{");
  if (open >= 0 && rest.slice(0, open).some((word) => word.text === "uniform")) return blockOf(rest, open);
  if (open >= 0 && rest.slice(0, open).some((word) => word.text === "in" || word.text === "out")) return between(rest, open, flattened) ?? plain(words);
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
  const close = closing(code, open);
  const inside = members(code.slice(open + 1, close));
  const instance = code.slice(close + 1, -1).map((word) => word.text).join("");
  if (instance) return `struct qt_block_${name} {\n${inside.map((one) => `    ${one};`).join("\n")}\n};\nuniform qt_block_${name} ${instance};\n`;
  return `${inside.map((one) => `uniform ${one};`).join("\n")}\n`;
}

// A block between stages is variables to OpenGL ES, of a name made from the
// block's and not its instance's, for that is what the two stages share.
function between(code, open, flattened) {
  const block = code[open - 1].text;
  const close = closing(code, open);
  const named = code.slice(close + 1, -1);
  if (named.length > 1) return null;
  const qualifiers = code.slice(0, open - 1).map((word) => word.text);
  let text = "";
  for (const one of members(code.slice(open + 1, close))) {
    const [first, ...others] = one.split(/\s*,\s*/);
    const parts = first.split(" ");
    const sized = parts.indexOf("[");
    const at = (sized < 0 ? parts.length : sized) - 1;
    const kept = parts.slice(0, at);
    const interpolation = kept.filter((word) => INTERPOLATIONS.has(word));
    const type = kept.filter((word) => !INTERPOLATIONS.has(word)).join(" ");
    for (const declarator of [parts.slice(at).join(" "), ...others]) {
      const [member, ...size] = declarator.split(" ");
      const name = named.length ? `qt_${block}_${member}` : member;
      if (named.length) flattened.push({ instance: named[0].text, member, name });
      text += `${[...interpolation, ...qualifiers, type, name, ...size].join(" ")};\n`;
    }
  }
  return text;
}
