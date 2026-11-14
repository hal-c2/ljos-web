// Surface3D: a graph of surfaces in space, each through the rows of points
// its series has.
//
// A surface is drawn through the rows and columns that are wholly within
// the axes across and in depth, as Qt draws it: it ends at the last point
// inside them, not at the axes' ends.
//
// Not here: the lines of a surface's mesh (`DrawWireframe`), its texture,
// and what is selected.
import { defineType, slot } from "../object.ts";
import { Value3DAxis } from "./axes3d.js";
import { Surface3DSeries } from "./data3d.js";
import { ambient, GraphsItem3D, valued } from "./graph3d.js";
import { linear } from "../QtQuick3D/scene.js";
import { kept } from "../QtQuick3D/Node.js";
import { shaping, sheet } from "./shapes3d.js";

const is = (object, Type) => object?.$type?.chain.includes(Type) === true;
const NONE = Object.freeze([]);

const Flat = 1;
const DrawSurface = 2;

const rows = (series) => series.dataProxy?.$data().rows ?? NONE;

// Every surface as one shape, each a part of it. A surface is lit from both
// sides: half its colour where the light falls on it, and a spot of light
// where it gives the light back to the eye.
function surfaces(self) {
  const plot = self.$plot();
  const { axisX, axisZ } = self;
  const glow = ambient(self) * 0.75;
  const shape = shaping();
  for (const series of self.$series()) {
    if (!series.visible || !(series.drawMode & DrawSurface)) continue;
    const all = rows(series);
    const first = all[0] ?? NONE;
    const columns = first.map((_, index) => index).filter((index) => first[index].x >= axisX.min && first[index].x <= axisX.max);
    const inside = all.filter((row) => row[0].z >= axisZ.min && row[0].z <= axisZ.max);
    const [r, g, b] = linear(series.baseColor);
    sheet(
      shape,
      inside.map((row) => columns.map((index) => plot.point(row[index]))),
      [r * 0.5, g * 0.5, b * 0.5, 1],
      series.shading === Flat,
    );
    shape.part({ glow: [r * r * glow, g * g * glow, b * b * glow], shine: 0.25, sided: true });
  }
  return shape.mesh();
}

export const Surface3D = defineType("Surface3D", GraphsItem3D, {
  properties: {
    axisX: null,
    axisY: null,
    axisZ: null,
    flipHorizontalGrid: false,
    // The series what is selected was last said of.
    selectedSeries: null,
  },
  resolve: {
    selectedSeries: (self, own) => {
      const series = own();
      return self.$series().includes(series) ? series : null;
    },
  },
  setup(self, props) {
    self.$select = (series) => slot(self, "selectedSeries").write(series);
    self.$takes = (series) => is(series, Surface3DSeries);
    valued(self, props, Value3DAxis, function* () {
      for (const series of self.$series()) if (series.visible) for (const row of rows(series)) yield* row;
    });
    self.$shown = kept(self, () => surfaces(self));
  },
});
