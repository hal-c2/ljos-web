// FontLoader: a font from a file, for `font.family` to name.
//
// The file says what it is called; the browser is told that name, and the
// weight and slant of the face, so that `font.bold` finds the bold file.
import { defineType, derived, effect, flush, located, QtObject } from "../object.js";
import { lazy } from "./compute.js";
import { fontsChanged } from "./font.js";
import { signal } from "#kernel";

const NULL = 0;
const READY = 1;
const LOADING = 2;
const ERROR = 3;

const tag = (view, at) =>
  String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));

// The tables of the first font in an OpenType file, by name.
function tables(view) {
  let start = 0;
  let kind = tag(view, 0);
  if (kind === "ttcf") {
    start = view.getUint32(12);
    kind = tag(view, start);
  }
  if (kind !== "OTTO" && kind !== "true" && view.getUint32(start) !== 0x00010000) return null;
  const found = {};
  const count = view.getUint16(start + 4);
  for (let index = 0; index < count; index++) {
    const at = start + 12 + index * 16;
    found[tag(view, at)] = view.getUint32(at + 8);
  }
  return found;
}

// The family the file names: the typographic one (16) when it has one, as
// FreeType reads it for Qt, else the plain one (1).
function family(view, at) {
  const count = view.getUint16(at + 2);
  const strings = at + view.getUint16(at + 4);
  let best = null;
  for (let index = 0; index < count; index++) {
    const record = at + 6 + index * 12;
    const platform = view.getUint16(record);
    const id = view.getUint16(record + 6);
    if (id !== 1 && id !== 16) continue;
    // Windows names in English first, then any Windows or Unicode name,
    // then the old Macintosh ones.
    const rank =
      (id === 16 ? 10 : 0) + (platform === 3 ? (view.getUint16(record + 4) === 0x409 ? 3 : 2) : platform === 0 ? 2 : 1);
    if (best && best.rank >= rank) continue;
    const length = view.getUint16(record + 8);
    const from = strings + view.getUint16(record + 10);
    let name = "";
    if (platform === 1) for (let byte = 0; byte < length; byte++) name += String.fromCharCode(view.getUint8(from + byte));
    else for (let byte = 0; byte + 1 < length; byte += 2) name += String.fromCharCode(view.getUint16(from + byte));
    best = { rank, name };
  }
  return best?.name ?? "";
}

// The range of an axis of a variable font: `wght`, `wdth`.
function axis(view, at, wanted) {
  if (at === undefined) return null;
  const first = at + view.getUint16(at + 4);
  const count = view.getUint16(at + 8);
  const size = view.getUint16(at + 10);
  for (let index = 0; index < count; index++) {
    const record = first + index * size;
    if (tag(view, record) === wanted) return [view.getInt32(record + 4) / 65536, view.getInt32(record + 12) / 65536];
  }
  return null;
}

// What the file says of itself. A compressed font (WOFF) keeps its tables
// packed and says nothing here; what is no font at all is turned down
// before the browser is asked to read it.
function described(buffer, fallback) {
  try {
    const view = new DataView(buffer);
    if (/^wOF[F2]$/.test(tag(view, 0))) return { name: fallback, weight: 400, italic: false, descriptors: {} };
    const found = tables(view);
    if (!found || found.name === undefined) return null;
    const name = family(view, found.name);
    if (!name) return null;
    const os2 = found["OS/2"];
    const weights = axis(view, found.fvar, "wght");
    const widths = axis(view, found.fvar, "wdth");
    const weight = os2 === undefined ? 400 : view.getUint16(os2 + 4);
    return {
      name,
      weight,
      italic: os2 !== undefined && (view.getUint16(os2 + 62) & 1) === 1,
      descriptors: {
        weight: weights ? `${weights[0]} ${weights[1]}` : String(weight || 400),
        style: os2 !== undefined && view.getUint16(os2 + 62) & 1 ? "italic" : "normal",
        stretch: widths ? `${widths[0]}% ${widths[1]}%` : "normal",
      },
    };
  } catch {
    return null;
  }
}

// `fonts/DynaPuff-Regular.woff2` is called `DynaPuff-Regular` when the file
// cannot be asked.
const stem = (url) =>
  decodeURIComponent(
    url
      .split(/[?#]/)[0]
      .split("/")
      .pop()
      .replace(/\.\w+$/, ""),
  );

const loads = new Map();

function load(url) {
  let record = loads.get(url);
  if (record) return record;
  const [status, setStatus] = signal(LOADING);
  loads.set(url, (record = { status, name: "", weight: 400, italic: false }));
  fetch(url)
    .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(response.statusText))))
    .then((buffer) => {
      const found = described(buffer, stem(url));
      if (!found) throw new Error("not a font");
      const face = new FontFace(found.name, buffer, found.descriptors);
      document.fonts.add(face);
      return face.load().then(() => found);
    })
    .then(
      (found) => {
        Object.assign(record, { name: found.name, weight: found.weight, italic: found.italic });
        setStatus(READY);
        // What was measured in the fallback font is measured again.
        fontsChanged();
        flush();
      },
      () => {
        loads.delete(url);
        // As Qt says it: text set in the family is in another font.
        console.warn(`FontLoader: Cannot load font: "${url}"`);
        setStatus(ERROR);
        flush();
      },
    );
  return record;
}

export const FontLoader = defineType("FontLoader", QtObject, {
  properties: {
    source: "",
    status: derived((self) => self.$load()?.status() ?? NULL),
    name: derived((self) => (self.status === READY ? self.$load().name : "")),
    // The font it loaded, for `font: loader.font`.
    font: derived((self) => {
      if (self.status !== READY) return {};
      const { name, weight, italic } = self.$load();
      return { family: name, weight, italic };
    }),
  },
  enums: { Null: NULL, Ready: READY, Loading: LOADING, Error: ERROR },
  setup(self) {
    self.$load = lazy(self, () => {
      const url = located(String(self.source ?? ""));
      return url ? load(url) : null;
    });
    // Loaded whether or not anything asks how it went: a family is as
    // often named by hand as read from `name`.
    effect(
      () => self.$load(),
      () => {},
    );
  },
});
