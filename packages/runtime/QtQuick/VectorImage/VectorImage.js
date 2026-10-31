// VectorImage: a drawing in SVG, scaled as a drawing and not as a picture
// of one.
//
// Qt reads the file and makes items of it, a Shape for its paths and so on,
// inside one item of the drawing's size. That item is the VectorImage's last
// child, and `fillMode` scales it from its top left corner: nothing is
// centred, and what `PreserveAspectCrop` leaves outside the VectorImage
// shows. Here that one item is there, scaled the same, and in it the browser
// draws the file.
//
// The size is the one QtSvg makes of the file, which is not the browser's
// (`measured`, which Image goes by too), and the `viewBox` is stretched over
// that size, each way on its own.
//
// Not here:
// - the items Qt makes: the one child has none, so there is no Shape whose
//   paths could be given another colour.
// - a file that says neither a size nor a `viewBox`, which Qt gives the
//   bounds of what it draws: of no size here, and not drawn.
// - what a file draws outside its own size: Qt shows it, here it is cut off.
// - `animations`: `loops` and `paused` are kept and nothing is done with
//   them, and there is no `restart`. What moves in the file moves as the
//   browser moves it.
// - `preferredRendererType`, `assumeTrustedSource` and `asynchronousShapes`
//   are kept and nothing more: the browser draws as it draws.
// - Qt reads the file at once; here it is fetched, and until it is there the
//   VectorImage is what it was before.
import { defineType, derived, effect, group, inside, located } from "../../object.js";
import { lazy, rules } from "../compute.js";
import { measured, picture, shared } from "../Image.js";
import { Item } from "../Item.js";
import { Scale } from "../transforms.js";
import { untrack } from "#kernel";

rules(`
.qq-vector { position: absolute; left: 0; top: 0; max-width: none; pointer-events: none; }
`);

const READY = 1;
const LOADING = 2;
const ERROR = 3;
const NONE = Object.freeze({ width: 0, height: 0, url: "" });

const FIT = 1;
const CROP = 2;
const STRETCH = 3;

// The file as the browser is to draw it: of Qt's size, its `viewBox`
// stretched over it.
function sized(root) {
  const size = measured(root);
  if (!size) return null;
  const { width, height, view } = size;
  root.setAttribute("width", width);
  root.setAttribute("height", height);
  root.setAttribute("viewBox", (view ?? [0, 0, width, height]).join(" "));
  root.setAttribute("preserveAspectRatio", "none");
  return { width, height };
}

// `.svgz` is the same, compressed: opened here where what served it did not.
async function read(response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes);
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
}

async function drawing(url) {
  let response;
  try {
    response = await fetch(url);
  } catch {
    response = null;
  }
  if (!response?.ok) throw new Error(`Cannot open file '${url}', because: No such file or directory`);
  const parsed = new DOMParser().parseFromString(await read(response), "image/svg+xml");
  const wrong = parsed.querySelector("parsererror");
  const root = parsed.documentElement;
  if (wrong || root.localName !== "svg") throw new Error(`Cannot read file '${url}', because: ${wrong?.textContent ?? ""}`);
  const size = sized(root);
  if (!size) return NONE;
  const file = new Blob([new XMLSerializer().serializeToString(parsed)], { type: "image/svg+xml" });
  return { ...size, url: URL.createObjectURL(file) };
}

function fetched(url) {
  const record = picture(url);
  drawing(url).then(
    (made) => {
      Object.assign(record, made);
      record.settle(READY);
    },
    (error) => {
      console.warn(`qt.svg: ${error.message}`);
      record.settle(ERROR);
    },
  );
  return record;
}

const drawings = new Map();

// How much larger than itself the drawing is shown, each way.
function scale(self) {
  const { width, height } = self.$vector.shown();
  const mode = self.fillMode;
  if (!width || !height || (mode !== FIT && mode !== CROP && mode !== STRETCH)) return [1, 1];
  const across = self.width / width;
  const down = self.height / height;
  if (mode === STRETCH) return [across, down];
  const both = mode === FIT ? Math.min(across, down) : Math.max(across, down);
  return [both, both];
}

export const VectorImage = defineType("VectorImage", Item, {
  properties: {
    source: "",
    fillMode: STRETCH,
    preferredRendererType: 0,
    assumeTrustedSource: false,
    asynchronousShapes: false,
    animations: group({ loops: 1, paused: false }),
    implicitWidth: derived((self) => self.$vector.shown().width),
    implicitHeight: derived((self) => self.$vector.shown().height),
  },
  enums: {
    NoResize: 0,
    PreserveAspectFit: FIT,
    PreserveAspectCrop: CROP,
    Stretch: STRETCH,
    GeometryRenderer: 0,
    CurveRenderer: 1,
  },
  setup(self) {
    const state = (self.$vector = {
      asked: null,
      last: NONE,
      // No source is no change: Qt keeps what it had.
      record: lazy(self, () => {
        const url = located(String(self.source ?? ""));
        if (url) state.asked = shared(drawings, url, fetched);
        return state.asked;
      }),
      // What is drawn: the file once it is there, and none that could not
      // be read.
      shown: lazy(
        self,
        () => {
          const status = state.record()?.status() ?? LOADING;
          if (status !== LOADING) state.last = status === ERROR ? NONE : state.record();
          return state.last;
        },
        NONE,
      ),
      scale: lazy(self, () => scale(self), [1, 1]),
    });
    const image = document.createElement("img");
    image.className = "qq-vector";
    image.alt = "";
    const held = inside(self, () =>
      untrack(() =>
        Item({
          get width() {
            return state.shown().width;
          },
          get height() {
            return state.shown().height;
          },
          transform: [
            Scale({
              get xScale() {
                return state.scale()[0];
              },
              get yScale() {
                return state.scale()[1];
              },
            }),
          ],
        }),
      ),
    );
    held.$node.append(image);
    let added = false;
    effect(
      () => [state.shown(), state.record()?.status() ?? LOADING],
      ([{ width, height, url }, status]) => {
        // Qt makes the item when it has read a file, or failed to.
        if (!added && status !== LOADING) self.$add(held);
        added ||= status !== LOADING;
        image.style.display = url ? "" : "none";
        if (!url) return void image.removeAttribute("src");
        image.style.width = `${width}px`;
        image.style.height = `${height}px`;
        image.src = url;
      },
    );
  },
});
