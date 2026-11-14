// Scatter3D: a graph of points in space, each drawn as a ball.
//
// Not here: the other shapes a point can be drawn as (`mesh`), turning each
// (`rotationRole`), and selecting one with the mouse: the one a program
// selects is drawn in the colour of what is selected.
import { defineType, slot } from "../object.ts";
import { kept } from "../QtQuick3D/Node.js";
import { linear } from "../QtQuick3D/scene.js";
import { Value3DAxis } from "./axes3d.js";
import { Scatter3DSeries } from "./data3d.js";
import { ambient, GraphsItem3D, valued } from "./graph3d.js";
import { ball, shaping } from "./shapes3d.js";

const is = (object, Type) => object?.$type?.chain.includes(Type) === true;
const NONE = Object.freeze([]);

// How many steps round a ball is made of.
const ROUND = 24;

const items = (series) => series.dataProxy?.$data().items ?? NONE;

// Every point as one shape: those of a series are a part of it, and the one
// that is selected a part of its own. A point is three quarters its colour
// where the light falls on it.
function points(self) {
  const plot = self.$plot();
  const glow = ambient(self) * 0.75;
  const shown = self.$series().filter((series) => series.visible);
  // The more points there are the smaller each is, unless its series says
  // how big.
  const count = shown.reduce((sum, series) => sum + items(series).length, 0);
  const fit = Math.max(0.01, Math.min(0.1, 2 / Math.sqrt(count)));
  const shape = shaping();
  for (const series of shown) {
    const radius = series.itemSize > 0 ? series.itemSize / 3 : fit;
    const selected = series.selectedItem;
    const paint = (value) => {
      const [r, g, b] = linear(value);
      return { colour: [r * 0.75, g * 0.75, b * 0.75, 1], paint: { glow: [r * r * glow, g * g * glow, b * b * glow], shine: 0, sided: false } };
    };
    const own = paint(series.baseColor);
    items(series).forEach((item, index) => {
      if (index !== selected && plot.within(item)) ball(shape, plot.point(item), radius, own.colour, ROUND);
    });
    shape.part(own.paint);
    const item = items(series)[selected];
    if (item && plot.within(item)) {
      const lit = paint(series.singleHighlightColor);
      ball(shape, plot.point(item), radius, lit.colour, ROUND);
      shape.part(lit.paint);
    }
  }
  return shape.mesh();
}

export const Scatter3D = defineType("Scatter3D", GraphsItem3D, {
  properties: {
    axisX: null,
    axisY: null,
    axisZ: null,
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
    self.$takes = (series) => is(series, Scatter3DSeries);
    valued(self, props, Value3DAxis, function* () {
      for (const series of self.$series()) if (series.visible) yield* items(series);
    });
    self.$shown = kept(self, () => points(self));
  },
});
