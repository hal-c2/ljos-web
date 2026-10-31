// Rich text: the HTML subset Qt's Text takes, as elements. The markup is a
// string made at run time, often from data, so it is never given to the page
// as it is: it is parsed apart from it, and the elements Qt knows are built
// again with nothing in them that loads a script or leaves the page.
import { css } from "./color.js";
import { rules } from "./compute.js";
import { dress, fonts, metrics, resized } from "./font.js";
import { flush } from "../object.js";
import { signal } from "#kernel";

// Qt's line is its font's height rounded up, which CSS computes per element
// from `--qq-line`. Headings and `<font size>` scale as Qt's do; paragraphs
// have margins in rich text and none in styled text, and the document has
// none above its first block and below its last.
rules(`
.qq-text { position: absolute; left: 0; top: 0; white-space: pre; tab-size: 80px; }
.qq-bench {
  position: absolute; left: 0; top: 0; width: 0; height: 0; overflow: hidden; visibility: hidden; pointer-events: none;
}
.qq-markup, .qq-markup * { line-height: var(--qq-line); }
.qq-markup :is(p, h1, h2, h3, h4, h5, h6, ul, ol, dl, pre, blockquote, hr, table) { margin: 0; }
.qq-markup :is(h1, h2, h3, h4, h5, h6) { font-weight: bold; }
.qq-markup h1 { font-size: 2em; }
.qq-markup h2 { font-size: 1.5em; }
.qq-markup h3 { font-size: 1.2em; }
.qq-markup h4 { font-size: 1em; }
.qq-markup h5 { font-size: 0.8em; }
.qq-markup h6 { font-size: 0.7em; }
.qq-markup big { font-size: 1.2em; }
.qq-markup small { font-size: 0.8em; }
.qq-markup :is(pre, code, tt, kbd, samp) { font-family: monospace; font-size: 1em; }
.qq-markup :is(ul, ol) { padding-left: 40px; }
.qq-markup dd { margin-left: 40px; }
.qq-markup a { color: var(--qq-link); text-decoration: underline; cursor: pointer; pointer-events: auto; }
.qq-rich :is(p, ul, ol, dl, pre, table) { margin: 12px 0; }
.qq-rich blockquote { margin: 12px 40px; }
.qq-rich h1 { margin: 18px 0 12px; }
.qq-rich h2 { margin: 16px 0 12px; }
.qq-rich h3 { margin: 14px 0 12px; }
.qq-rich h4 { margin: 12px 0; }
.qq-rich :is(h5, h6) { margin: 12px 0 4px; }
.qq-rich > :first-child { margin-top: 0; }
.qq-rich > :last-child { margin-bottom: 0; }
`);

// The elements Qt's HTML parser knows: a string that opens with one of them
// is taken for rich text.
const KNOWN = new Set(
  (
    "a address b big blockquote body br caption center cite code dd del dfn div dl dt em font h1 h2 h3 h4 h5 h6 head hr " +
    "html i img kbd li link meta nobr ol p pre qt s samp script small span strong style sub sup table tbody td tfoot th " +
    "thead title tr tt u ul var"
  ).split(" "),
);

// Of those, the ones that are text: the rest are left out, with what is in
// them (`script`, `style`, `head`) or without (`html`, `body`, `qt`).
const DROPPED = new Set(["script", "style", "head", "title", "meta", "link"]);
const KEPT = new Set([...KNOWN].filter((name) => !DROPPED.has(name) && !["html", "body", "qt"].includes(name)));
// Renamed: elements HTML no longer has, and an `a` that is not a link the
// browser follows.
const AS = { font: "span", center: "div", nobr: "span", tt: "code" };

const letter = (char) => /[\p{L}\p{N}]/u.test(char);
const space = (char) => /\s/.test(char);

// `Qt::mightBeRichText`: what `Text.AutoText` decides by.
export function mightBeRichText(text) {
  const length = text.length;
  if (length === 0) return false;
  let start = 0;
  while (start < length && space(text[start])) start++;
  if (text.startsWith("<?xml", start)) {
    while (start < length) {
      if (text[start] === "?" && start + 2 < length && text[start + 1] === ">") {
        start += 2;
        break;
      }
      start++;
    }
    while (start < length && space(text[start])) start++;
  }
  if (text.slice(start, start + 5).toLowerCase() === "<!doc") return true;
  let open = start;
  while (open < length && text[open] !== "<" && text[open] !== "\n") {
    // Someone who wrote `&lt;` wants to see a `<`.
    if (text[open] === "&" && text.startsWith("lt;", open + 1)) return true;
    open++;
  }
  if (open >= length || text[open] !== "<") return false;
  const close = text.indexOf(">", open);
  if (close < 0) return false;
  let tag = "";
  for (let index = open + 1; index < close; index++) {
    const char = text[index];
    if (letter(char)) tag += char.toLowerCase();
    else if (tag && space(char)) break;
    else if (tag && char === "/" && index + 1 === close) break;
    else if (!space(char) && (tag || char !== "!")) return false;
  }
  return KNOWN.has(tag);
}

// What a `style` attribute may say: how text looks, nothing that fetches or
// that takes an element out of its place.
const STYLES = [
  "color",
  "background-color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-decoration",
  "text-align",
  "vertical-align",
  "white-space",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "text-indent",
];

// `<font size>`: 1 to 7, 3 being the text's own size, or a step from it.
const SIZES = [0.7, 0.8, 1, 1.2, 1.5, 2, 2.4];

const pixels = (value) => (/^\d+$/.test(value) ? `${value}px` : /^\d+%$/.test(value) ? value : "");

function copy(from, to, name) {
  const style = to.style;
  const read = (attribute) => from.getAttribute(attribute);
  for (const property of STYLES) {
    const value = from.style.getPropertyValue(property);
    if (value && !/url\(|expression|var\(/i.test(value)) style.setProperty(property, value);
  }
  if (read("align") && name !== "img") style.textAlign = read("align");
  if (read("bgcolor")) style.backgroundColor = css(read("bgcolor"));
  if (name === "font") {
    if (read("color")) style.color = css(read("color"));
    if (read("face")) style.fontFamily = read("face");
    const size = read("size");
    if (size) {
      const step = Number(size);
      // A size is of the text's font, whatever it is nested in; a step is
      // from where it is.
      if (/^[+-]/.test(size)) style.fontSize = `${SIZES[Math.min(Math.max(2 + step, 0), 6)]}em`;
      else if (step >= 1) style.fontSize = `calc(var(--qq-size) * ${SIZES[Math.min(step, 7) - 1]})`;
    }
  } else if (name === "center") style.textAlign = "center";
  else if (name === "nobr") style.whiteSpace = "nowrap";
  else if (name === "a") {
    if (from.hasAttribute("href")) to.dataset.link = read("href");
  } else if (name === "img") {
    if (read("src")) to.src = read("src");
    if (read("alt")) to.alt = read("alt");
    if (pixels(read("width") ?? "")) style.width = pixels(read("width"));
    if (pixels(read("height") ?? "")) style.height = pixels(read("height"));
    const align = read("align");
    if (align) style.verticalAlign = { top: "top", middle: "middle", bottom: "baseline" }[align] ?? "";
  } else if (name === "table") {
    if (read("border")) to.border = read("border");
    if (read("cellspacing")) to.cellSpacing = read("cellspacing");
    if (read("cellpadding")) to.cellPadding = read("cellpadding");
    if (pixels(read("width") ?? "")) style.width = pixels(read("width"));
  } else if (name === "td" || name === "th") {
    if (read("colspan")) to.colSpan = Number(read("colspan")) || 1;
    if (read("rowspan")) to.rowSpan = Number(read("rowspan")) || 1;
    if (pixels(read("width") ?? "")) style.width = pixels(read("width"));
    if (read("valign")) style.verticalAlign = read("valign");
  } else if (name === "ol" || name === "ul") {
    if (read("type")) to.type = read("type");
    if (name === "ol" && read("start")) to.start = Number(read("start")) || 1;
  }
}

function rebuild(from, to) {
  for (const node of from.childNodes) {
    if (node.nodeType === 3) to.append(node.data);
    if (node.nodeType !== 1) continue;
    const name = node.localName;
    if (DROPPED.has(name)) continue;
    if (!KEPT.has(name)) {
      rebuild(node, to);
      continue;
    }
    const made = document.createElement(AS[name] ?? name);
    copy(node, made, name);
    rebuild(node, made);
    to.append(made);
  }
}

const parser = new DOMParser();
const built = new Map();

// The elements a string of markup stands for: a copy to put in the page.
export function elements(markup) {
  let fragment = built.get(markup);
  if (!fragment) {
    fragment = document.createDocumentFragment();
    rebuild(parser.parseFromString(markup, "text/html").body, fragment);
    if (built.size > 256) built.clear();
    built.set(markup, fragment);
  }
  return fragment.cloneNode(true);
}

// How the element that holds markup is told to set it: `look` is its kind
// (1 styled text, 2 rich text), its font, its line height as CSS, and how
// it wraps: the width it may take, the wrap mode, the most lines and the
// elision. Rich text is neither elided nor cut, as in Qt.
export function clothe(element, look) {
  const style = element.style;
  const { font, limit, mode } = look;
  element.className = look.kind === 2 ? "qq-text qq-markup qq-rich" : "qq-text qq-markup";
  dress(style, font);
  style.setProperty("--qq-line", look.line);
  style.setProperty("--qq-size", `${font.size}px`);
  const wraps = mode !== 0 && limit !== Infinity;
  const cut = look.kind === 1 && limit !== Infinity;
  const clamped = cut && wraps && look.most < 2147483647;
  const elides = cut && look.elide !== 3 && (clamped || !wraps);
  style.whiteSpace = wraps ? "normal" : "nowrap";
  style.wordBreak = wraps && mode === 3 ? "break-all" : "";
  style.overflowWrap = wraps && mode === 4 ? "anywhere" : "";
  style.width = limit === Infinity ? "max-content" : `${limit}px`;
  style.overflow = clamped || elides ? "hidden" : "";
  style.textOverflow = elides && !wraps ? "ellipsis" : "";
  // The lines past the last one allowed are cut off with an ellipsis, or
  // without: then by the height that many lines of the font take.
  style.display = clamped && elides ? "-webkit-box" : "";
  style.webkitBoxOrient = clamped && elides ? "vertical" : "";
  style.webkitLineClamp = clamped && elides ? String(look.most) : "";
  style.maxHeight = clamped && !elides ? `${look.most * look.pitch}px` : "";
}

// Counted up when a picture inside some markup arrives: what was measured
// around it is measured again. Once for each picture: measuring makes the
// elements anew, and theirs load again, from the browser's cache.
const [pictures, setPictures] = signal(0);
const arrived = new Set();

function awaited(image) {
  const source = image.src;
  if (!source || image.complete || arrived.has(source)) return;
  image.addEventListener(
    "load",
    () => {
      if (arrived.has(source)) return;
      arrived.add(source);
      setPictures((count) => count + 1);
      flush();
    },
    { once: true },
  );
}

let bench;
const surveys = new Map();

// Lays the markup out off the page and reads what Text reports: the width
// of its widest line, its height, its lines, where its first baseline is.
// An element is the only thing that can tell: the browser sets rich text.
export function survey(markup, look) {
  const { kind, font, line, limit, mode, most, elide } = look;
  const key = [fonts(), pictures(), kind, font.face, line, limit, mode, most, elide, markup].join("|");
  let found = surveys.get(key);
  if (found) return found;
  if (!bench) {
    bench = document.createElement("div");
    bench.className = "qq-bench";
    bench.append(document.createElement("div"));
    document.body.append(bench);
  }
  const box = bench.firstChild;
  clothe(box, look);
  box.replaceChildren(elements(markup));
  for (const image of box.querySelectorAll("img")) awaited(image);
  const frame = box.getBoundingClientRect();
  // Each run of text and each picture, for the extent of the lines and for
  // how many there are: what does not overlap what came before is a new one.
  const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const range = document.createRange();
  const boxes = [];
  const runs = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === 3) {
      range.selectNodeContents(node);
      const found = range.getClientRects();
      if (found.length) runs.push({ node, box: found[0] });
      boxes.push(...found);
    } else if (node.localName === "img") boxes.push(node.getBoundingClientRect());
  }
  let right = frame.left;
  for (const each of boxes) right = Math.max(right, each.right);
  boxes.sort((a, b) => a.top - b.top);
  let count = 0;
  let bottom = -Infinity;
  for (const each of boxes) {
    if (each.width === 0) continue;
    if (each.top >= bottom - 1) count++;
    bottom = Math.max(bottom, each.bottom);
  }
  // An empty inline block sits on the baseline of the line it is in. The
  // browser puts that where whole pixels of ascent and of spare line height
  // leave it; Qt puts it the ascent of the line's largest font below the top
  // of the line. So the top of the line is found, from the boxes of the text
  // on it, and the ascent is counted from there.
  let ascent = 0;
  if (runs.length) {
    const probe = document.createElement("span");
    probe.style.display = "inline-block";
    runs[0].node.before(probe);
    const line = probe.getBoundingClientRect().bottom;
    probe.remove();
    let top = line;
    let size = 0;
    for (const { node, box: first } of runs) {
      if (first.top >= line || first.bottom < line) continue;
      const style = getComputedStyle(node.parentElement);
      const spare = Math.floor((parseFloat(style.lineHeight) - first.height) / 2);
      top = Math.min(top, first.top - (spare || 0));
      size = Math.max(size, parseFloat(style.fontSize));
    }
    ascent = top - frame.top + metrics(resized(look.font, size || look.font.size)).ascent;
  }
  const cut = box.style.overflow === "hidden";
  // Qt counts no lines in rich text, and does not say when it is cut.
  found = {
    width: look.limit === Infinity ? frame.width : right - frame.left,
    height: frame.height,
    count: look.kind === 2 ? 1 : Math.max(count, 1),
    truncated: cut && (box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1),
    ascent,
  };
  box.replaceChildren();
  if (surveys.size > 256) surveys.clear();
  surveys.set(key, found);
  return found;
}
