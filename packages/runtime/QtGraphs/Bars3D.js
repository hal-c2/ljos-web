// Bars3D: a graph of bars in rows and columns, as tall as their values.
//
// The rows go from the front to the back and the columns from the left to
// the right, each bar in a cell of its own; the bars of several series
// stand side by side in a cell.
//
// Not here: the other shapes a bar can be drawn as (`mesh`: Qt's own has
// its edges cut, and this one has not), turning each (`meshAngle`), and
// what is selected.
import { defineType, group, inside, settle, slot } from "../object.js";
import { kept } from "../QtQuick3D/Node.js";
import { linear } from "../QtQuick3D/scene.js";
import { Category3DAxis, Value3DAxis } from "./axes3d.js";
import { Bar3DSeries } from "./data3d.js";
import { axes, GraphsItem3D, measured, named } from "./graph3d.js";
import { box, shaping } from "./shapes3d.js";
import { untrack } from "#kernel";

const is = (object, Type) => object?.$type?.chain.includes(Type) === true;
const NONE = Object.freeze([]);

const X = 1;
const Y = 2;
const Z = 3;

// How far beyond the bars' cells the walls behind them go, and how far
// above where its value is on the axis a bar stands, as Qt's do.
const EDGE = 1 / 75;

const rows = (series) => series.dataProxy?.$data().rows ?? NONE;

// How many rows and columns the series that are shown have between them.
function counted(self) {
  let deep = 0;
  let wide = 0;
  for (const series of self.$series()) {
    if (!series.visible) continue;
    const all = rows(series);
    deep = Math.max(deep, all.length);
    for (const row of all) wide = Math.max(wide, row.length);
  }
  return { rows: deep, columns: wide };
}

// Where the bars are. A cell is as wide as a bar and the room about it, the
// longer side of the floor is 4 and the other is to it as the cells of the
// rows are to those of the columns. QQuickGraphsBars::calculateSceneScalingFactors.
function laid(self) {
  const { rowAxis, columnAxis, valueAxis } = self;
  // The rows and columns the axes say are shown.
  const first = { row: Math.round(rowAxis.min), column: Math.round(columnAxis.min) };
  const deep = Math.max(1, Math.round(rowAxis.max) - first.row + 1);
  const wide = Math.max(1, Math.round(columnAxis.max) - first.column + 1);
  const thick = { width: 1, height: 1 / self.barThickness };
  const { width: between, height: behind } = self.barSpacing;
  const relative = self.barSpacingRelative;
  const cell = {
    width: relative ? 2 * thick.width * (between + 1) : 2 * thick.width + 2 * between,
    height: relative ? 2 * thick.height * (behind + 1) : 2 * thick.height + 2 * behind,
  };
  const across = (wide * cell.width) / 2;
  const depth = (deep * cell.height) / 2;
  const longest = Math.max(across, depth);
  const half = [(2 * across) / longest, 1, (2 * depth) / longest];
  const place = (way, t) => (way === 2 ? half[2] - 2 * half[2] * t : 2 * half[way] * t - half[way]);
  const { min, max } = valueAxis;
  // The bars stand on `floorLevel`, or on the end of the axis nearest it.
  // One that is beyond the other end goes on past the walls, as Qt's does,
  // and one that is beyond the floor's own end is not there.
  const floor = Math.max(min, Math.min(max, self.floorLevel));
  const tall = (value) => {
    if (min >= floor) value = Math.max(floor, value);
    else if (max <= floor) value = Math.min(floor, value);
    const t = (value - min) / (max - min);
    return place(1, valueAxis.reversed ? 1 - t : t);
  };
  return {
    wall: half.map((length) => length + EDGE),
    floor: tall(floor),
    floored: true,
    place,
    first,
    rows: deep,
    columns: wide,
    tall,
    // Half of how wide and how deep a bar is.
    bar: [(thick.width * 2) / longest, (thick.height * 2) / longest],
    x: named(columnAxis, wide),
    y: measured(valueAxis),
    z: named(rowAxis, deep),
  };
}

// Every bar as one shape. A bar shows three quarters of its colour of
// itself and as much again where the light falls on it, whatever the
// graph's `ambientLightStrength` is: Qt's bars do not take it.
function bars(self) {
  const plot = self.$plot();
  const shown = self.$series().filter((series) => series.visible);
  const [wide, deep] = plot.bar;
  const floor = plot.floor;
  // Those of several series share a cell's width, and its depth as well
  // when they are to keep their shape.
  const share = Math.max(1, shown.length);
  const narrow = wide / share;
  const shallow = self.multiSeriesUniform ? deep / share : deep;
  const shape = shaping();
  shown.forEach((series, which) => {
    const all = rows(series);
    const colours = series.rowColors;
    const paint = (value) => {
      const [r, g, b] = linear(value).map((part) => (part / Math.sqrt(3)) * 0.75);
      return { colour: [r, g, b, 1], paint: { glow: [r, g, b], shine: 0.25, sided: false } };
    };
    const own = paint(series.baseColor);
    for (let row = 0; row < plot.rows; row++) {
      const values = all[row + plot.first.row];
      if (!values) continue;
      const lit = colours.length ? paint(colours[(row + plot.first.row) % colours.length].color) : own;
      const z = plot.place(2, (row + 0.5) / plot.rows);
      for (let column = 0; column < plot.columns; column++) {
        const value = values[column + plot.first.column];
        if (value === undefined) continue;
        const top = plot.tall(value);
        if (top === floor) continue;
        const x = plot.place(0, (column + 0.5) / plot.columns) + (which - (share - 1) / 2) * 2 * narrow;
        box(shape, [x - narrow, Math.min(floor, top) + EDGE, z - shallow], [x + narrow, Math.max(floor, top) + EDGE, z + shallow], lit.colour, top > floor ? -1 : 1);
      }
      if (colours.length) shape.part(lit.paint);
    }
    shape.part(own.paint);
  });
  return shape.mesh();
}

export const Bars3D = defineType("Bars3D", GraphsItem3D, {
  properties: {
    rowAxis: null,
    valueAxis: null,
    columnAxis: null,
    multiSeriesUniform: false,
    // How deep a bar is to how wide it is, and how much room there is
    // between two: so many bars' widths when `barSpacingRelative`.
    barThickness: 1,
    barSpacing: group({ width: 1, height: 1 }),
    barSpacingRelative: true,
    barSeriesMargin: group({ width: 0, height: 0 }),
    // The value the bars stand on.
    floorLevel: 0,
    // The series whose rows and columns name the axes: the first, until
    // another of the graph's is said to be.
    primarySeries: null,
    selectedSeries: null,
  },
  resolve: {
    primarySeries: (self, own) => {
      const all = self.$series();
      const asked = own();
      return all.includes(asked) ? asked : (all[0] ?? null);
    },
    selectedSeries: (self) => self.$series().find((series) => series.selectedBar.x >= 0 && series.selectedBar.y >= 0) ?? null,
  },
  methods: {
    insertSeries(index, series) {
      this.$insert(index, series);
    },
  },
  setup(self, props) {
    self.$takes = (series) => is(series, Bar3DSeries);
    const make = (Type) => inside(self, () => untrack(() => Type({})));
    if (!("rowAxis" in props)) slot(self, "rowAxis").provide(make(Category3DAxis));
    if (!("columnAxis" in props)) slot(self, "columnAxis").provide(make(Category3DAxis));
    if (!("valueAxis" in props)) slot(self, "valueAxis").provide(make(Value3DAxis));

    const count = kept(self, () => counted(self));
    // The values go from nothing to the greatest, or from the least when
    // some are less than nothing.
    const values = kept(self, () => {
      let least = 0;
      let most = 0;
      for (const series of self.$series()) {
        if (!series.visible) continue;
        for (const row of rows(series)) {
          for (const value of row) {
            if (value < least) least = value;
            if (value > most) most = value;
          }
        }
      }
      return most > least ? [least, most] : [0, 1];
    });
    axes(self, ["rowAxis", "valueAxis", "columnAxis"], {
      rowAxis: { orientation: Z, range: () => [0, Math.max(0, count().rows - 1)], labels: () => self.primarySeries?.rowLabels ?? NONE },
      valueAxis: { orientation: Y, range: values, labels: () => NONE },
      columnAxis: { orientation: X, range: () => [0, Math.max(0, count().columns - 1)], labels: () => self.primarySeries?.columnLabels ?? NONE },
    });
    self.$plot = kept(self, () => laid(self));
    self.$shown = kept(self, () => bars(self));
  },
});

// Assigning a size assigns its members, whatever they were bound to.
for (const name of ["barSpacing", "barSeriesMargin"]) {
  Object.defineProperty(Bars3D.proto, name, {
    ...Object.getOwnPropertyDescriptor(Bars3D.proto, name),
    set(value) {
      slot(this, `${name}$width`).write(Number(value?.width) || 0);
      slot(this, `${name}$height`).write(Number(value?.height) || 0);
      settle();
    },
  });
}
