// Shape and ShapePath: paths that are drawn, stroked and filled.
//
// A Shape is one `<svg>` and each of its ShapePaths a `<path>` in it, whose
// `d` is the path's outline. Qt strokes and fills the same outline, so what
// is left to SVG is the painting.
import { Rect } from "../../QtQml/values.js";
import { defineType, derived, effect } from "../../object.js";
import { allowedStyle } from "../../guard.js";
import { color, colorValue, css } from "../color.js";
import { rules } from "../compute.js";
import { Item } from "../Item.js";
import { Path } from "../Path.js";

const SVG = "http://www.w3.org/2000/svg";
const svg = (name) => document.createElementNS(SVG, name);

// The `<svg>` is only where the paths are: it has no size of its own, and
// what is drawn outside the item shows, as in Qt.
rules(`
.qq-shape { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none; }
.qq-shape foreignObject > div { width: 100%; height: 100%; }
`);

const WINDING = 1;
const MITER = 0x00;
const BEVEL = 0x40;
const ROUND_JOIN = 0x80;
const FLAT = 0x00;
const SQUARE = 0x10;
const ROUND_CAP = 0x20;
const SOLID = 1;
const DASH = 2;

const JOINS = { [MITER]: "miter", [BEVEL]: "bevel", [ROUND_JOIN]: "round" };
const CAPS = { [FLAT]: "butt", [SQUARE]: "square", [ROUND_CAP]: "round" };

let made = 0;

// The stroke, or null when there is none: Qt draws no line of no width, and
// none in a colour that cannot be seen.
function stroke(self) {
  const width = Number(self.strokeWidth);
  const colour = self.strokeColor;
  if (!(width > 0) || color(colour).a === 0) return null;
  const dashed = self.strokeStyle === DASH;
  const pattern = dashed ? Array.from(self.dashPattern ?? [], Number) : [];
  // Qt gives up on a mitre when it sticks out further than `miterLimit`
  // widths past the corner of the line, SVG when the whole mitre is longer
  // than its limit: the same angle, said differently.
  const limit = Number(self.miterLimit) || 0;
  return {
    colour: css(colour),
    width,
    cap: CAPS[self.capStyle] ?? "square",
    join: JOINS[self.joinStyle] ?? "bevel",
    limit: Math.sqrt(1 + 4 * limit * limit),
    // A dash is as many line widths long as the pattern says.
    dash: pattern.length > 1 ? pattern.map((length) => length * width).join(" ") : "",
    offset: dashed ? (Number(self.dashOffset) || 0) * width : 0,
    cosmetic: Boolean(self.cosmeticStroke),
  };
}

function set(element, name, value) {
  if (value === "" || value == null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

export const ShapePath = defineType("ShapePath", Path, {
  properties: {
    strokeColor: "white",
    strokeWidth: 1,
    fillColor: "white",
    fillRule: 0,
    joinStyle: BEVEL,
    miterLimit: 2,
    capStyle: SQUARE,
    strokeStyle: SOLID,
    dashOffset: 0,
    dashPattern: Object.freeze([4, 2]),
    fillGradient: null,
    pathHints: 0,
    cosmeticStroke: false,
  },
  resolve: { strokeColor: colorValue, fillColor: colorValue },
  enums: {
    OddEvenFill: 0,
    WindingFill: WINDING,
    MiterJoin: MITER,
    BevelJoin: BEVEL,
    RoundJoin: ROUND_JOIN,
    FlatCap: FLAT,
    SquareCap: SQUARE,
    RoundCap: ROUND_CAP,
    SolidLine: SOLID,
    DashLine: DASH,
    PathLinear: 1,
    PathQuadratic: 2,
    PathConvex: 4,
    PathFillOnRight: 8,
    PathSolid: 16,
    PathNonIntersecting: 32,
    PathNonOverlappingControlPointTriangles: 64,
  },
  setup(self) {
    // What the Shape it is in puts in its `<svg>`.
    const group = (self.$shape = svg("g"));
    const path = svg("path");
    group.append(path);
    // Made when a gradient needs them.
    let defs = null;
    let cone = null;

    effect(
      () => self.$outline().toString(),
      (d) => path.setAttribute("d", d),
    );
    effect(
      () => (self.fillRule === WINDING ? "nonzero" : "evenodd"),
      (rule) => path.setAttribute("fill-rule", rule),
    );
    effect(
      () => stroke(self),
      (line) => {
        path.setAttribute("stroke", line ? line.colour : "none");
        set(path, "stroke-width", line?.width);
        set(path, "stroke-linecap", line?.cap);
        set(path, "stroke-linejoin", line?.join);
        set(path, "stroke-miterlimit", line?.limit);
        set(path, "stroke-dasharray", line?.dash);
        set(path, "stroke-dashoffset", line?.offset || "");
        set(path, "vector-effect", line?.cosmetic ? "non-scaling-stroke" : "");
      },
    );
    effect(
      () => {
        const gradient = self.fillGradient;
        if (gradient?.$element) return { paint: gradient.$element };
        if (gradient?.$conic) {
          const outline = self.$outline();
          const box = outline.bounds();
          return {
            conic: gradient.$conic(box.x, box.y),
            box,
            d: outline.toString(),
            rule: self.fillRule === WINDING ? "nonzero" : "evenodd",
          };
        }
        return { fill: css(self.fillColor) };
      },
      (next) => {
        if (next.paint) {
          if (!defs) group.prepend((defs = svg("defs")));
          defs.replaceChildren(next.paint);
          path.setAttribute("fill", `url(#${next.paint.id})`);
        } else {
          defs?.replaceChildren();
          path.setAttribute("fill", next.conic ? "none" : next.fill);
        }
        if (!next.conic) return void cone?.box.remove();
        if (!cone) {
          // A box with the gradient as its background, seen through the
          // path's own outline.
          const clip = svg("clipPath");
          clip.id = `qq-clip-${++made}`;
          const shape = svg("path");
          clip.append(shape);
          const box = svg("foreignObject");
          box.setAttribute("clip-path", `url(#${clip.id})`);
          const fill = document.createElement("div");
          box.append(fill);
          cone = { clip, shape, box, fill };
        }
        if (!defs) group.prepend((defs = svg("defs")));
        defs.replaceChildren(cone.clip);
        cone.shape.setAttribute("d", next.d);
        cone.shape.setAttribute("clip-rule", next.rule);
        cone.box.setAttribute("x", next.box.x);
        cone.box.setAttribute("y", next.box.y);
        cone.box.setAttribute("width", Math.max(0, next.box.width));
        cone.box.setAttribute("height", Math.max(0, next.box.height));
        cone.fill.style.background = allowedStyle(next.conic);
        if (cone.box.parentNode !== group) group.insertBefore(cone.box, path);
      },
    );
  },
});

const GEOMETRY = 1;
const CURVE = 4;
const FIT = 1;
const CROP = 2;
const RIGHT = 2;
const HCENTER = 4;
const BOTTOM = 64;
const VCENTER = 128;

// Everything declared in the shape, and the paths among it.
function all(self) {
  self.$track();
  return self.$extra ? [...self.$static, ...self.$extra] : self.$static;
}
const paths = (self) => all(self).filter((object) => object.$shape);

// The rectangle the paths are in. Qt widens each by its line on every side:
// by half its width, or by as far as the corner of a square cap reaches,
// which is that times the square root of two.
function bounding(self) {
  let left = 0;
  let top = 0;
  let right = 0;
  let bottom = 0;
  let any = false;
  for (const path of paths(self)) {
    const box = path.$outline().bounds();
    const reach = path.capStyle === SQUARE ? Math.SQRT1_2 : 0.5;
    const margin = color(path.strokeColor).a === 0 ? 0 : (Number(path.strokeWidth) || 0) * reach;
    const x = box.x - margin;
    const y = box.y - margin;
    const width = box.width + 2 * margin;
    const height = box.height + 2 * margin;
    if (width === 0 && height === 0) continue;
    if (!any) {
      left = x;
      top = y;
      right = x + width;
      bottom = y + height;
      any = true;
      continue;
    }
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + width);
    bottom = Math.max(bottom, y + height);
  }
  return new Rect(left, top, right - left, bottom - top);
}

// How the paths are fitted to the item's size and placed in it: an SVG
// transform, or none.
function fitted(self) {
  const mode = self.fillMode;
  const wide = self.implicitWidth;
  const tall = self.implicitHeight;
  let sx = 1;
  let sy = 1;
  if (mode !== 0 && wide > 0 && tall > 0) {
    sx = self.width / wide;
    sy = self.height / tall;
    if (mode === FIT) sx = sy = Math.min(sx, sy);
    else if (mode === CROP) sx = sy = Math.max(sx, sy);
  }
  const horizontal = self.horizontalAlignment;
  const vertical = self.verticalAlignment;
  const spare = (room, alignment, far, centre) => (alignment === far ? room : alignment === centre ? room / 2 : 0);
  const tx = horizontal === RIGHT || horizontal === HCENTER ? spare(self.width - sx * wide, horizontal, RIGHT, HCENTER) : 0;
  const ty = vertical === BOTTOM || vertical === VCENTER ? spare(self.height - sy * tall, vertical, BOTTOM, VCENTER) : 0;
  return sx === 1 && sy === 1 && !tx && !ty ? "" : `translate(${tx} ${ty}) scale(${sx} ${sy})`;
}

export const Shape = defineType("Shape", Item, {
  properties: {
    // Which of Qt's renderers draws it: here always the browser's, which
    // like Qt's curve renderer draws curves as curves.
    rendererType: derived((self) => (self.preferredRendererType === CURVE ? CURVE : GEOMETRY)),
    preferredRendererType: 0,
    asynchronous: false,
    vendorExtensionsEnabled: true,
    status: 1,
    containsMode: 0,
    fillMode: 0,
    horizontalAlignment: 1,
    verticalAlignment: 32,
    boundingRect: derived(bounding),
    // A shape is as big as what it draws, measured from its own corner.
    implicitWidth: derived((self) => self.boundingRect.right),
    implicitHeight: derived((self) => self.boundingRect.bottom),
  },
  enums: {
    UnknownRenderer: 0,
    GeometryRenderer: GEOMETRY,
    NvprRenderer: 2,
    SoftwareRenderer: 3,
    CurveRenderer: CURVE,
    Null: 0,
    Ready: 1,
    Processing: 2,
    BoundingRectContains: 0,
    FillContains: 1,
    NoResize: 0,
    PreserveAspectFit: FIT,
    PreserveAspectCrop: CROP,
    Stretch: 3,
    AlignLeft: 1,
    AlignRight: RIGHT,
    AlignHCenter: HCENTER,
    AlignTop: 32,
    AlignBottom: BOTTOM,
    AlignVCenter: VCENTER,
  },
  methods: {
    // Everything declared in it: its paths, and the items it has.
    get data() {
      return all(this);
    },
  },
  setup(self) {
    const picture = svg("svg");
    picture.setAttribute("class", "qq-shape");
    const layer = svg("g");
    picture.append(layer);
    self.$node.append(picture);
    effect(
      () => paths(self).map((path) => path.$shape),
      (groups) => layer.replaceChildren(...groups),
    );
    effect(
      () => fitted(self),
      (transform) => set(layer, "transform", transform),
    );
  },
});
