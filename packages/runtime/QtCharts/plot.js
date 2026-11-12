// What a chart is drawn with, QtCharts' and QtGraphs' alike: a few SVG
// elements, each described by what it is to be and changed only where that
// differs from what it is.
import { alone, derived, group } from "../object.js";
import { given, rules } from "../QtQuick/compute.js";
import { advance, dress, metrics } from "../QtQuick/font.js";

const SVG = "http://www.w3.org/2000/svg";
export const svg = (name) => document.createElementNS(SVG, name);

rules(`
.qq-plot { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.qq-plot text { white-space: pre; user-select: none; }
`);

// What each element was last drawn as.
const drawn = new WeakMap();

// Makes the elements of `parent` those `shapes` describe, in their order.
// An element stays where one of its kind is to be.
export function draw(parent, shapes) {
  let node = parent.firstElementChild;
  for (const shape of shapes) {
    let element = node;
    if (element?.localName !== shape.tag) {
      element = svg(shape.tag);
      if (node) node.replaceWith(element);
      else parent.append(element);
    }
    node = element.nextElementSibling;
    const before = drawn.get(element);
    drawn.set(element, shape);
    for (const name in shape.set) {
      const value = shape.set[name];
      if (before?.set[name] === value) continue;
      if (value == null) element.removeAttribute(name);
      else element.setAttribute(name, value);
    }
    if (before) for (const name in before.set) if (!(name in shape.set)) element.removeAttribute(name);
    if (shape.tag !== "text") continue;
    if (before?.text !== shape.text) element.textContent = shape.text;
    if (before?.font !== shape.font) dress(element.style, shape.font);
  }
  while (node) {
    const next = node.nextElementSibling;
    node.remove();
    node = next;
  }
}

// Where a nested `<svg>` is, which cuts what is in it at its edges and
// leaves it where it was drawn.
export function window(element, x, y, width, height) {
  // Qt cuts at whole pixels: the nearest to each edge.
  const right = Math.floor(x + width + 0.5);
  const bottom = Math.floor(y + height + 0.5);
  x = Math.floor(x + 0.5);
  y = Math.floor(y + 0.5);
  width = right - x;
  height = bottom - y;
  element.setAttribute("x", x);
  element.setAttribute("y", y);
  element.setAttribute("width", Math.max(0, width));
  element.setAttribute("height", Math.max(0, height));
  element.setAttribute("viewBox", `${x} ${y} ${Math.max(0, width)} ${Math.max(0, height)}`);
}

// Qt's painter, when it does not smooth, gives a line one pixel wide the
// pixels its ends are in and those between them: a line through the middles
// of those, with square ends.
const pixel = (value) => Math.floor(value) + 0.5;

// A pen no wider than a pixel is a pixel wide: Qt's cosmetic pen.
const thick = (width, smooth) => (smooth ? width || 1 : Math.max(1, width));

export function line(x1, y1, x2, y2, colour, smooth) {
  if (!smooth) return { tag: "line", set: { x1: pixel(x1), y1: pixel(y1), x2: pixel(x2), y2: pixel(y2), stroke: colour, "stroke-linecap": "square" } };
  return { tag: "line", set: { x1, y1, x2, y2, stroke: colour, "stroke-linecap": "square" } };
}

// The edges of a rectangle that has an outline are lines like those.
function edges(x, y, width, height, pen, smooth) {
  if (smooth || !pen) return [x, y, width, height];
  const left = pixel(x);
  const top = pixel(y);
  return [left, top, pixel(x + width) - left, pixel(y + height) - top];
}

function painted(set, fill, pen, smooth) {
  set.fill = fill ?? "none";
  if (!pen) return;
  set.stroke = pen.colour;
  const width = thick(pen.width, smooth);
  if (width === 1) return;
  set["stroke-width"] = width;
  // Where two edges meet, as Qt's pen joins them.
  set["stroke-linejoin"] = "bevel";
}

// `pen` is `{ colour, width }`, or null for no outline.
export function box(x, y, width, height, fill, pen, smooth) {
  [x, y, width, height] = edges(x, y, width, height, pen, smooth);
  const set = { x, y, width: Math.max(0, width), height: Math.max(0, height) };
  painted(set, fill, pen, smooth);
  return { tag: "rect", set };
}

export function oval(x, y, width, height, fill, pen, smooth) {
  [x, y, width, height] = edges(x, y, width, height, pen, smooth);
  const set = { cx: x + width / 2, cy: y + height / 2, rx: Math.max(0, width / 2), ry: Math.max(0, height / 2) };
  painted(set, fill, pen, smooth);
  return { tag: "ellipse", set };
}

// A path that is stroked and not filled, as Qt's default pen strokes one.
export function stroke(d, pen, smooth) {
  return {
    tag: "path",
    set: { d, fill: "none", stroke: pen.colour, "stroke-width": thick(pen.width, smooth), "stroke-linecap": "square", "stroke-linejoin": "bevel" },
  };
}

// The margin Qt's text document leaves around a label.
const MARGIN = 1;

// How much room Qt gives a text: ChartPresenter::textBoundingRect.
export const wide = (spec, text) => advance(spec, text) + 2 * MARGIN;
export const tall = (spec) => metrics(spec).height + 2 * MARGIN;

// A label whose room begins at (`x`, `y`).
export function label(text, x, y, spec, colour) {
  return { tag: "text", set: { x: x + MARGIN, y: y + MARGIN + metrics(spec).ascent, fill: colour }, text, font: spec };
}

// The text, or as much of its beginning as fits with three dots after it,
// or the dots alone: ChartPresenter::truncatedText.
export function truncated(spec, text, width, height) {
  const high = tall(spec);
  const across = wide(spec, text);
  if (across <= width && high <= height) return { text, width: across, height: high };
  let fits = "...";
  if (high <= height) {
    let low = 1;
    let most = text.length - 1;
    while (low <= most) {
      const kept = (low + most) >> 1;
      const tried = `${text.slice(0, kept)}...`;
      if (wide(spec, tried) <= width) {
        fits = tried;
        low = kept + 1;
      } else most = kept - 1;
    }
  }
  return { text: fits, width: wide(spec, fits), height: high };
}

// A font under a name of its own (`labelsFont`), as font.js's `font` is.
export const fontNamed = (name) =>
  group({
    family: "Sans Serif",
    styleName: "",
    bold: derived((self) => self[name].weight >= 600),
    weight: derived((self) => (given(self, name, "bold") && self[name].bold ? 700 : 400)),
    italic: false,
    underline: false,
    overline: false,
    strikeout: false,
    size: alone(derived((self) => self[name].pixelSize)),
    pixelSize: derived((self) =>
      given(self, name, "size") ? self[name].size : given(self, name, "pointSize") ? Math.round((self[name].pointSize * 96) / 72) : 12,
    ),
    pointSize: derived((self) => (given(self, name, "pixelSize") || given(self, name, "size") ? (self[name].pixelSize * 72) / 96 : 9)),
    capitalization: 0,
    letterSpacing: 0,
    wordSpacing: 0,
    kerning: true,
    features: undefined,
    variableAxes: undefined,
  });

// The straight lines through the points (`[x, y]` each), as a path.
export function straight(points) {
  let d = "";
  for (const [x, y] of points) d += `${d ? "L" : "M"}${x} ${y}`;
  return d;
}

// Each line between two of the points by itself, as Qt draws a line
// series: every one with ends of its own, and nothing where two meet.
export function apart(points) {
  let d = "";
  for (let i = 1; i < points.length; i++) d += `M${points[i - 1][0]} ${points[i - 1][1]}L${points[i][0]} ${points[i][1]}`;
  return d;
}

// One coordinate of the first control point of each piece of the curve
// that goes smoothly through the points: SplineChartItem's.
function controls(rhs) {
  const count = rhs.length;
  const first = new Array(count);
  const spare = new Array(count);
  let b = 2;
  first[0] = rhs[0] / b;
  for (let i = 1; i < count; i++) {
    spare[i] = 1 / b;
    b = (i < count - 1 ? 4 : 3.5) - spare[i];
    first[i] = (rhs[i] - first[i - 1]) / b;
  }
  for (let i = 1; i < count; i++) first[count - i - 1] -= spare[count - i] * first[count - i];
  return first;
}

function coordinate(points, at) {
  const pieces = points.length - 1;
  const rhs = new Array(pieces);
  rhs[0] = points[0][at] + 2 * points[1][at];
  for (let i = 1; i < pieces - 1; i++) rhs[i] = 4 * points[i][at] + 2 * points[i + 1][at];
  rhs[pieces - 1] = (8 * points[pieces - 1][at] + points[pieces][at]) / 2;
  const first = controls(rhs);
  const second = new Array(pieces);
  for (let i = 0; i < pieces; i++) {
    second[i] = i < pieces - 1 ? 2 * points[i + 1][at] - first[i + 1] : (points[pieces][at] + first[pieces - 1]) / 2;
  }
  return [first, second];
}

// The curve through the points, as a path of cubic pieces.
export function curved(points) {
  if (points.length < 2) return straight(points);
  const [x0, y0] = points[0];
  let d = `M${x0} ${y0}`;
  if (points.length === 2) {
    const [x1, y1] = points[1];
    const cx = (2 * x0 + x1) / 3;
    const cy = (2 * y0 + y1) / 3;
    return `${d}C${cx} ${cy} ${2 * cx - x0} ${2 * cy - y0} ${x1} ${y1}`;
  }
  const [firstX, secondX] = coordinate(points, 0);
  const [firstY, secondY] = coordinate(points, 1);
  for (let i = 0; i < points.length - 1; i++) {
    d += `C${firstX[i]} ${firstY[i]} ${secondX[i]} ${secondY[i]} ${points[i + 1][0]} ${points[i + 1][1]}`;
  }
  return d;
}
