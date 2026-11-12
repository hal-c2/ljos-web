// The DOM a prerender runs over in Node: enough of a document for the
// runtime's own types to make their elements, lay themselves out with
// the measurements a canvas would give (near enough that the first
// paint is the page's shape; hydration's effects settle the exact
// numbers in the browser), and be written out as HTML.
//
// It is not a browser and does not pretend to be one: there is no
// painting (a canvas's 2d context records nothing and measures text by
// its font), no GPU, no loading of pictures, and no event ever fires.
// What a page needs of those it gets when it hydrates, in a browser,
// over the HTML this wrote (docs/LJOS_WEB.md, the prerender section).
//
// Every element this document makes is numbered as it is made, with
// the type whose making made it (held where the runtime says it, as
// below). The two are its hydration key: the client, making the same
// page again in the same order, takes the element of that number and
// type out of the prerendered HTML instead of making another
// (`hydrate` in `../object.js`) — the type because most elements are
// <div>s, and a count alone cannot tell a shifted one from its own.

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const XHTML = "http://www.w3.org/1999/xhtml";
// Where the runtime says what type it is making, while it makes it
// (`object.js`): read here as an element is made.
const MAKING_KIND = Symbol.for("ljos-web.making-kind");
const kindNow = () => globalThis[MAKING_KIND] ?? "";

// The numbering starts again: a render's elements are numbered from
// its making, as the client's are from its hydration. The count is
// the document's, so that whoever installed it and whoever renders
// over it — the build has both — count the same makings.
export function renumber(document) {
  if (document) document._sequence = 0;
}

const escapeText = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const escapeAttribute = (text) => escapeText(text).replaceAll('"', "&quot;");
const unescape = (text) =>
  text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&");

const hyphen = (name) => (name.startsWith("--") ? name : name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replace(/^webkit-/, "-webkit-"));

// The part of a style declaration a render writes: what was set on it,
// by property or as a whole, in the words HTML takes.
class Style {
  constructor() {
    this.values = new Map();
    return new Proxy(this, {
      get: (style, name) => {
        if (name in style) return style[name];
        if (typeof name !== "string") return undefined;
        return style.values.get(hyphen(name)) ?? "";
      },
      set: (style, name, value) => {
        if (name === "cssText") {
          style.cssText = value;
          return true;
        }
        if (name in style && !(name in Style.prototype)) {
          style[name] = value;
          return true;
        }
        const key = hyphen(String(name));
        if (value === "" || value === null || value === undefined) style.values.delete(key);
        else style.values.set(key, String(value));
        return true;
      },
    });
  }
  get cssText() {
    return [...this.values].map(([name, value]) => `${name}: ${value};`).join(" ");
  }
  set cssText(text) {
    this.values.clear();
    for (const part of String(text).split(";")) {
      const at = part.indexOf(":");
      if (at > 0) this.values.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
    }
  }
  setProperty(name, value) {
    if (value === "" || value === null || value === undefined) this.values.delete(name);
    else this.values.set(name, String(value));
  }
  getPropertyValue(name) {
    return this.values.get(name) ?? "";
  }
  removeProperty(name) {
    const was = this.getPropertyValue(name);
    this.values.delete(name);
    return was;
  }
}

// How wide a run of text is taken to be at `size`: a canvas on the
// server there is none, so a glyph is a little over half its size, as
// most are. The browser measures again as it hydrates.
const advance = (text, size) => [...text].length * size * 0.55;

function fontSizeOf(element) {
  for (let at = element; at; at = at.parentElement) {
    const size = at.style?.getPropertyValue?.("font-size") || at.style?.getPropertyValue?.("--qq-size");
    if (size) return parseFloat(size) || 16;
    const font = at.style?.getPropertyValue?.("font");
    const said = font && /(\d+(?:\.\d+)?)px/.exec(font)?.[1];
    if (said) return parseFloat(said);
  }
  return 16;
}

function rect(element) {
  const width = element._width ?? parseFloat(element.style?.getPropertyValue?.("width")) ?? 0;
  const height = element._height ?? parseFloat(element.style?.getPropertyValue?.("height")) ?? 0;
  const w = Number.isFinite(width) && width > 0 ? width : element._textWidth?.() ?? 0;
  // An element that holds text and says no height is as tall as its
  // lines: on the server that is said by the text it holds over the
  // width there is for it, a browser's line-breaking near enough.
  let h = Number.isFinite(height) && height > 0 ? height : 0;
  if (h === 0 && element.textContent) {
    const size = fontSizeOf(element);
    const pitch = parseFloat(element.style?.getPropertyValue?.("line-height")) || size;
    const lines = w > 0 ? Math.max(1, Math.ceil((element._textWidth?.() ?? 0) / w)) : 1;
    h = lines * pitch;
  }
  return { x: 0, y: 0, left: 0, top: 0, right: w, bottom: h, width: w, height: h, toJSON: () => ({}) };
}

// A 2d canvas that measures and does not paint: every call a type
// makes on it is answered, and only `measureText` has an answer with
// anything in it.
function context2d() {
  const held = { font: "16px sans-serif" };
  return new Proxy(held, {
    get: (heldValues, name) => {
      if (name in heldValues) return heldValues[name];
      if (name === "measureText") {
        return (text) => {
          const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(heldValues.font)?.[1]) || 16;
          const width = advance(String(text), size);
          const each = advance("x", size);
          return {
            width,
            actualBoundingBoxLeft: 0,
            actualBoundingBoxRight: Math.min(width, each),
            actualBoundingBoxAscent: size * 0.8,
            actualBoundingBoxDescent: size * 0.2,
            fontBoundingBoxAscent: size * 0.8,
            fontBoundingBoxDescent: size * 0.2,
          };
        };
      }
      if (name === "getImageData") return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
      if (name === "createLinearGradient" || name === "createRadialGradient" || name === "createConicGradient") return () => ({ addColorStop() {} });
      if (name === "createPattern") return () => null;
      if (typeof name === "string") return () => undefined;
      return undefined;
    },
    set: (heldValues, name, value) => ((heldValues[name] = value), true),
  });
}

class TextNode {
  constructor(data) {
    this.nodeType = 3;
    this.data = String(data);
    this.parentNode = null;
    this.ownerDocument = null;
  }
  get textContent() {
    return this.data;
  }
  set textContent(value) {
    this.data = String(value ?? "");
  }
  get parentElement() {
    return this.parentNode?.nodeType === 1 ? this.parentNode : null;
  }
  remove() {
    this.parentNode?.removeChild(this);
  }
  before(...nodes) {
    for (const node of nodes) this.parentNode?.insertBefore(node, this);
  }
  after(...nodes) {
    const parent = this.parentNode;
    if (!parent) return;
    const at = parent.childNodes[parent.childNodes.indexOf(this) + 1] ?? null;
    for (const node of nodes) parent.insertBefore(node, at);
  }
  cloneNode() {
    return new TextNode(this.data);
  }
}

function matches(element, selector) {
  // The selectors the runtime asks for: a tag, a class, an attribute,
  // and the combinations of them one element is asked by.
  const parts = selector.match(/(\*|[a-zA-Z][\w-]*)|(\.[\w-]+)|(#[\w-]+)|\[([\w-]+)(?:\s*=\s*["']?([^"'\]]*)["']?)?\]/g) ?? [];
  if (parts.join("") !== selector.replace(/\s+/g, "")) return false;
  for (const part of parts) {
    if (part === "*") continue;
    if (part.startsWith(".")) {
      if (!element.classList.contains(part.slice(1))) return false;
    } else if (part.startsWith("#")) {
      if (element.id !== part.slice(1)) return false;
    } else if (part.startsWith("[")) {
      const [, name, value] = /^\[([\w-]+)(?:\s*=\s*["']?([^"'\]]*)["']?)?\]$/.exec(part);
      if (!element.hasAttribute(name)) return false;
      if (value !== undefined && element.getAttribute(name) !== value) return false;
    } else if (element.localName !== part.toLowerCase()) return false;
  }
  return true;
}

function selectAll(root, selector) {
  const steps = selector.split(/\s+/).filter(Boolean);
  let current = [root];
  for (const step of steps) {
    const found = [];
    const walk = (node) => {
      for (const child of node.childNodes ?? []) {
        if (child.nodeType !== 1) continue;
        if (matches(child, step)) found.push(child);
        walk(child);
      }
    };
    for (const node of current) walk(node);
    current = found;
  }
  return steps.length ? current : [];
}

class Element {
  constructor(tag = "", namespace = XHTML) {
    this.nodeType = 1;
    this.localName = String(tag).toLowerCase();
    this.tagName = this.localName.toUpperCase();
    this.namespaceURI = namespace;
    this.childNodes = [];
    this.parentNode = null;
    this.ownerDocument = null;
    this.attributes = new Map();
    this.style = new Style();
    this.scrollLeft = 0;
    this.scrollTop = 0;
    this._listeners = new Map();
    // No number until a document makes this element: a copy, a
    // fragment and what a parser makes are none of the makings a
    // client counts as it hydrates.
  }
  get children() {
    return this.childNodes.filter((node) => node.nodeType === 1);
  }
  get childElementCount() {
    return this.children.length;
  }
  get firstChild() {
    return this.childNodes[0] ?? null;
  }
  get lastChild() {
    return this.childNodes.at(-1) ?? null;
  }
  get firstElementChild() {
    return this.children[0] ?? null;
  }
  get parentElement() {
    return this.parentNode?.nodeType === 1 ? this.parentNode : null;
  }
  get nextSibling() {
    if (!this.parentNode) return null;
    return this.parentNode.childNodes[this.parentNode.childNodes.indexOf(this) + 1] ?? null;
  }
  get previousSibling() {
    if (!this.parentNode) return null;
    return this.parentNode.childNodes[this.parentNode.childNodes.indexOf(this) - 1] ?? null;
  }
  get id() {
    return this.getAttribute("id") ?? "";
  }
  set id(value) {
    this.setAttribute("id", value);
  }
  get className() {
    return this.getAttribute("class") ?? "";
  }
  set className(value) {
    this.setAttribute("class", value);
  }
  get classList() {
    const element = this;
    const list = () => element.className.split(/\s+/).filter(Boolean);
    const put = (names) => (element.className = names.join(" "));
    return {
      add: (...names) => put([...new Set([...list(), ...names])]),
      remove: (...names) => put(list().filter((name) => !names.includes(name))),
      toggle: (name, force) => {
        const has = list().includes(name);
        if (force ?? !has) put([...new Set([...list(), name])]);
        else put(list().filter((each) => each !== name));
        return force ?? !has;
      },
      contains: (name) => list().includes(name),
    };
  }
  get dataset() {
    const element = this;
    const toAttribute = (name) => `data-${hyphen(name)}`;
    return new Proxy(
      {},
      {
        get: (_, name) => (typeof name === "string" ? (element.getAttribute(toAttribute(name)) ?? undefined) : undefined),
        set: (_, name, value) => (element.setAttribute(toAttribute(String(name)), value), true),
        deleteProperty: (_, name) => (element.removeAttribute(toAttribute(String(name))), true),
      },
    );
  }
  get textContent() {
    return this.childNodes.map((node) => node.textContent ?? "").join("");
  }
  set textContent(value) {
    const text = String(value ?? "");
    this.replaceChildren(...(text === "" ? [] : [new TextNode(text)]));
  }
  get innerHTML() {
    return this.childNodes.map(serialize).join("");
  }
  set innerHTML(markup) {
    this.replaceChildren(...parse(markup, this.ownerDocument).childNodes);
  }
  get outerHTML() {
    return serialize(this);
  }
  setAttribute(name, value) {
    if (name === "style") {
      this.style.cssText = String(value);
      return;
    }
    this.attributes.set(name, String(value));
  }
  setAttributeNS(_namespace, name, value) {
    this.setAttribute(name, value);
  }
  getAttribute(name) {
    if (name === "style") return this.style.cssText || null;
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
  getAttributeNS(_namespace, name) {
    return this.getAttribute(name);
  }
  hasAttribute(name) {
    return name === "style" ? this.style.cssText !== "" : this.attributes.has(name);
  }
  removeAttribute(name) {
    if (name === "style") this.style.cssText = "";
    else this.attributes.delete(name);
  }
  appendChild(node) {
    return this.insertBefore(node, null);
  }
  append(...nodes) {
    for (const node of nodes) this.appendChild(typeof node === "string" ? new TextNode(node) : node);
  }
  prepend(...nodes) {
    for (const node of [...nodes].reverse()) this.insertBefore(typeof node === "string" ? new TextNode(node) : node, this.firstChild);
  }
  insertBefore(node, before) {
    if (node.nodeType === 11) {
      for (const child of [...node.childNodes]) this.insertBefore(child, before);
      return node;
    }
    node.parentNode?.removeChild(node);
    node.parentNode = this;
    const at = before ? this.childNodes.indexOf(before) : -1;
    if (at < 0) this.childNodes.push(node);
    else this.childNodes.splice(at, 0, node);
    return node;
  }
  removeChild(node) {
    const at = this.childNodes.indexOf(node);
    if (at >= 0) this.childNodes.splice(at, 1);
    if (node.parentNode === this) node.parentNode = null;
    return node;
  }
  replaceChildren(...nodes) {
    for (const child of [...this.childNodes]) this.removeChild(child);
    this.append(...nodes);
  }
  replaceWith(...nodes) {
    const parent = this.parentNode;
    if (!parent) return;
    for (const node of nodes) parent.insertBefore(node, this);
    parent.removeChild(this);
  }
  before(...nodes) {
    for (const node of nodes) this.parentNode?.insertBefore(node, this);
  }
  after(...nodes) {
    const parent = this.parentNode;
    if (!parent) return;
    const at = parent.childNodes[parent.childNodes.indexOf(this) + 1] ?? null;
    for (const node of nodes) parent.insertBefore(node, at);
  }
  remove() {
    this.parentNode?.removeChild(this);
  }
  contains(node) {
    for (let at = node; at; at = at.parentNode) if (at === this) return true;
    return false;
  }
  cloneNode(deep = false) {
    const made = this.nodeType === 11 ? new Fragment() : new Element(this.localName, this.namespaceURI);
    // A copy is not what was made where this was: it has no number of
    // its own to be taken over by, and the making of it is not a
    // making the client counts either.
    made.attributes = new Map(this.attributes);
    made.style.cssText = this.style.cssText;
    made.ownerDocument = this.ownerDocument;
    if (deep) for (const child of this.childNodes) made.appendChild(child.cloneNode(true));
    return made;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  querySelectorAll(selector) {
    return selectAll(this, selector);
  }
  closest(selector) {
    for (let at = this; at; at = at.parentElement) if (matches(at, selector)) return at;
    return null;
  }
  matches(selector) {
    return matches(this, selector);
  }
  addEventListener(type, listener) {
    const held = this._listeners.get(type) ?? [];
    held.push(listener);
    this._listeners.set(type, held);
  }
  removeEventListener(type, listener) {
    const held = this._listeners.get(type) ?? [];
    this._listeners.set(
      type,
      held.filter((each) => each !== listener),
    );
  }
  dispatchEvent() {
    return true;
  }
  focus() {}
  blur() {}
  // A text field's selection, for an editor made in a prerender: no
  // reader selects in it there, but an editor that is made at all
  // puts its cursor somewhere and reads it back, and the text it
  // holds is the page's to write. The browser's own field takes
  // over as the page hydrates.
  get selectionStart() {
    return this._selection?.start ?? 0;
  }
  set selectionStart(at) {
    this.setSelectionRange(at, Math.max(at, this.selectionEnd));
  }
  get selectionEnd() {
    return this._selection?.end ?? 0;
  }
  set selectionEnd(at) {
    this.setSelectionRange(Math.min(at, this.selectionStart), at);
  }
  get selectionDirection() {
    return this._selection?.direction ?? "forward";
  }
  set selectionDirection(direction) {
    (this._selection ??= { start: 0, end: 0, direction: "forward" }).direction = direction;
  }
  setSelectionRange(start, end, direction = "forward") {
    const length = String(this.value ?? "").length;
    const clamp = (at) => Math.max(0, Math.min(length, Math.floor(Number(at) || 0)));
    this._selection = { start: clamp(start), end: clamp(end), direction: direction === "backward" ? "backward" : "forward" };
  }
  setRangeText(text, start, end, mode = "preserve") {
    const value = String(this.value ?? "");
    const from = start === undefined ? this.selectionStart : Math.max(0, Math.min(value.length, start));
    const to = end === undefined ? this.selectionEnd : Math.max(0, Math.min(value.length, end));
    this.value = value.slice(0, from) + String(text) + value.slice(to);
    if (mode === "start") this.setSelectionRange(from, from);
    else if (mode === "select") this.setSelectionRange(from, from + String(text).length);
    else if (mode !== "preserve") this.setSelectionRange(from + String(text).length, from + String(text).length);
  }
  select() {
    this.setSelectionRange(0, String(this.value ?? "").length);
  }
  click() {}
  scrollTo(given = {}) {
    if (typeof given === "object") {
      if (given.left !== undefined) this.scrollLeft = given.left;
      if (given.top !== undefined) this.scrollTop = given.top;
    }
  }
  scrollBy() {}
  getBoundingClientRect() {
    return rect(this);
  }
  getClientRects() {
    const box = rect(this);
    return box.width > 0 || box.height > 0 ? [box] : [];
  }
  get clientWidth() {
    return this._width ?? rect(this).width;
  }
  get clientHeight() {
    return this._height ?? rect(this).height;
  }
  get offsetWidth() {
    return this.clientWidth;
  }
  get offsetHeight() {
    return this.clientHeight;
  }
  get scrollWidth() {
    return this.clientWidth;
  }
  get scrollHeight() {
    return this.clientHeight;
  }
  get offsetParent() {
    return this.parentElement;
  }
  getContext(kind) {
    if (this.localName !== "canvas") return null;
    // Only the measuring canvas: no GPU is in Node, and a 3D or WebGL
    // view prerenders as the element it will paint into.
    return kind === "2d" ? (this._context ??= context2d()) : null;
  }
  toDataURL() {
    return "data:,";
  }
  _textWidth() {
    const text = this.textContent;
    return text === "" ? 0 : advance(text, fontSizeOf(this));
  }
}

// Some elements carry what was set on them as an attribute by the
// property of the same name (`img.src`, `a.href`, a field's `value`):
// in the HTML, as a browser would write them if asked.
for (const name of ["src", "href", "alt", "title", "type", "value", "name", "rel", "target"]) {
  Object.defineProperty(Element.prototype, name, {
    get() {
      return this.getAttribute(name) ?? "";
    },
    set(value) {
      this.setAttribute(name, value);
    },
    configurable: true,
  });
}

class Fragment extends Element {
  constructor() {
    super("#document-fragment");
    this.nodeType = 11;
  }
}

export function serialize(node) {
  if (node.nodeType === 3) return escapeText(node.data);
  if (node.nodeType === 11) return node.childNodes.map(serialize).join("");
  // A textarea's value is its content, as a browser reads it: the
  // reflected `value` attribute (above) is an input's spelling, and
  // a browser given it on a textarea reads an empty field. An HTML
  // parser drops one newline after the opening tag, so the first
  // written is the renderer's and the field's own leading blank
  // line survives it.
  if (node.localName === "textarea") {
    const attributes = [...node.attributes].filter(([name]) => name !== "value").map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join("");
    const style = node.style.cssText ? ` style="${escapeAttribute(node.style.cssText)}"` : "";
    return `<textarea${attributes}${style}>\n${escapeText(node.getAttribute("value") ?? node.textContent)}</textarea>`;
  }
  const attributes = [...node.attributes].map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join("");
  const style = node.style.cssText ? ` style="${escapeAttribute(node.style.cssText)}"` : "";
  if (VOID.has(node.localName)) return `<${node.localName}${attributes}${style}>`;
  return `<${node.localName}${attributes}${style}>${node.childNodes.map(serialize).join("")}</${node.localName}>`;
}

// The markup a string of HTML is, for `DOMParser` and `innerHTML`:
// well-formed enough for what QML's rich text writes.
function parse(markup, document) {
  const root = new Fragment();
  const stack = [root];
  const top = () => stack.at(-1);
  const source = String(markup);
  let at = 0;
  while (at < source.length) {
    const open = source.indexOf("<", at);
    if (open !== at) {
      const text = unescape(source.slice(at, open < 0 ? source.length : open));
      if (text) top().appendChild(new TextNode(text));
      if (open < 0) break;
      at = open;
    }
    if (source.startsWith("<!--", at)) {
      const end = source.indexOf("-->", at);
      at = end < 0 ? source.length : end + 3;
      continue;
    }
    const end = source.indexOf(">", at);
    if (end < 0) break;
    const whole = source.slice(at + 1, end);
    at = end + 1;
    if (whole.startsWith("/")) {
      const name = whole.slice(1).trim().toLowerCase();
      for (let index = stack.length - 1; index > 0; index--) {
        if (stack[index].localName === name) {
          stack.length = index;
          break;
        }
      }
      continue;
    }
    const selfClosing = whole.endsWith("/");
    const body = selfClosing ? whole.slice(0, -1) : whole;
    const [, name, rest = ""] = /^([\w-]+)(.*)$/s.exec(body.trim()) ?? [];
    if (!name) continue;
    // What a parser makes is not a making the client counts either:
    // its browser's parser makes these, and the runtime then copies
    // them with `createElement`, which is counted on both sides.
    const element = new Element(name);
    element.ownerDocument = document ?? null;
    for (const [, key, doubleQuoted, singleQuoted, bare] of rest.matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g)) {
      element.setAttribute(key, unescape(doubleQuoted ?? singleQuoted ?? bare ?? ""));
    }
    top().appendChild(element);
    if (!selfClosing && !VOID.has(element.localName)) stack.push(element);
  }
  return root;
}

class Range {
  selectNodeContents(node) {
    this.node = node;
  }
  getClientRects() {
    const node = this.node;
    if (!node || node.nodeType !== 3 || node.data === "") return [];
    const size = node.parentElement ? fontSizeOf(node.parentElement) : 16;
    const width = advance(node.data, size);
    return [{ x: 0, y: 0, left: 0, top: 0, right: width, bottom: size, width, height: size, toJSON: () => ({}) }];
  }
  getBoundingClientRect() {
    return this.getClientRects()[0] ?? rect({ style: new Style() });
  }
}

export class ServerDocument {
  constructor() {
    this.nodeType = 9;
    this._sequence = 0;
    this._custom = new Map();
    this.documentElement = new Element("html");
    this.head = new Element("head");
    this.body = new Element("body");
    this.documentElement.append(this.head, this.body);
    this.childNodes = [this.documentElement];
    for (const element of [this.documentElement, this.head, this.body]) {
      element.ownerDocument = this;
      delete element.$hk;
    }
    this.documentElement.parentNode = this;
    this.activeElement = this.body;
    // No font is loaded here: what asks is told they are all in, of
    // the fallbacks the measurements are made with.
    this.fonts = {
      status: "loaded",
      ready: Promise.resolve(),
      add() {},
      delete() {
        return true;
      },
      check: () => true,
      load: () => Promise.resolve([]),
      addEventListener() {},
      removeEventListener() {},
    };
    this.adoptedStyleSheets = [];
    this.styleSheets = [];
  }
  createElement(tag) {
    const custom = this._custom?.get(String(tag).toLowerCase());
    const element = custom ? new custom() : new Element(tag);
    if (custom) {
      element.localName = String(tag).toLowerCase();
      element.tagName = element.localName.toUpperCase();
    }
    element.ownerDocument = this;
    // A canvas is painted, not read, and the measuring canvas a type
    // makes while it measures text is made at whatever making first
    // measures — no numbering names it the same on both sides. It is
    // no making in the count, here as in `hydrate`: hydration remakes
    // it and takes the prerendered one out.
    if (element.localName !== "canvas") {
      element.$hk = ++this._sequence;
      element.$kind = kindNow();
    } else {
      element.width = 300;
      element.height = 150;
    }
    if (element.localName === "img") {
      element.naturalWidth = 0;
      element.naturalHeight = 0;
      element.complete = false;
    }
    return element;
  }
  createElementNS(namespace, tag) {
    const element = new Element(tag, namespace);
    element.ownerDocument = this;
    if (element.localName !== "canvas") {
      element.$hk = ++this._sequence;
      element.$kind = kindNow();
    }
    return element;
  }
  createTextNode(text) {
    const node = new TextNode(text);
    node.ownerDocument = this;
    return node;
  }
  createDocumentFragment() {
    const fragment = new Fragment();
    fragment.ownerDocument = this;
    return fragment;
  }
  createRange() {
    return new Range();
  }
  createTreeWalker(root, what) {
    const nodes = [];
    const walk = (node) => {
      for (const child of node.childNodes ?? []) {
        if ((child.nodeType === 1 && (what & 1 || what === -1)) || (child.nodeType === 3 && (what & 4 || what === -1))) nodes.push(child);
        walk(child);
      }
    };
    walk(root);
    let at = 0;
    return { nextNode: () => nodes[at++] ?? null };
  }
  getElementById(id) {
    return this.querySelector(`#${id}`);
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  querySelectorAll(selector) {
    return selectAll(this.documentElement, selector);
  }
  addEventListener() {}
  removeEventListener() {}
}

class ServerDOMParser {
  parseFromString(markup, _type) {
    const document = new ServerDocument();
    const fragment = parse(markup, document);
    // Markup read as a page: what it holds is the body's, as a
    // browser's parser puts it.
    const body = fragment.childNodes.find((node) => node.localName === "body");
    const html = fragment.childNodes.find((node) => node.localName === "html");
    const held = body ?? html ?? fragment;
    for (const child of [...held.childNodes]) document.body.appendChild(child);
    return document;
  }
}

// A sheet the runtime fills with the little CSS its types need: kept
// as its text, so a render can write it into the page it prerenders —
// a page with no script has no other way to those rules.
class ServerStyleSheet {
  replaceSync(text) {
    this.cssText = String(text);
  }
  replace(text) {
    this.replaceSync(text);
    return Promise.resolve(this);
  }
  insertRule() {
    return 0;
  }
  deleteRule() {}
  get cssRules() {
    return [];
  }
}

class Observer {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

function storage() {
  const held = new Map();
  return {
    getItem: (key) => held.get(String(key)) ?? null,
    setItem: (key, value) => held.set(String(key), String(value)),
    removeItem: (key) => held.delete(String(key)),
    clear: () => held.clear(),
    key: (index) => [...held.keys()][index] ?? null,
    get length() {
      return held.size;
    },
  };
}

// What a render needs around the document, put where the runtime
// looks for it. A render runs in a process of its own (the site
// build's), so this takes the globals over rather than adding to a
// page's.
export function installPrerenderGlobals({ width = 1280, height = 720 } = {}) {
  const document = new ServerDocument();
  const globals = {
    document,
    CSSStyleSheet: ServerStyleSheet,
    FontFace: class {
      constructor(family) {
        this.family = family;
        this.status = "loaded";
      }
      load() {
        return Promise.resolve(this);
      }
    },
    // The painters a GPU face draws into first (a View3D, a
    // ShaderEffect): there is no GPU here, and such a view
    // prerenders as the element it paints into, so an offscreen
    // surface answers as a canvas here does — a measuring 2d
    // context, and nothing for any other kind.
    OffscreenCanvas: class {
      constructor(width, height) {
        this.width = width;
        this.height = height;
      }
      getContext(kind) {
        return kind === "2d" ? (this._context ??= context2d()) : null;
      }
      transferToImageBitmap() {
        return { width: this.width, height: this.height, close() {} };
      }
    },
    // A visitor's own store is theirs: a prerender has the empty one
    // a first visit has.
    localStorage: storage(),
    sessionStorage: storage(),
    customElements: {
      get: (name) => document._custom.get(name),
      define: (name, ctor) => document._custom.set(name, ctor),
      whenDefined: () => Promise.resolve(),
    },
    DOMParser: ServerDOMParser,
    XMLSerializer: class {
      serializeToString(node) {
        return serialize(node);
      }
    },
    Node: class {},
    Element,
    HTMLElement: Element,
    NodeFilter: { SHOW_ALL: -1, SHOW_ELEMENT: 1, SHOW_TEXT: 4 },
    ResizeObserver: Observer,
    IntersectionObserver: Observer,
    MutationObserver: Observer,
    navigator: { userAgent: "ljos-web prerender", language: "en", platform: "" },
    location: { href: "http://prerender.invalid/", origin: "http://prerender.invalid", pathname: "/" },
    screen: { width, height, availWidth: width, availHeight: height, orientation: null },
    devicePixelRatio: 1,
    innerWidth: width,
    innerHeight: height,
    requestAnimationFrame: (run) => setTimeout(() => run(0), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    getComputedStyle: (element) =>
      new Proxy(
        {},
        {
          get: (_, name) => {
            if (name === "getPropertyValue") return (property) => element?.style?.getPropertyValue?.(property) ?? "";
            if (typeof name !== "string") return undefined;
            const said = element?.style?.getPropertyValue?.(hyphen(name));
            if (said) return said;
            if (name === "fontSize") return `${element ? fontSizeOf(element) : 16}px`;
            if (name === "lineHeight") return "normal";
            return "";
          },
        },
      ),
    matchMedia: () => ({ matches: false, media: "", addEventListener() {}, removeEventListener() {} }),
    Image: class {
      constructor() {
        // Not a `createElement`, in a browser or here.
        const element = new Element("img");
        element.ownerDocument = document;
        element.naturalWidth = 0;
        element.naturalHeight = 0;
        element.complete = false;
        return element;
      }
    },
  };
  globals.window = globalThis;
  globals.self = globalThis;
  for (const [name, value] of Object.entries(globals)) {
    try {
      Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    } catch {
      globalThis[name] = value;
    }
  }
  return document;
}
