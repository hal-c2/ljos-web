// GraphsTheme: the colours, widths and fonts a graph is drawn with. Each is
// what the colour scheme and the theme say until it is given, and the
// numbers are the ones Qt's own theme reads as.
import { alone, defineType, derived, group, QtObject } from "../object.ts";
import { fontNamed } from "../QtCharts/plot.js";
import { styleHints } from "../QtQml/application.ts";
import { color, colorValue } from "../QtQuick/color.ts";
import { given } from "../QtQuick/compute.ts";

const LIGHT = { background: "#f2f2f2", plot: "#fcfcfc", main: "#545151", sub: "#afafaf", text: "#6a6a6a", label: "#e7e7e7", single: "#ccdc00", multi: "#22d47b" };
const DARK = { background: "#262626", plot: "#1f1f1f", main: "#aeabab", sub: "#6a6a6a", text: "#aeaeae", label: "#2e2e2e", single: "#dbeb00", multi: "#22d489" };

// `Automatic` is the scheme the application has.
const scheme = (self) => ((self.colorScheme || (styleHints().colorScheme === 2 ? 2 : 1)) === 2 ? DARK : LIGHT);

// What the series take in turn, by theme. The last is the one a program
// gives its own colours to.
const SERIES = [
  ["#d5f8e7", "#abf2ce", "#7be6b1", "#51e098", "#22d478"],
  ["#22d478", "#00af80", "#00897b", "#006468", "#00414a"],
  ["#ffa615", "#5e45df", "#759f1c", "#f92759", "#0128f8"],
  ["#ffc290", "#ff9c4d", "#ff7200", "#d86000", "#a24900"],
  ["#ffe380", "#ffc500", "#e2b000", "#b88f00", "#8c6d02"],
  ["#86afff", "#4a86fc", "#2b6ef1", "#0750e9", "#0023db"],
  ["#e682e7", "#b646b7", "#9035b4", "#6c2ba0", "#3d2582"],
  ["#ccd0d6", "#a7aebb", "#7a869a", "#566070", "#3e4654"],
  ["#000000"],
].map((names) => Object.freeze(names.map(color)));

const themed = derived((self) => SERIES[self.theme] ?? SERIES[0]);

// A list of colours as colour values. The list it was given is looked
// through once.
const lists = new WeakMap();
function colours(self, own) {
  const given = own();
  if (SERIES.includes(given)) return given;
  let made = lists.get(given);
  if (!made) lists.set(given, (made = Array.from(given, color)));
  return made;
}

// The lines of a grid or of an axis: the main ones and those between them.
const line = (members) =>
  group({
    mainColor: derived((self) => scheme(self).main),
    subColor: derived((self) => scheme(self).sub),
    mainWidth: 2,
    subWidth: 1,
    ...members,
  });

// An axis' labels are of the theme's label colour until given their own.
const labelled = { labelTextColor: derived((self) => self.labelTextColor) };

// The font of a graph in space's labels, which is not the application's:
// Arial, twelve points.
const labelFont = group({
  family: "Arial",
  styleName: "",
  bold: derived((self) => self.labelFont.weight >= 600),
  weight: derived((self) => (given(self, "labelFont", "bold") && self.labelFont.bold ? 700 : 400)),
  italic: false,
  underline: false,
  overline: false,
  strikeout: false,
  size: alone(derived((self) => self.labelFont.pixelSize)),
  pixelSize: derived((self) =>
    given(self, "labelFont", "size")
      ? self.labelFont.size
      : given(self, "labelFont", "pointSize")
        ? Math.round((self.labelFont.pointSize * 96) / 72)
        : 16,
  ),
  pointSize: derived((self) =>
    given(self, "labelFont", "pixelSize") || given(self, "labelFont", "size") ? (self.labelFont.pixelSize * 72) / 96 : 12,
  ),
  capitalization: 0,
  letterSpacing: 0,
  wordSpacing: 0,
  kerning: true,
  features: undefined,
  variableAxes: undefined,
});

const lined = (name) => ({ [`${name}$mainColor`]: colorValue, [`${name}$subColor`]: colorValue });

export const GraphsTheme = defineType("GraphsTheme", QtObject, {
  properties: {
    colorScheme: 0,
    theme: 0,
    backgroundColor: derived((self) => scheme(self).background),
    backgroundVisible: true,
    plotAreaBackgroundColor: derived((self) => scheme(self).plot),
    plotAreaBackgroundVisible: true,
    gridVisible: true,
    grid: line(),
    axisX: line(labelled),
    axisY: line(labelled),
    axisZ: line(labelled),
    axisXLabelFont: fontNamed("axisXLabelFont"),
    axisYLabelFont: fontNamed("axisYLabelFont"),
    axisZLabelFont: fontNamed("axisZLabelFont"),
    labelTextColor: derived((self) => scheme(self).text),
    seriesColors: themed,
    borderColors: themed,
    borderWidth: 1,
    // What a graph in space draws with besides: its labels are written in
    // one font on a ground of their own, and what is selected has a colour.
    labelFont,
    labelsVisible: true,
    labelBackgroundColor: derived((self) => scheme(self).label),
    labelBackgroundVisible: true,
    labelBorderVisible: true,
    colorStyle: 0,
    singleHighlightColor: derived((self) => scheme(self).single),
    multiHighlightColor: derived((self) => scheme(self).multi),
  },
  enums: {
    Automatic: 0,
    Light: 1,
    Dark: 2,
    QtGreen: 0,
    QtGreenNeon: 1,
    MixSeries: 2,
    OrangeSeries: 3,
    YellowSeries: 4,
    BlueSeries: 5,
    PurpleSeries: 6,
    GreySeries: 7,
    UserDefined: 8,
    Uniform: 0,
    ObjectGradient: 1,
    RangeGradient: 2,
  },
  resolve: {
    backgroundColor: colorValue,
    plotAreaBackgroundColor: colorValue,
    labelTextColor: colorValue,
    ...lined("grid"),
    ...lined("axisX"),
    ...lined("axisY"),
    ...lined("axisZ"),
    axisX$labelTextColor: colorValue,
    axisY$labelTextColor: colorValue,
    axisZ$labelTextColor: colorValue,
    labelBackgroundColor: colorValue,
    singleHighlightColor: colorValue,
    multiHighlightColor: colorValue,
    seriesColors: colours,
    borderColors: colours,
  },
});
