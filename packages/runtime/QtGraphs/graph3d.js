// A graph in space: what Surface3D, Bars3D and Scatter3D have in common. It
// is a View3D whose scene the graph makes itself: a camera that goes about
// the middle of it, a light that shines from where the camera is, the walls
// behind the data with the lines of the axes on them, the labels of the
// axes, and what its series show.
//
// A kind of graph says where its data is (`$plot`) and what is drawn of it
// (`$shown`); the sizes are Qt's, in a space whose tallest side is 2.
//
// Not here: shadows, turning and zooming with the mouse, selecting by it and
// the label of what is selected, `polar`, custom items, the camera's target,
// gradients and slicing.
import { runWithOwner } from "solid-js";
import { defineType, derived, effect, inside, settle, slot } from "../object.js";
import { Point, Vector3d } from "../QtQml/values.js";
import { colorValue, css, rgba } from "../QtQuick/color.js";
import { advance, describe, fonts, metrics } from "../QtQuick/font.js";
import { kept, Node } from "../QtQuick3D/Node.js";
import { DefaultMaterial, DirectionalLight, linear, Model, OrthographicCamera, PerspectiveCamera, PrincipledMaterial, SceneEnvironment, Texture } from "../QtQuick3D/scene.js";
import { View3D } from "../QtQuick3D/View3D.js";
import { series3d } from "./data3d.js";
import { facing, lines, shaping, sign } from "./shapes3d.js";
import { GraphsTheme } from "./theme.js";
import { untrack } from "#kernel";

const next = (version) => version + 1;
const NONE = Object.freeze([]);
const list = (value) => (value == null ? NONE : Array.isArray(value) ? value : [value]);

// Where the camera is for each `cameraPreset`: how far round and how far up.
const PRESETS = [
  null,
  [0, 0],
  [0, 22.5],
  [0, 45],
  [90, 0],
  [90, 22.5],
  [90, 45],
  [-90, 0],
  [-90, 22.5],
  [-90, 45],
  [180, 0],
  [180, 22.5],
  [180, 45],
  [45, 22.5],
  [45, 45],
  [-45, 22.5],
  [-45, 45],
  [0, 90],
  [-45, 90],
  [45, 90],
  [0, -45],
  [90, -45],
  [-90, -45],
  [180, -45],
  [0, -90],
];

// What the `Graphs3D` namespace names, which a graph's own properties are
// said in.
export const Graphs3D = Object.freeze({
  // SelectionFlag
  None: 0,
  Item: 1,
  Row: 2,
  ItemAndRow: 3,
  Column: 4,
  ItemAndColumn: 5,
  RowAndColumn: 6,
  ItemRowAndColumn: 7,
  Slice: 8,
  MultiSeries: 16,
  // ShadowQuality
  Low: 1,
  Medium: 2,
  High: 3,
  SoftLow: 4,
  SoftMedium: 5,
  SoftHigh: 6,
  // ElementType
  Series: 1,
  AxisXLabel: 2,
  AxisYLabel: 3,
  AxisZLabel: 4,
  CustomItem: 5,
  // OptimizationHint
  Default: 0,
  Legacy: 1,
  // RenderingMode
  DirectToBackground: 0,
  Indirect: 1,
  // CameraPreset
  NoPreset: 0,
  FrontLow: 1,
  Front: 2,
  FrontHigh: 3,
  LeftLow: 4,
  Left: 5,
  LeftHigh: 6,
  RightLow: 7,
  Right: 8,
  RightHigh: 9,
  BehindLow: 10,
  Behind: 11,
  BehindHigh: 12,
  IsometricLeft: 13,
  IsometricLeftHigh: 14,
  IsometricRight: 15,
  IsometricRightHigh: 16,
  DirectlyAbove: 17,
  DirectlyAboveCW45: 18,
  DirectlyAboveCCW45: 19,
  FrontBelow: 20,
  LeftBelow: 21,
  RightBelow: 22,
  BehindBelow: 23,
  DirectlyBelow: 24,
  // GridLineType
  Shader: 0,
  Geometry: 1,
  // TransparencyTechnique
  Approximate: 1,
  Accurate: 2,
});

// An angle of the camera kept between two others: past one it comes round
// from the other when it `wraps`, and else it stops there.
function turned(angle, least, most, wraps) {
  angle = Number(angle) || 0;
  if (!wraps || !(most > least)) return Math.max(least, Math.min(most, angle));
  const round = most - least;
  while (angle < least) angle += round;
  while (angle > most) angle -= round;
  return angle;
}

// Which walls are behind the data as the camera sees it: the one at the
// side is to the right once the camera is to the left, the one at the back
// in front once it is behind, and the floor above once it is below. A floor
// that bars stand on stays under them, and is seen from below.
export function flips(self) {
  const round = self.cameraXRotation;
  return { x: round > 0, y: !self.$plot().floored && self.cameraYRotation < 0, z: Math.abs(round) > 90 };
}

// How much of the series' own colour they show where no light falls. Qt
// leaves it out while `ambientLightStrength` is as a graph starts with it.
export function ambient(self) {
  const strength = self.ambientLightStrength;
  if (strength === 0.25) return 0;
  const share = Math.max(0, Math.min(1, strength));
  return linear(rgba(share, share, share))[0];
}

// A colour in linear light, as a corner of a shape has one.
export const lit = (value, by = 1) => {
  const [r, g, b] = linear(value);
  return [r * by, g * by, b * by, 1];
};

// ---------------------------------------------------------------- axes

// Where along a value axis its lines and labels are, each from 0 at its
// least to 1 at its most: a line and a label at each end of each segment,
// and lines between for the segments' own.
export function measured(axis) {
  const { segmentCount: count, subSegmentCount: within, labels, reversed } = axis;
  const along = (t) => (reversed ? 1 - t : t);
  const marks = [];
  for (let at = 0; at <= count; at++) {
    marks.push({ t: along(at / count), sub: false });
    if (at < count) for (let part = 1; part < within; part++) marks.push({ t: along((at + part / within) / count), sub: true });
  }
  return { axis, marks, labels: labels.map((text, at) => ({ t: along(at / count), text })) };
}

// And along an axis of so many rows or columns: a line between each two and
// a label at the middle of each. Their lines are on the floor alone.
export function named(axis, count) {
  const { labels } = axis;
  const cells = Math.max(1, count);
  const marks = Array.from({ length: cells + 1 }, (_, at) => ({ t: at / cells, sub: false }));
  return { axis, marks, floor: true, labels: Array.from({ length: count }, (_, at) => ({ t: (at + 0.5) / cells, text: String(labels[at] ?? "") })) };
}

// ---------------------------------------------------------------- shapes

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// A wall: four corners in turn, facing `normal` whichever way they turn.
function wall(shape, a, b, c, d, normal) {
  if (dot(facing(a, b, c), normal) < 0) shape.quad(a, d, c, b, normal);
  else shape.quad(a, b, c, d, normal);
}

// The three walls behind the data.
function walls(self) {
  const [x, y, z] = self.$plot().wall;
  const flip = flips(self);
  const floor = flip.y ? y : -y;
  const back = flip.z ? z : -z;
  const side = flip.x ? x : -x;
  const shape = shaping();
  wall(shape, [-x, floor, -z], [x, floor, -z], [x, floor, z], [-x, floor, z], [0, flip.y ? -1 : 1, 0]);
  wall(shape, [-x, -y, back], [x, -y, back], [x, y, back], [-x, y, back], [0, 0, flip.z ? -1 : 1]);
  wall(shape, [side, -y, -z], [side, -y, z], [side, y, z], [side, y, -z], [flip.x ? -1 : 1, 0, 0]);
  return shape.mesh().mesh;
}

// How far in front of a wall its lines are, to be seen on it.
const LIFT = 0.002;

// The lines of the axes on the walls: one of each axis' on each of the two
// walls the axis runs along, or on the floor alone for the rows and the
// columns of bars.
function grid(self) {
  const plot = self.$plot();
  const [x, y, z] = plot.wall;
  const flip = flips(self);
  // The lines of a floor that is seen from below are below it.
  const under = flip.y || (plot.floored && self.cameraYRotation < 0);
  const floor = (flip.y ? y : -y) + (under ? -LIFT : LIFT);
  const back = (flip.z ? z : -z) + (flip.z ? -LIFT : LIFT);
  const side = (flip.x ? x : -x) + (flip.x ? -LIFT : LIFT);
  const { mainColor, subColor } = self.theme.grid;
  const main = lit(mainColor);
  const sub = lit(subColor);
  const shape = lines();
  for (const { t, sub: lesser } of plot.x.marks) {
    const at = plot.place(0, t);
    const colour = lesser ? sub : main;
    shape.line([at, floor, -z], [at, floor, z], colour);
    if (!plot.x.floor) shape.line([at, -y, back], [at, y, back], colour);
  }
  for (const { t, sub: lesser } of plot.y.marks) {
    const at = plot.place(1, t);
    const colour = lesser ? sub : main;
    shape.line([-x, at, back], [x, at, back], colour);
    shape.line([side, at, -z], [side, at, z], colour);
  }
  for (const { t, sub: lesser } of plot.z.marks) {
    const at = plot.place(2, t);
    const colour = lesser ? sub : main;
    shape.line([-x, floor, at], [x, floor, at], colour);
    if (!plot.z.floor) shape.line([side, -y, at], [side, y, at], colour);
  }
  return shape.mesh().mesh;
}

// ---------------------------------------------------------------- labels

// How tall a label is in the graph's space for each point of its font, and
// how far from a wall its middle is for its width, as Qt's are measured.
const TALL = 0.0072;
const OUT = 0.565;
const WIDEST = 2048;

// How many of the view's pixels one of the graph's own lengths is, at the
// middle of the graph.
function scale(self) {
  const zoom = self.cameraZoomLevel;
  if (self.orthoProjection) return (zoom / 100) * Math.min(self.width / 6.4, self.height / 4);
  return (self.height * zoom) / (1440 * Math.tan(Math.PI / 8));
}

// The labels of the axes and their titles, each a square in space with its
// text on it: `{ text, box, middle, across, up }`, where `box` is how wide
// the label is in its font's pixels and `across` and `up` are half of it.
function labelled(self, spec) {
  const plot = self.$plot();
  const theme = self.theme;
  const [x, y, z] = plot.wall;
  const flip = flips(self);
  const points = theme.labelFont.pointSize;
  const pad = points / 2;
  const line = metrics(spec).height + pad;
  const margin = self.labelMargin;
  const floor = flip.y ? y : -y;
  const back = flip.z ? z : -z;
  const side = flip.x ? x : -x;
  // Where the wall at the back ends and where the one at the side does: the
  // labels are beyond them.
  const open = flip.x ? -1 : 1;
  const front = flip.z ? -1 : 1;
  const lifted = flip.y ? [0, -1, 0] : [0, 1, 0];
  // Along the floor a label is read from the left as the camera sees it.
  const deep = flip.x ? 1 : -1;
  const made = [];

  const sized = (axis, texts) => {
    const tall = TALL * points * axis.labelSize;
    const box = Math.round(Math.max(0, ...texts.map((text) => advance(spec, text)))) + pad;
    return { tall, box, wide: (tall * box) / line };
  };
  const put = (text, size, middle, across, up) => {
    const half = (way, length) => way.map((part) => (part * length) / 2);
    made.push({ text, box: size.box, middle, across: half(across, size.wide), up: half(up, size.tall) });
  };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const flat = (across) => cross(lifted, across);
  const shown = (axis) => axis && axis.labelsVisible && theme.labelsVisible;
  const titled = (axis) => axis && axis.titleVisible && theme.labelsVisible && axis.title !== "";

  // How far beyond a wall the far side of an axis' labels is.
  const beyond = { x: margin, y: margin, z: margin };

  const across = plot.x;
  if (shown(across.axis)) {
    const size = sized(across.axis, across.labels.map((label) => label.text));
    const way = [0, 0, deep];
    for (const { t, text } of across.labels) put(text, size, [plot.place(0, t), floor, front * (z + margin + OUT * size.wide)], way, flat(way));
    beyond.x = margin + 2 * OUT * size.wide;
  }
  const up = plot.y;
  if (shown(up.axis)) {
    const size = sized(up.axis, up.labels.map((label) => label.text));
    for (const { t, text } of up.labels) {
      const at = plot.place(1, t);
      put(text, size, [open * (x + margin + OUT * size.wide), at, back], [front, 0, 0], [0, 1, 0]);
      put(text, size, [side, at, front * (z + margin + OUT * size.wide)], [0, 0, deep], [0, 1, 0]);
    }
    beyond.y = margin + 2 * OUT * size.wide;
  }
  const along = plot.z;
  if (shown(along.axis)) {
    const size = sized(along.axis, along.labels.map((label) => label.text));
    const way = [front, 0, 0];
    for (const { t, text } of along.labels) put(text, size, [open * (x + margin + OUT * size.wide), floor, plot.place(2, t)], way, flat(way));
    beyond.z = margin + 2 * OUT * size.wide;
  }

  // A title is beyond the labels of its axis, at the middle of it, and reads
  // along it.
  if (titled(across.axis)) {
    const size = sized(across.axis, [across.axis.title]);
    const way = [front, 0, 0];
    put(across.axis.title, size, [0, floor, front * (z + beyond.x + margin + size.tall / 2)], way, flat(way));
  }
  if (titled(along.axis)) {
    const size = sized(along.axis, [along.axis.title]);
    const way = [0, 0, deep];
    put(along.axis.title, size, [open * (x + beyond.z + margin + size.tall / 2), floor, 0], way, flat(way));
  }
  // That of the axis that stands is with its labels to the left: those at
  // the back wall or those at the side, as the camera sees them.
  if (titled(up.axis)) {
    const size = sized(up.axis, [up.axis.title]);
    const out = beyond.y + margin + size.tall / 2;
    if (flip.x !== flip.z) put(up.axis.title, size, [open * (x + out), 0, back], [0, 1, 0], [-front, 0, 0]);
    else put(up.axis.title, size, [side, 0, front * (z + out)], [0, 1, 0], [0, 0, -deep]);
  }
  return made;
}

// Writes the labels on a canvas, each text of each width once, and makes
// the squares they are seen on.
function written(self, canvas) {
  // A font that came since is measured again.
  fonts();
  const theme = self.theme;
  const spec = describe(theme.labelFont);
  const all = labelled(self, spec);
  if (!all.length) return { mesh: null, canvas };
  const { ascent, height } = metrics(spec);
  const pad = theme.labelFont.pointSize / 2;
  // A label is written as big as it is seen, for its text to be as sharp
  // as Qt's is: a little bigger, as what is nearer the camera is.
  const sharp = Math.max(0.25, Math.min(4, (1.25 * scale(self) * TALL * theme.labelFont.pointSize) / (height + pad)));
  const tall = Math.ceil((height + pad) * sharp);
  // Where each is on the canvas, row after row.
  const cells = new Map();
  let x = 0;
  let y = 0;
  for (const { text, box } of all) {
    const key = `${box} ${text}`;
    if (cells.has(key)) continue;
    const wide = Math.ceil(box * sharp);
    if (x && x + wide > WIDEST) {
      x = 0;
      y += tall + 2;
    }
    cells.set(key, { x, y, wide, text, box });
    x += wide + 2;
  }
  const width = Math.max(1, ...[...cells.values()].map((cell) => cell.x + cell.wide));
  const total = y + tall;
  canvas.width = width;
  canvas.height = total;
  const paper = canvas.getContext("2d");
  const ink = css(theme.labelTextColor);
  for (const cell of cells.values()) {
    paper.setTransform(sharp, 0, 0, sharp, cell.x, cell.y);
    const high = height + pad;
    if (theme.labelBackgroundVisible) {
      paper.fillStyle = css(theme.labelBackgroundColor);
      paper.fillRect(0, 0, cell.box, high);
    }
    if (theme.labelBorderVisible) {
      paper.strokeStyle = ink;
      paper.lineWidth = 1;
      paper.strokeRect(0.5, 0.5, cell.box - 1, high - 1);
    }
    paper.font = spec.css;
    paper.fillStyle = ink;
    paper.textBaseline = "alphabetic";
    paper.fillText(cell.text, (cell.box - advance(spec, cell.text)) / 2, (high - height) / 2 + ascent);
  }
  const shape = shaping();
  for (const { text, box, middle, across, up } of all) {
    const cell = cells.get(`${box} ${text}`);
    sign(shape, middle, across, up, [cell.x / width, 1 - (cell.y + tall) / total, (cell.x + cell.wide) / width, 1 - cell.y / total]);
  }
  return { mesh: shape.mesh().mesh, canvas };
}

// ---------------------------------------------------------------- the graph

// An end of the range the camera may be zoomed in. Qt holds the zoom to it
// when the end is assigned, and not when the zoom is.
const limit = (name, other, least) => ({
  get() {
    return slot(this, name).get();
  },
  set(value) {
    value = Number(value);
    if (!(value >= 1)) return;
    const held = untrack(() => this[other]);
    slot(this, name).write(value);
    if (least ? held < value : held > value) slot(this, other).write(value);
    const zoom = untrack(() => this.cameraZoomLevel);
    if (least ? zoom < value : zoom > value) slot(this, "cameraZoomLevel").write(value);
    settle();
  },
  enumerable: true,
  configurable: true,
});

export const GraphsItem3D = defineType("GraphsItem3D", View3D, {
  properties: {
    theme: null,
    seriesList: NONE,
    selectionMode: Graphs3D.Item,
    shadowQuality: Graphs3D.Medium,
    shadowStrength: 25,
    msaaSamples: 4,
    renderingMode: Graphs3D.Indirect,
    transparencyTechnique: Graphs3D.Default,
    measureFps: false,
    currentFps: -1,
    customItemList: NONE,
    orthoProjection: false,
    selectedElement: Graphs3D.None,
    // How many times as wide as it is tall the graph is, and how many times
    // as wide as it is deep: as the data's ranges are, when 0.
    aspectRatio: 2,
    horizontalAspectRatio: 0,
    optimizationHint: Graphs3D.Default,
    polar: false,
    labelMargin: Math.fround(0.1),
    radialLabelOffset: 1,
    locale: undefined,
    queriedGraphPosition: new Vector3d(0, 0, 0),
    // How far the walls are from the data: as the graph sees fit below 0.
    margin: -1,
    cutoffMargin: 0,
    // Where the camera is: how far round the graph to the left, how far up
    // and how near.
    cameraPreset: Graphs3D.NoPreset,
    cameraXRotation: derived((self) => PRESETS[self.cameraPreset]?.[0] ?? 0),
    cameraYRotation: derived((self) => PRESETS[self.cameraPreset]?.[1] ?? 0),
    minCameraXRotation: -180,
    maxCameraXRotation: 180,
    minCameraYRotation: 0,
    maxCameraYRotation: 90,
    cameraZoomLevel: 100,
    minCameraZoomLevel: 10,
    maxCameraZoomLevel: 500,
    cameraTargetPosition: new Vector3d(0, 0, 0),
    wrapCameraXRotation: true,
    wrapCameraYRotation: false,
    rotationEnabled: true,
    zoomEnabled: true,
    zoomAtTargetEnabled: true,
    selectionEnabled: true,
    lightColor: "#ffffff",
    ambientLightStrength: 0.25,
    lightStrength: 5,
    gridLineType: Graphs3D.Geometry,
    rootNode: derived((self) => self.$scene),
  },
  enums: Graphs3D,
  resolve: {
    seriesList: (self) => self.$series(),
    lightColor: colorValue,
    labelMargin: (self, own) => Math.fround(own()),
    // An angle the camera is given is held to its limits; one a preset has
    // is not, as Qt's is not: `DirectlyBelow` is below the least.
    cameraXRotation: (self, own) => (slot(self, "cameraXRotation").explicit() ? turned(own(), self.minCameraXRotation, self.maxCameraXRotation, self.wrapCameraXRotation) : own()),
    cameraYRotation: (self, own) => (slot(self, "cameraYRotation").explicit() ? turned(own(), self.minCameraYRotation, self.maxCameraYRotation, self.wrapCameraYRotation) : own()),
  },
  methods: Object.defineProperties(
    {
      addSeries(series) {
        this.$insert(Infinity, series);
      },
      removeSeries(series) {
        const index = this.$added.indexOf(series);
        if (index >= 0) this.$added.splice(index, 1);
        else this.$removed.add(series);
        this.$touch(next);
        settle();
      },
      hasSeries(series) {
        return this.$series().includes(series);
      },
      clearSelection() {
        for (const series of untrack(() => this.$series())) {
          if ("selectedItem" in series) slot(series, "selectedItem").write(-1);
          if ("selectedBar" in series) slot(series, "selectedBar").write(new Point(-1, -1));
          if ("selectedPoint" in series) slot(series, "selectedPoint").write(new Point(-1, -1));
        }
        this.$select?.(null);
        settle();
      },
      doPicking() {},
      doRayPicking() {},
    },
    {
      // A preset puts the camera where it says, wherever it was put before.
      cameraPreset: {
        get() {
          return slot(this, "cameraPreset").get();
        },
        set(value) {
          slot(this, "cameraPreset").write(value);
          if (PRESETS[value]) {
            slot(this, "cameraXRotation").reset();
            slot(this, "cameraYRotation").reset();
          }
          settle();
        },
        enumerable: true,
        configurable: true,
      },
      minCameraZoomLevel: limit("minCameraZoomLevel", "maxCameraZoomLevel", true),
      maxCameraZoomLevel: limit("maxCameraZoomLevel", "minCameraZoomLevel", false),
    },
  ),
  setup(self, props) {
    const make = (above, Type, given) => inside(above, () => untrack(() => Type(given)));
    if (!("theme" in props)) slot(self, "theme").provide(make(self, GraphsTheme, {}));

    // The series: those the graph was given, those declared in it and those
    // added to it since, without those taken out.
    self.$takes = series3d;
    self.$declared = NONE;
    self.$added = [];
    self.$removed = new Set();
    self.$placed = NONE;
    self.$series = kept(self, () => {
      self.$track();
      const given = list(slot(self, "seriesList").asked());
      const all = [...given, ...self.$declared, ...self.$added].filter((series) => self.$takes(series) && !self.$removed.has(series));
      // Those that were put somewhere are where they were put.
      return [...new Set([...self.$placed.filter((series) => all.includes(series)), ...all])];
    });
    // Puts a series among the graph's, before the one that is at `index`;
    // one that is the graph's already goes there from where it was.
    self.$insert = (index, series) => {
      const had = untrack(() => self.$series());
      if (!self.$takes(series)) return;
      const all = had.filter((other) => other !== series);
      const from = had.indexOf(series);
      all.splice(Math.max(0, from >= 0 && from < index ? index - 1 : index), 0, series);
      self.$removed.delete(series);
      if (!self.$added.includes(series)) self.$added.push(series);
      self.$placed = all;
      self.$touch(next);
      settle();
    };
    // Qt draws no shadows where things far away are as big as those near,
    // and does not draw them again when they are not.
    effect(
      () => self.orthoProjection,
      (flat) => {
        if (!flat) return;
        slot(self, "shadowQuality").write(Graphs3D.None);
        settle();
      },
    );
    // Each is told the graph it is in, and one that is in it no more that
    // it is in none.
    let told = NONE;
    effect(
      () => self.$series(),
      (all) => {
        for (const series of told) if (!all.includes(series)) series.$tell(null);
        all.forEach((series, index) => series.$tell({ graph: self, index }));
        told = all;
      },
    );

    // The camera goes about the middle of the graph, and the light with it.
    const rig = make(self, Node, {
      get eulerRotation$x() {
        return -self.cameraYRotation;
      },
      get eulerRotation$y() {
        return -self.cameraXRotation;
      },
    });
    const far = () => 720 / Math.max(1, self.cameraZoomLevel);
    rig.$add(
      make(rig, PerspectiveCamera, {
        fieldOfView: 45,
        clipNear: 0.1,
        clipFar: 100,
        get z() {
          return far();
        },
        get visible() {
          return !self.orthoProjection;
        },
      }),
    );
    // Seen without depth, the graph is as big as the view's shorter side
    // lets it be.
    const magnified = () => self.cameraZoomLevel * Math.min(self.width / 640, self.height / 400);
    rig.$add(
      make(rig, OrthographicCamera, {
        clipNear: 0.1,
        clipFar: 100,
        get z() {
          return far();
        },
        get horizontalMagnification() {
          return magnified();
        },
        get verticalMagnification() {
          return magnified();
        },
        get visible() {
          return self.orthoProjection;
        },
      }),
    );
    rig.$add(
      make(rig, DirectionalLight, {
        get color() {
          return self.lightColor;
        },
        get brightness() {
          return self.lightStrength * 0.2;
        },
      }),
    );

    slot(self, "environment").provide(
      make(self, SceneEnvironment, {
        antialiasingMode: 2,
        get antialiasingQuality() {
          return self.msaaSamples;
        },
        get backgroundMode() {
          return self.theme.backgroundVisible ? 2 : 0;
        },
        get clearColor() {
          return self.theme.backgroundColor;
        },
      }),
    );

    // A model of a shape made here: its geometry is whatever says what
    // the shape is.
    const drawn = (shape, given) => make(self, Model, Object.defineProperty(given, "geometry", { value: { $shape: shape }, enumerable: true }));

    const background = kept(self, () => walls(self));
    const paint = make(self, PrincipledMaterial, {
      roughness: 0.3,
      cullMode: 3,
      get baseColor() {
        return self.theme.plotAreaBackgroundColor;
      },
      get emissiveFactor() {
        const [r, g, b] = linear(self.theme.plotAreaBackgroundColor);
        const glow = 0.3 + ambient(self);
        return new Vector3d(r * glow, g * glow, b * glow);
      },
    });
    const lined = kept(self, () => grid(self));
    const plain = make(self, DefaultMaterial, { lighting: 0, vertexColorsEnabled: true });

    const canvas = document.createElement("canvas");
    const labels = kept(self, () => written(self, canvas));
    const picture = make(self, Texture, {
      // A canvas is a picture as an item's is.
      get sourceItem() {
        return { $canvas: { element: labels().canvas } };
      },
      tilingModeHorizontal: 1,
      tilingModeVertical: 1,
    });
    const text = make(self, PrincipledMaterial, {
      lighting: 0,
      cullMode: 3,
      baseColorMap: picture,
      // What is behind a label is seen only where the label has no ground.
      get alphaMode() {
        return self.theme.labelBackgroundVisible ? 3 : 2;
      },
    });

    // What the series show, each part of it with a paint of its own: how
    // much it glows of itself, how much of a light it gives back, and
    // whether it is seen from behind.
    const paints = [];
    // The spot of light on it is the light's colour, whatever its own is.
    const glinting = (material) => {
      const described = material.$material;
      material.$material = () => ({ ...described(), glint: true });
      return material;
    };
    const painted = (index) =>
      (paints[index] ??= runWithOwner(self.$owner, () =>
        glinting(make(self, DefaultMaterial, {
          vertexColorsEnabled: true,
          // As tight a spot of light as Qt's graphs have.
          specularRoughness: 2.56 / 75 - 0.01,
          get emissiveFactor() {
            const [r, g, b] = self.$shown().paints[index]?.glow ?? [0, 0, 0];
            return new Vector3d(r, g, b);
          },
          get specularAmount() {
            return self.$shown().paints[index]?.shine ?? 0;
          },
          get cullMode() {
            return self.$shown().paints[index]?.sided ? 3 : 1;
          },
        })),
      ));

    const scene = [
      drawn(() => background(), {
        materials: [paint],
        get visible() {
          return self.theme.plotAreaBackgroundVisible;
        },
      }),
      drawn(() => lined(), {
        materials: [plain],
        get visible() {
          return self.theme.gridVisible;
        },
      }),
      drawn(() => labels().mesh, { materials: [text] }),
      drawn(() => self.$shown().mesh, {
        get materials() {
          return self.$shown().paints.map((_, index) => painted(index));
        },
      }),
    ];
    self.$extra = [rig, ...scene];
  },
  // A series declared inside a graph is the graph's.
  adopt(self, props) {
    View3D.adopt(self, props);
    self.$declared = self.$static.filter(series3d);
    self.$touch(next);
  },
});

// ---------------------------------------------------------------- ranges

// The least and the most of some numbers, as a range an axis can have: a
// range of nothing is `none`, and one of a single number goes `around` it.
export function spread(numbers, none, around = 1) {
  let least = Infinity;
  let most = -Infinity;
  for (const number of numbers) {
    if (number < least) least = number;
    if (number > most) most = number;
  }
  if (least > most) return none;
  if (least === most) return [least - around, most + around];
  return [least, most];
}

// Tells each axis which way it goes in the graph and what the data along
// it is, and an axis that is the graph's no more that it is in none.
export function axes(self, names, told) {
  const had = {};
  effect(
    () => names.map((name) => self[name]),
    (all) => {
      names.forEach((name, index) => {
        const axis = all[index];
        if (had[name] && had[name] !== axis && !all.includes(had[name])) had[name].$tell(null);
        had[name] = axis;
        axis?.$tell(told[name]);
      });
    },
  );
}

// ---------------------------------------------------------------- values

const X = 1;
const Y = 2;
const Z = 3;

// The least and the most of points in space each way: nothing each way
// when there are none.
function reach(points) {
  const least = [Infinity, Infinity, Infinity];
  const most = [-Infinity, -Infinity, -Infinity];
  for (const { x, y, z } of points) {
    [x, y, z].forEach((value, way) => {
      if (value < least[way]) least[way] = value;
      if (value > most[way]) most[way] = value;
    });
  }
  return least.map((value, way) => (value > most[way] ? [0, 0] : [value, most[way]]));
}

// A graph of points in space has three value axes, its own until it is
// given others, which follow what `points()` says the points are.
export function valued(self, props, Axis, points) {
  for (const name of ["axisX", "axisY", "axisZ"]) {
    if (!(name in props)) slot(self, name).provide(inside(self, () => untrack(() => Axis({}))));
  }
  const data = kept(self, () => reach(points()));
  // Points that are all at one place across or in depth are given a
  // twentieth of the other way's range to each side: the data's when that
  // axis follows it, and else the axis' own.
  const floor = (way, other, axis) => () => {
    const [least, most] = data()[way];
    if (least !== most) return [least, most];
    const beside = self[axis];
    const [from, to] = !beside || beside.autoAdjustRange ? data()[other] : [beside.min, beside.max];
    const around = Math.abs(to - from) / 20 || 1;
    return [least - around, most + around];
  };
  axes(self, ["axisX", "axisY", "axisZ"], {
    axisX: { orientation: X, range: floor(0, 2, "axisZ"), labels: () => NONE },
    axisY: { orientation: Y, range: () => spread(data()[1], [-1, 1]), labels: () => NONE },
    axisZ: { orientation: Z, range: floor(2, 0, "axisX"), labels: () => NONE },
  });
  // The graph is twice as wide as it is tall along the longer of its ranges
  // on the floor, and the other is to it as the ranges are to each other.
  self.$plot = kept(self, () => {
    const { axisX, axisY, axisZ } = self;
    const ratio = self.horizontalAspectRatio || (axisX.max - axisX.min) / (axisZ.max - axisZ.min) || 1;
    const long = self.aspectRatio;
    const half = ratio >= 1 ? [long, 1, long / ratio] : [long * ratio, 1, long];
    const margin = self.margin < 0 ? 0.1 : self.margin;
    const along = (axis, value) => {
      const t = (value - axis.min) / (axis.max - axis.min);
      return axis.reversed ? 1 - t : t;
    };
    const place = (way, t) => (way === 2 ? half[2] - 2 * half[2] * t : 2 * half[way] * t - half[way]);
    return {
      wall: half.map((length) => length + margin),
      place,
      // Where a point of the data is, and whether it is within the axes.
      point: ({ x, y, z }) => [place(0, along(axisX, x)), place(1, along(axisY, y)), place(2, along(axisZ, z))],
      within: ({ x, y, z }) => x >= axisX.min && x <= axisX.max && y >= axisY.min && y <= axisY.max && z >= axisZ.min && z <= axisZ.max,
      x: measured(axisX),
      y: measured(axisY),
      z: measured(axisZ),
    };
  });
}
