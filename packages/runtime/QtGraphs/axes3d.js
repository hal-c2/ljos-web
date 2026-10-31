// The axes of a graph in space: a Value3DAxis measures numbers and a
// Category3DAxis names the rows or the columns of bars. An axis says what
// its range and its labels are; the graph it is in draws them, and tells an
// axis that follows the data what the data is.
import { defineType, derived, inside, QtObject, settle, slot } from "../object.js";
import { untrack } from "#kernel";

const next = (version) => version + 1;
const NONE = Object.freeze([]);

// What Qt reads a label format as: what comes before the number, how the
// number is written, and what comes after. QtGraphs' Utils::preParseFormat.
const FORMAT = /^([^%]*)%([-+# \d.lhjztL]*)([dicuoxfegXFEG])(.*)$/s;

const padded = (text, flags, width) => {
  if (text.length >= width) return text;
  if (flags.includes("-")) return text.padEnd(width);
  if (!flags.includes("0")) return text.padStart(width);
  const signed = /^[-+ ]/.test(text) ? 1 : 0;
  return text.slice(0, signed) + text.slice(signed).padStart(width - signed, "0");
};

// A number as C's printf writes it for one conversion.
function printed(value, flags, kind) {
  const [, marks, width = "", precision] = flags.match(/^([-+# 0]*)(\d*)(?:\.(\d*))?/);
  const digits = precision === undefined ? 6 : Number(precision);
  let text;
  if ("fF".includes(kind)) text = Math.abs(value).toFixed(Math.min(100, digits));
  else if ("eE".includes(kind)) text = Math.abs(value).toExponential(Math.min(100, digits)).replace(/e([-+])(\d)$/, "e$10$2");
  else if ("gG".includes(kind)) {
    const exponent = value === 0 ? 0 : Math.floor(Math.log10(Math.abs(value)));
    const most = Math.max(1, digits);
    text = exponent < -4 || exponent >= most ? Math.abs(value).toExponential(most - 1).replace(/e([-+])(\d)$/, "e$10$2") : Math.abs(value).toFixed(Math.max(0, most - 1 - exponent));
    if (!marks.includes("#")) text = text.replace(/\.?0+(e|$)/, "$1");
  } else if (kind === "c") return String.fromCharCode(Math.trunc(value));
  else {
    const whole = Math.trunc(value);
    const base = kind === "o" ? 8 : "xX".includes(kind) ? 16 : 10;
    // What is not signed is the number as its bits say it.
    text = "uoxX".includes(kind) && whole < 0 ? BigInt.asUintN(64, BigInt(whole)).toString(base) : Math.abs(whole).toString(base);
  }
  if (kind === kind.toUpperCase()) text = text.toUpperCase();
  const negative = value < 0 && !"uoxX".includes(kind);
  const sign = negative ? "-" : marks.includes("+") ? "+" : marks.includes(" ") ? " " : "";
  return padded(sign + text, marks, Number(width) || 0);
}

// A value as a label format writes it. A format that asks for no number is
// the label itself.
export function formatted(format, value) {
  const parts = String(format).match(FORMAT);
  if (!parts) return String(format);
  return parts[1] + printed(Number(value), parts[2], parts[3]) + parts[4];
}

// What makes the labels of a value axis. A program's own formatter says
// with `stringForValue` what a value is written as.
export const Value3DAxisFormatter = defineType("Value3DAxisFormatter", QtObject, {
  methods: {
    stringForValue(value, format) {
      return formatted(format, value);
    },
  },
});

const None = 0;
const X = 1;
const Y = 2;
const Z = 3;
const Category = 1;
const Value = 2;

// What the graph an axis is in knows of the data along it, once it is in
// one: `{ range, labels }`, each a function.
const told = (self) => (self.$track(), self.$told ?? null);

// The range of an axis that follows its data; of one in no graph, Qt's own.
const followed = (self) => told(self)?.range() ?? [0, 10];

// Qt keeps a range in order as it is assigned: an end that reaches the
// other takes it along, one further. And an axis that was given an end of
// its range no longer follows the data.
const bound = (name, other, step) => ({
  get() {
    return slot(this, name).get();
  },
  set(value) {
    const held = untrack(() => this[other]);
    slot(this, name).write(value);
    slot(this, other).write((step > 0 ? value >= held : value <= held) ? value + step : held);
    slot(this, "autoAdjustRange").write(false);
    settle();
  },
  enumerable: true,
  configurable: true,
});

export const Abstract3DAxis = defineType("Abstract3DAxis", QtObject, {
  properties: {
    title: "",
    titleVisible: false,
    // Whether the title stays as it is turned when the graph is.
    titleFixed: true,
    titleOffset: 0,
    labels: NONE,
    labelsVisible: true,
    labelAutoAngle: 0,
    labelSize: 1,
    scaleLabelsByCount: false,
    orientation: derived((self) => told(self)?.orientation ?? None),
    type: None,
    min: 0,
    max: 10,
    // Whether the range is the data's. It is until an end of it is given.
    autoAdjustRange: true,
  },
  enums: { None, X, Y, Z, Category, Value },
  resolve: {
    autoAdjustRange: (self, own) => (slot(self, "autoAdjustRange").explicit() ? Boolean(own()) : !(slot(self, "min").explicit() || slot(self, "max").explicit())),
    // Qt keeps the ends of a range as floats.
    min: (self, own) => Math.fround(self.autoAdjustRange ? followed(self)[0] : Number(own())),
    max: (self, own) => Math.fround(self.autoAdjustRange ? followed(self)[1] : Number(own())),
    labelAutoAngle: (self, own) => Math.max(0, Math.min(90, own())),
  },
  methods: Object.defineProperties(
    {
      // The graph the axis is in tells it what it measures.
      $tell(told) {
        this.$told = told;
        this.$touch(next);
      },
    },
    {
      min: bound("min", "max", 1),
      max: bound("max", "min", -1),
    },
  ),
});

export const Value3DAxis = defineType("Value3DAxis", Abstract3DAxis, {
  properties: {
    type: Value,
    segmentCount: 5,
    subSegmentCount: 1,
    labelFormat: "%.2f",
    formatter: null,
    reversed: false,
    // A label at each end of each segment, from the least value up.
    labels: derived((self) => {
      const { min, max, segmentCount: count, labelFormat: format, formatter } = self;
      return Array.from({ length: count + 1 }, (_, at) => String(formatter.stringForValue(min + ((max - min) * at) / count, format)));
    }),
  },
  resolve: {
    segmentCount: (self, own) => Math.max(1, Math.trunc(own())),
    subSegmentCount: (self, own) => Math.max(1, Math.trunc(own())),
  },
  setup(self, props) {
    if (!("formatter" in props)) slot(self, "formatter").provide(inside(self, () => untrack(() => Value3DAxisFormatter({}))));
  },
});

export const Category3DAxis = defineType("Category3DAxis", Abstract3DAxis, {
  properties: {
    type: Category,
    // The names it was given, else those of the data's rows or columns.
    labels: NONE,
  },
  resolve: {
    labels: (self, own) => (slot(self, "labels").explicit() ? Array.from(own() ?? NONE, String) : (told(self)?.labels() ?? NONE)),
  },
});
