// A picture of a mounted root: a PNG of what the page draws of it, at the
// root's own logical size times a scale, as Ljós's `app_screenshot` gives
// one of a window.
//
// A page cannot read the pixels of its own DOM, so the picture is drawn
// again from the DOM itself: the root's elements are copied with every
// style the browser computed for them written on the copy, into an SVG
// `<foreignObject>`, and that SVG is drawn into a canvas. The browser's own
// engine lays out and paints the copy, so text, borders, gradients, clips,
// opacity, transforms, filters and Shapes come out as the page shows them.
// What the copy cannot carry by itself is given to it: a canvas's drawing,
// a video's frame and every image and font as data, and a scrolled
// element's offset as a shift of what it holds. What cannot be given
// (a WebGL canvas whose buffer is gone, an image the page may not read, a
// frame, a font a script made from bytes it did not keep) refuses the
// picture by name: a picture never leaves out what the page shows.
//
// Nothing is kept: each picture is read when it is asked for, and nothing
// waits or watches between two.
import { allowedUrl, own } from "./guard.js";
import { flush } from "./object.js";
import { described, loads, stem } from "./QtQuick/FontLoader.js";

const XHTML = "http://www.w3.org/1999/xhtml";
const SVG = "http://www.w3.org/2000/svg";
const READY = 1;

// What a copy must not carry: an animation or a transition would start
// again from its beginning in the picture, where the computed value is
// already where it is now.
// The logical longhands say again what the physical ones say.
const SKIPPED =
  /^(animation|transition|view-transition|cursor$|pointer-events$|user-select$|-webkit-user-select$|(inset|margin|padding|border|overflow)-(block|inline)|(min-|max-)?(block|inline)-size$|contain-intrinsic-(block|inline))/;
// What is given as the box's own size, where the value without style is
// resolved against a box that is not this one's (`50%` of the other's
// width may be what this one's happens to be).
const ALWAYS = new Set(["width", "height", "transform-origin", "perspective-origin"]);
// The styles that hold a resource by URL.
const URL = /url\((["']?)(.*?)\1\)/g;
// What a page shows of a document of its own, which a picture cannot draw.
const FRAMES = new Set(["iframe", "frame", "embed", "object", "portal", "fencedframe"]);

class Refused extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const failed = (error, message) => ({ error, message });

// `picture(root, options)`: `{ png, width, height, scale, bytes, area }`,
// `png` the bytes of the PNG, `width` and `height` its pixels, `scale` its
// pixels to a logical pixel, `area` the part of the root pictured,
// `[x, y, width, height]` in logical pixels. Or `{ error, message }`.
//
// - `area`: the part of the root, as `[x, y, width, height]`; all of it
//   when not given.
// - `scale`: device pixels to a logical pixel; the page's
//   `devicePixelRatio` when not given.
// - `max_size`: the longest side of the PNG, which makes the scale smaller
//   when it would be larger.
// - `name(element)`: what a refusal calls the element it refuses.
export async function picture(root, options = {}) {
  try {
    return await taken(root, options);
  } catch (error) {
    if (error instanceof Refused) return failed(error.code, error.message);
    throw error;
  }
}

async function taken(root, options) {
  const item = root.$contentItem ?? root;
  const node = item.$node;
  if (!node) throw new Refused("not_actionable", "the root is drawn nowhere");
  flush();
  const width = item.width;
  const height = item.height;
  if (!(width >= 1 && height >= 1)) throw new Refused("not_actionable", `the root is ${width}x${height}: there is nothing to picture`);
  const [ax, ay, aw, ah] = options.area ?? [0, 0, width, height];
  let scale = options.scale ?? globalThis.devicePixelRatio ?? 1;
  if (options.max_size) scale = Math.min(scale, options.max_size / Math.max(aw, ah));
  const pixels = [Math.max(1, Math.round(aw * scale)), Math.max(1, Math.round(ah * scale))];

  // The styles a copy has without being told them: those of a document
  // with no style sheet, which is what the SVG's copy is in. Measured in a
  // frame of its own, as the page's own sheets would change them.
  const blank = await frame();
  try {
    const copied = copy(node, { width, height, area: [ax, ay, aw, ah], blank: blank.contentDocument, name: options.name ?? describe });
    const [faces] = await Promise.all([fonts(copied.families), ...copied.resources.map((resource) => resource())]);
    const markup = new XMLSerializer().serializeToString(copied.element);
    const svg =
      `<svg xmlns="${SVG}" width="${pixels[0]}" height="${pixels[1]}" viewBox="${ax} ${ay} ${aw} ${ah}" preserveAspectRatio="none">` +
      (faces ? `<style>${escaped(faces)}</style>` : "") +
      `<foreignObject x="0" y="0" width="${width}" height="${height}">${markup}</foreignObject></svg>`;
    const png = await drawn(svg, pixels);
    return { png, width: pixels[0], height: pixels[1], scale, bytes: png.length, area: [ax, ay, aw, ah] };
  } finally {
    blank.remove();
  }
}

// A frame with a document of no style but the browser's own, gone when
// the picture is.
function frame() {
  const made = document.createElement("iframe");
  made.setAttribute("aria-hidden", "true");
  made.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;border:0;visibility:hidden";
  made.srcdoc = "<!doctype html><title></title>";
  return new Promise((resolve) => {
    made.addEventListener("load", () => resolve(made), { once: true });
    document.documentElement.append(made);
  });
}

// The element a refusal is about, when nothing names it better.
const describe = (element) => {
  const names = element.getAttribute("class");
  return `a <${element.localName}>${names ? ` (${names})` : ""}`;
};

// The root's elements, copied with their styles, read all at once: the
// page may change once anything waits. What the copy still needs, as data,
// is in `resources`, filled in before it is drawn.
function copy(node, { width, height, area, blank, name }) {
  const defaults = new Map();
  const families = new Set();
  const resources = [];
  const cache = new Map();
  const box = node.getBoundingClientRect();
  const ratio = node.offsetWidth > 0 ? box.width / node.offsetWidth : 1;
  // Where the area is on the page, to know what is shown in it.
  const seen = {
    left: box.left + area[0] * ratio,
    top: box.top + area[1] * ratio,
    right: box.left + (area[0] + area[2]) * ratio,
    bottom: box.top + (area[1] + area[3]) * ratio,
  };
  const shown = (element, style) => {
    if (style.visibility !== "visible") return false;
    for (const rect of element.getClientRects()) {
      if (rect.right > seen.left && rect.left < seen.right && rect.bottom > seen.top && rect.top < seen.bottom) return true;
    }
    return false;
  };
  const refuse = (element, why) => {
    throw new Refused("not_supported", `${name(element)} ${why}, which a picture of the page cannot show`);
  };

  // What an element of this kind has in a document without style.
  const initial = (element) => {
    const key = `${element.namespaceURI} ${element.localName}`;
    let values = defaults.get(key);
    if (!values) {
      const made = blank.createElementNS(element.namespaceURI ?? XHTML, element.localName);
      const host = element.namespaceURI === SVG && element.localName !== "svg" ? blank.createElementNS(SVG, "svg") : blank.body;
      if (host !== blank.body) blank.body.append(host);
      host.append(made);
      values = read(blank.defaultView.getComputedStyle(made));
      host === blank.body ? made.remove() : host.remove();
      defaults.set(key, values);
    }
    return values;
  };

  // A resource given to the copy as data, once a URL however often it is
  // used; `use` is given the data.
  const inline = (url, element, use) => {
    if (/^data:/.test(url)) return use(url);
    let read = cache.get(url);
    if (!read) cache.set(url, (read = data(url)));
    resources.push(() =>
      read.then(use, (why) => {
        throw new Refused("not_supported", `${name(element)} shows ${url}, which ${why}; a picture of the page cannot show it`);
      }),
    );
  };

  // The style a copy is written with: each value it would not have by
  // itself, from the parent it is in or as the kind it is. A resource by
  // URL, other than a part of the same document, is put in as data.
  const styled = (made, owner, values, parent, extra) => {
    const base = initial(made);
    const entries = Object.entries(values).filter(([key, value]) => ALWAYS.has(key) || !(value === base[key] && value === parent[key]));
    entries.push(...extra.map((entry) => [...entry]));
    const set = () => made.setAttribute("style", entries.map(([key, value]) => `${key}:${value}`).join(";"));
    for (const entry of entries) {
      for (const [, , url] of entry[1].matchAll(URL)) {
        if (url.startsWith("#")) continue;
        inline(url, owner, (found) => {
          entry[1] = entry[1].replace(URL, (whole, quote, at) => (at === url ? `url("${found}")` : whole));
          set();
        });
      }
    }
    set();
  };

  // Each element, depth first; `shift` is how far a scrolled parent moved
  // what it holds.
  const walk = (element, parent, shift, root) => {
    const style = getComputedStyle(element);
    if (style.display === "none") return null;
    const kind = element.localName;
    const visible = shown(element, style);
    if (FRAMES.has(kind) && element.namespaceURI !== SVG) {
      if (visible) refuse(element, "is a document of its own");
      return null;
    }
    if (element.shadowRoot && visible) refuse(element, "draws from a shadow root");
    const values = read(style);
    for (const family of style.fontFamily.split(",")) families.add(family.trim().replace(/^["']|["']$/g, ""));

    const extra = [];
    if (root) {
      // The root at the picture's origin, whatever moves it on the page.
      extra.push(["position", "absolute"], ["left", "0px"], ["top", "0px"], ["right", "auto"], ["bottom", "auto"], ["margin", "0px"]);
      for (const key of ["transform", "translate", "rotate", "scale"]) extra.push([key, "none"]);
      extra.push(["width", `${width}px`], ["height", `${height}px`]);
    } else if (shift[0] || shift[1]) {
      const [x = "0px", y = "0px"] = values.translate === "none" ? [] : values.translate.split(" ");
      extra.push(["translate", `calc(${x} - ${shift[0]}px) calc(${y} - ${shift[1]}px)`]);
    }
    let made;
    if (kind === "canvas") made = canvased(element, visible);
    else if (kind === "video") made = filmed(element, visible);
    else made = element.cloneNode(false);
    made.removeAttribute("style");
    styled(made, element, values, parent, extra);

    if (kind === "img") {
      made.removeAttribute("srcset");
      made.removeAttribute("sizes");
      made.removeAttribute("loading");
      const url = element.currentSrc || element.src;
      if (url) inline(url, element, (found) => made.setAttribute("src", found)); // guarded: a data URL
    } else if (element.namespaceURI === SVG && kind === "image") {
      const url = element.href?.baseVal;
      if (url) inline(new globalThis.URL(url, document.baseURI).href, element, (found) => made.setAttribute("href", found)); // guarded: a data URL
    } else if (kind === "input") {
      if (element.scrollLeft || element.scrollTop) visible && refuse(element, "is scrolled");
      made.setAttribute("value", element.value);
      if (element.checked) made.setAttribute("checked", "");
      else made.removeAttribute("checked");
    } else if (kind === "textarea") {
      if (element.scrollLeft || element.scrollTop) visible && refuse(element, "is scrolled");
      made.textContent = element.value;
      return made;
    } else if (kind === "option") {
      if (element.selected) made.setAttribute("selected", "");
      else made.removeAttribute("selected");
    }

    const before = pseudo(element, "::before", values, visible);
    if (before) made.append(before);
    // What a scrolled element holds is moved as the page moves it.
    const moved = [element.scrollLeft || 0, element.scrollTop || 0];
    if (kind !== "canvas" && kind !== "video") {
      for (const child of element.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) made.append(child.data);
        else if (child.nodeType === Node.ELEMENT_NODE) {
          const inner = walk(child, values, moved, false);
          if (inner) made.append(inner);
        }
      }
    }
    const after = pseudo(element, "::after", values, visible);
    if (after) made.append(after);
    return made;
  };

  // `::before` and `::after` as spans, when what they show is text.
  const pseudo = (element, which, parent, visible) => {
    const style = getComputedStyle(element, which);
    const content = style.content;
    if (!content || content === "none" || content === "normal") return null;
    const text = /^"((?:[^"\\]|\\.)*)"$/.exec(content);
    if (!text) {
      if (visible) refuse(element, `has a ${which} of ${content}`);
      return null;
    }
    const span = document.createElementNS(XHTML, "span");
    const values = read(style);
    delete values.content;
    styled(span, element, values, parent, []);
    span.textContent = text[1].replace(/\\(.)/g, "$1");
    return span;
  };

  // A canvas as a picture of what is drawn on it now. The runtime's are 2D
  // or bitmap canvases; one with no context yet is asked for a 2D one,
  // which is the kind a Canvas item makes.
  const canvased = (element, visible) => {
    const made = document.createElementNS(XHTML, element.width && element.height ? "img" : "div");
    if (made.localName === "div") return made;
    const readable = element.getContext("2d") || element.getContext("bitmaprenderer");
    if (!readable) {
      const gl = element.getContext("webgl2") ?? element.getContext("webgl");
      if (!gl) visible && refuse(element, "is a WebGPU canvas or one of another kind");
      else if (!gl.getContextAttributes()?.preserveDrawingBuffer) visible && refuse(element, "is a WebGL canvas that does not keep its drawing (preserveDrawingBuffer)");
    }
    try {
      made.setAttribute("src", element.toDataURL()); // guarded: a data URL
    } catch {
      if (visible) refuse(element, "draws a picture from another origin");
    }
    return made;
  };

  // A video as its frame now; none before it has one.
  const filmed = (element, visible) => {
    if (element.readyState < 2 || !element.videoWidth) return document.createElementNS(XHTML, "div");
    const canvas = document.createElement("canvas");
    canvas.width = element.videoWidth;
    canvas.height = element.videoHeight;
    canvas.getContext("2d").drawImage(element, 0, 0);
    const made = document.createElementNS(XHTML, "img");
    try {
      made.setAttribute("src", canvas.toDataURL()); // guarded: a data URL
    } catch {
      if (visible) refuse(element, "plays a video from another origin");
    }
    return made;
  };

  const element = walk(node, initial(node), [0, 0], true);
  // The picture's own box: the root's size, nothing past it.
  const outer = document.createElementNS(XHTML, "div");
  outer.setAttribute("style", `position:relative;width:${width}px;height:${height}px;overflow:hidden;margin:0`);
  outer.append(element);
  return { element: outer, families, resources };
}

// Every value the browser computed, by name.
function read(style) {
  const values = {};
  for (let index = 0; index < style.length; index++) {
    const key = style[index];
    if (key.startsWith("--") || SKIPPED.test(key)) continue;
    values[key] = style.getPropertyValue(key);
  }
  return values;
}

// A URL's bytes as a data URL; refused with why when the page may not read
// it.
async function data(url) {
  return asData(await fetched(url));
}

async function fetched(url) {
  const to = allowedUrl(url);
  if (!to) throw own(url) ? "is not there" : "is not fetched while a dropped shell is shown";
  let response;
  try {
    response = await fetch(to); // guarded
  } catch {
    throw "is from another origin that does not let this page read it";
  }
  if (!response.ok) throw `could not be read (${response.status} ${response.statusText})`;
  return response.blob();
}

function asData(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject("could not be read");
    reader.readAsDataURL(blob);
  });
}

// The faces of the families the copy names that the page added: a
// FontLoader's file or a style sheet's `@font-face`, given as data. A face
// a script made from bytes that are not kept refuses the picture, as text
// in another font would be a wrong one.
async function fonts(families) {
  const wanted = (family) => families.has(family.trim().replace(/^["']|["']$/g, ""));
  const given = new Set();
  const rules = [];
  for (const [url, record] of loads) {
    if (record.status() !== READY || !families.has(record.name)) continue;
    given.add(record.name);
    rules.push(
      fetched(url).then(async (blob) => {
          const found = described(await blob.arrayBuffer(), stem(url));
          const source = await asData(blob);
          const { weight, style, stretch } = found.descriptors;
          return `@font-face{font-family:${JSON.stringify(found.name)};src:url("${source}");font-weight:${weight};font-style:${style};font-stretch:${stretch}}`;
        }, (why) => {
          throw new Refused("not_supported", `the font "${record.name}" (${url}) ${why}; a picture of the page cannot show its text`);
        }),
    );
  }
  for (const sheet of document.styleSheets) {
    let list;
    try {
      list = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of list) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const family = rule.style.getPropertyValue("font-family");
      if (!wanted(family)) continue;
      given.add(family.trim().replace(/^["']|["']$/g, ""));
      const base = sheet.href ?? document.baseURI;
      const text = rule.cssText;
      const urls = [...text.matchAll(URL)].map((found) => found[2]).filter((url) => !/^data:/.test(url));
      rules.push(
        Promise.all(urls.map((url) => data(new globalThis.URL(url, base).href).then((found) => [url, found]))).then(
          (pairs) => {
            const by = new Map(pairs);
            return text.replace(URL, (whole, quote, url) => (by.has(url) ? `url("${by.get(url)}")` : whole));
          },
          (why) => {
            throw new Refused("not_supported", `the font "${family}" ${why}; a picture of the page cannot show its text`);
          },
        ),
      );
    }
  }
  for (const face of document.fonts ?? []) {
    const family = face.family.replace(/^["']|["']$/g, "");
    if (face.status === "loaded" && families.has(family) && !given.has(family)) {
      throw new Refused("not_supported", `the font "${family}" was made by a script from bytes the page does not keep; a picture of the page cannot show its text`);
    }
  }
  return (await Promise.all(rules)).join("");
}

// What a `<style>` holds, as XML has it.
const escaped = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// The SVG drawn into a canvas, and the canvas as a PNG.
async function drawn(svg, [width, height]) {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; // guarded: a data URL
  try {
    await image.decode();
  } catch {
    throw new Refused("not_supported", "the browser could not draw the copy of the page");
  }
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d").drawImage(image, 0, 0, width, height);
  let blob;
  try {
    blob = await canvas.convertToBlob({ type: "image/png" });
  } catch {
    // Safari will not let a page read back a picture with HTML in it.
    throw new Refused("not_supported", "this browser does not let a page read back a picture of its own elements");
  }
  return new Uint8Array(await blob.arrayBuffer());
}
