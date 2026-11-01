// What a graph in space shows: a series of bars, of points or of a surface,
// and the proxy that makes its data of a model's rows. A proxy says what
// the data is; the graph its series is in works out where it is drawn.
//
// A proxy hears of the rows that came and went a moment later, all of them
// at once: a model filled row by row is read through once. Qt's reads it at
// each row.
//
// Not here: `useModelCategories`, the patterns a role's text is searched
// with, and `multiMatchBehavior`: of two rows that say the same cell the
// last one is it, which is what Qt does until told otherwise.
import { onCleanup } from "solid-js";
import { contents, defineType, derived, effect, inside, QtObject, settle, slot } from "../object.js";
import { Point } from "../QtQml/values.js";
import { color, colorValue } from "../QtQuick/color.js";
import { columnsOf, rowsOf } from "../QtQuick/model.js";
import { kept } from "../QtQuick3D/Node.js";
import { untrack } from "#kernel";

const next = (version) => version + 1;
const NONE = Object.freeze([]);
const BLACK = color("#000000");

const is = (object, Type) => object?.$type?.chain.includes(Type) === true;

// What a model says when what a proxy read of it is no longer so, as a
// QAbstractItemModel does.
const HEARD = ["modelReset", "dataChanged", "rowsInserted", "rowsRemoved", "rowsMoved", "columnsInserted", "columnsRemoved", "layoutChanged"];

// Hears of the model's changes from now on, and no more of the one before.
// A list model tells of its rows; what a row says tells its readers itself.
function follow(self, model) {
  if (model === self.$heard) return;
  self.$heard = model;
  self.$deaf?.();
  self.$deaf = null;
  let pending = false;
  const again = () => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      if (self.$heard !== model) return;
      self.$touch(next);
      settle();
    });
  };
  if (typeof model?.$observe === "function") {
    self.$deaf = model.$observe({ inserted: again, removed: again, moved: again, role() {} });
    return;
  }
  const heard = HEARD.filter((name) => typeof model?.[name]?.connect === "function");
  for (const name of heard) model[name].connect(again);
  self.$deaf = () => {
    for (const name of heard) model[name].disconnect(again);
  };
}

// The cells of a model, each asked for by the name of a role: a list
// model's elements, or what a model with `data` says of each index.
function cells(self) {
  self.$track();
  const model = self.itemModel;
  if (!model) return null;
  if (model.$elements) {
    const elements = model.$elements;
    return { rows: elements.length, columns: 1, read: (row, column, role) => elements[row][role] };
  }
  if (typeof model.data !== "function") return null;
  const numbers = new Map(Object.entries(model.roleNames?.() ?? {}).map(([number, name]) => [String(name), Number(number)]));
  return {
    rows: rowsOf(model),
    columns: columnsOf(model),
    read: (row, column, role) => (numbers.has(role) ? model.data(model.index(row, column), numbers.get(role)) : undefined),
  };
}

// A cell as the number Qt keeps of it, which is a float.
function number(value) {
  const made = Number(value ?? 0);
  return Number.isFinite(made) ? Math.fround(made) : 0;
}

// The rows and the columns the cells are sorted into: each cell says which
// row and which column it is of, and they are in the order they were first
// said in, unless the proxy was given its own. What two cells say of the
// same place the last one says.
function sorted(self, value) {
  const { rowRole, columnRole } = self;
  const model = cells(self);
  const table = new Map();
  const rows = [];
  const columns = [];
  const seen = new Set();
  if (model && rowRole && columnRole) {
    for (let row = 0; row < model.rows; row++) {
      for (let column = 0; column < model.columns; column++) {
        const read = (role) => model.read(row, column, role);
        const across = String(read(rowRole) ?? "");
        const along = String(read(columnRole) ?? "");
        let held = table.get(across);
        if (!held) {
          table.set(across, (held = new Map()));
          rows.push(across);
        }
        held.set(along, value(read));
        if (!seen.has(along)) {
          seen.add(along);
          columns.push(along);
        }
      }
    }
  }
  const rowCategories = self.autoRowCategories ? rows : Array.from(slot(self, "rowCategories").asked() ?? NONE, String);
  const columnCategories = self.autoColumnCategories ? columns : Array.from(slot(self, "columnCategories").asked() ?? NONE, String);
  return { table, rowCategories, columnCategories };
}

export const AbstractDataProxy = defineType("AbstractDataProxy", QtObject, {
  properties: {
    type: 0,
    // The series the proxy is the data of.
    series: null,
  },
  enums: { None: 0, Bar: 1, Scatter: 2, Surface: 3 },
});

const First = 0;
const Last = 1;
const Average = 2;
const Cumulative = 3;

// What a proxy that reads a model has, whatever it makes of it.
const modelled = {
  properties: {
    itemModel: null,
    multiMatchBehavior: Last,
  },
  enums: { First, Last, Average, Cumulative },
  setup(self) {
    onCleanup(() => self.$deaf?.());
    effect(
      () => self.itemModel,
      (model) => follow(self, model),
    );
  },
};

// The rows and columns of a proxy that sorts cells into them: the ones it
// found, unless it is to keep to the ones it was given.
const categorised = {
  properties: {
    rowRole: "",
    columnRole: "",
    rowCategories: NONE,
    columnCategories: NONE,
    autoRowCategories: true,
    autoColumnCategories: true,
  },
  resolve: {
    rowCategories: (self) => self.$data().rowCategories,
    columnCategories: (self) => self.$data().columnCategories,
  },
};

// ---------------------------------------------------------------- surfaces

export const SurfaceDataProxy = defineType("SurfaceDataProxy", AbstractDataProxy, {
  properties: {
    type: 3,
    rowCount: derived((self) => self.$data().rows.length),
    columnCount: derived((self) => self.$data().rows[0]?.length ?? 0),
  },
  setup(self) {
    self.$data = () => EMPTY;
  },
});

const EMPTY = Object.freeze({ rows: NONE, items: NONE, rowCategories: NONE, columnCategories: NONE });
const ORIGIN = Object.freeze({ x: 0, y: 0, z: 0 });

// The points of a surface, row by row: where each is across is what its
// column says unless a role of its own does, and how deep, its row.
// SurfaceItemModelHandler::resolveModel.
function surface(self) {
  const { rowRole, columnRole, yPosRole } = self;
  const xRole = self.xPosRole || columnRole;
  const zRole = self.zPosRole || rowRole;
  const { table, rowCategories, columnCategories } = sorted(self, (read) => ({ x: number(read(xRole)), y: yPosRole ? number(read(yPosRole)) : 0, z: number(read(zRole)) }));
  const rows = rowCategories.map((row) => columnCategories.map((column) => table.get(row)?.get(column) ?? ORIGIN));
  return { rows, rowCategories, columnCategories };
}

export const ItemModelSurfaceDataProxy = defineType("ItemModelSurfaceDataProxy", SurfaceDataProxy, {
  properties: {
    ...modelled.properties,
    ...categorised.properties,
    xPosRole: "",
    yPosRole: "",
    zPosRole: "",
  },
  enums: modelled.enums,
  resolve: categorised.resolve,
  setup(self) {
    self.$data = kept(self, () => surface(self));
    modelled.setup(self);
  },
});

// ---------------------------------------------------------------- bars

export const BarDataProxy = defineType("BarDataProxy", AbstractDataProxy, {
  properties: {
    type: 1,
    rowCount: derived((self) => self.$data().rows.length),
    colCount: derived((self) => self.$data().rows.reduce((most, row) => Math.max(most, row.length), 0)),
  },
  setup(self) {
    self.$data = () => EMPTY;
  },
});

// The values of bars, row by row. BarItemModelHandler::resolveModel.
function bars(self) {
  const { valueRole } = self;
  const { table, rowCategories, columnCategories } = sorted(self, (read) => number(read(valueRole)));
  const rows = rowCategories.map((row) => columnCategories.map((column) => table.get(row)?.get(column) ?? 0));
  return { rows, rowCategories, columnCategories };
}

export const ItemModelBarDataProxy = defineType("ItemModelBarDataProxy", BarDataProxy, {
  properties: {
    ...modelled.properties,
    ...categorised.properties,
    valueRole: "",
    rotationRole: "",
  },
  enums: modelled.enums,
  resolve: categorised.resolve,
  setup(self) {
    self.$data = kept(self, () => bars(self));
    modelled.setup(self);
  },
});

// ---------------------------------------------------------------- points

export const ScatterDataProxy = defineType("ScatterDataProxy", AbstractDataProxy, {
  properties: {
    type: 2,
    itemCount: derived((self) => self.$data().items.length),
  },
  setup(self) {
    self.$data = () => EMPTY;
  },
});

// A point for each cell of the model. ScatterItemModelHandler::resolveModel.
function points(self) {
  const { xPosRole, yPosRole, zPosRole } = self;
  const model = cells(self);
  const items = [];
  if (model) {
    for (let row = 0; row < model.rows; row++) {
      for (let column = 0; column < model.columns; column++) {
        const read = (role) => (role ? number(model.read(row, column, role)) : 0);
        items.push({ x: read(xPosRole), y: read(yPosRole), z: read(zPosRole) });
      }
    }
  }
  return { items };
}

export const ItemModelScatterDataProxy = defineType("ItemModelScatterDataProxy", ScatterDataProxy, {
  properties: {
    ...modelled.properties,
    xPosRole: "",
    yPosRole: "",
    zPosRole: "",
    rotationRole: "",
  },
  enums: modelled.enums,
  setup(self) {
    self.$data = kept(self, () => points(self));
    modelled.setup(self);
  },
});

// ---------------------------------------------------------------- series

// `Color { color: "red" }`: a colour as an object, for a list of them.
export const Color = defineType("Color", QtObject, {
  properties: { color: "#000000" },
  resolve: { color: colorValue },
});

// The graph a series is in, once it is in one, and which of its series it
// is: `{ graph, index }`.
const told = (self) => (self.$track(), self.$told ?? null);

// A colour of the graph's theme, until the series is given its own. A
// series in no graph is black.
const themed = (pick) => derived((self) => {
  const { graph, index } = told(self) ?? {};
  return graph ? pick(graph.theme, index) : BLACK;
});

const Mesh = { UserDefined: 0, Bar: 1, Cube: 2, Pyramid: 3, Cone: 4, Cylinder: 5, BevelBar: 6, BevelCube: 7, Sphere: 8, Minimal: 9, Arrow: 10, Point: 11 };

export const Abstract3DSeries = defineType("Abstract3DSeries", QtObject, {
  properties: {
    type: 0,
    name: "",
    visible: true,
    dataProxy: null,
    // What each bar or point is shaped as, and whether its faces are
    // rounded into each other.
    mesh: Mesh.Sphere,
    meshSmooth: false,
    meshRotation: undefined,
    userDefinedMesh: "",
    // The theme's until the series is given its own.
    colorStyle: derived((self) => told(self)?.graph.theme.colorStyle ?? 0),
    baseColor: themed((theme, index) => theme.seriesColors[index % theme.seriesColors.length] ?? BLACK),
    singleHighlightColor: themed((theme) => theme.singleHighlightColor),
    multiHighlightColor: themed((theme) => theme.multiHighlightColor),
    baseGradient: null,
    singleHighlightGradient: null,
    multiHighlightGradient: null,
    itemLabelFormat: "",
    itemLabelVisible: true,
    itemLabel: "",
    lightingMode: 0,
  },
  enums: { ...Mesh, None: 0, Bar: 1, Scatter: 2, Surface: 3, Shaded: 0, Unshaded: 1 },
  resolve: { baseColor: colorValue, singleHighlightColor: colorValue, multiHighlightColor: colorValue },
  methods: {
    // The graph the series is put in tells it so.
    $tell(told) {
      this.$told = told;
      this.$touch(next);
    },
  },
  setup(self) {
    effect(
      () => self.dataProxy,
      (proxy) => {
        if (proxy) slot(proxy, "series").provide(self);
      },
    );
  },
  // A proxy declared inside a series is its data.
  adopt(self, props) {
    const proxy = contents(props, self).find((child) => is(child, AbstractDataProxy));
    if (proxy) slot(self, "dataProxy").write(proxy);
  },
});

// A series that was given no proxy has one of its own, with no data.
const proxied = (Proxy) => (self, props) => {
  if (!("dataProxy" in props)) slot(self, "dataProxy").provide(inside(self, () => untrack(() => Proxy({}))));
};

// Saying what of a series is selected says to its graph whose the selection
// is, whatever was said: Qt's graph has the series even of no point.
const selecting = (name) => ({
  [name]: {
    get() {
      return slot(this, name).get();
    },
    set(value) {
      slot(this, name).write(value);
      this.$told?.graph.$select?.(this);
      settle();
    },
    enumerable: true,
    configurable: true,
  },
});

// A place in the data that is no place: what is selected when nothing is.
const NOWHERE = Object.freeze(new Point(-1, -1));

// A row and a column that are selected, when the data has them.
const placed = (rows, columns) => (self, own) => {
  const place = own();
  const proxy = self.dataProxy;
  return place && place.x >= 0 && place.y >= 0 && place.x < (proxy?.[rows] ?? 0) && place.y < (proxy?.[columns] ?? 0) ? place : NOWHERE;
};

const DrawWireframe = 1;
const DrawSurface = 2;

export const Surface3DSeries = defineType("Surface3DSeries", Abstract3DSeries, {
  properties: {
    type: 3,
    itemLabelFormat: "@xLabel, @yLabel, @zLabel",
    selectedPoint: NOWHERE,
    invalidSelectionPosition: NOWHERE,
    // Whether each face is lit as one, or as it rounds into its neighbours.
    shading: 1,
    drawMode: DrawWireframe | DrawSurface,
    wireframeColor: "#000000",
    textureFile: "",
  },
  enums: { Smooth: 0, Flat: 1, DrawWireframe, DrawSurface, DrawSurfaceAndWireframe: DrawWireframe | DrawSurface, DrawFilledSurface: 4 },
  resolve: { wireframeColor: colorValue, selectedPoint: placed("rowCount", "columnCount") },
  methods: Object.defineProperties({}, selecting("selectedPoint")),
  setup: proxied(SurfaceDataProxy),
});

export const Bar3DSeries = defineType("Bar3DSeries", Abstract3DSeries, {
  properties: {
    type: 1,
    mesh: Mesh.BevelBar,
    meshAngle: 0,
    itemLabelFormat: "@valueLabel",
    selectedBar: NOWHERE,
    invalidSelectionPosition: NOWHERE,
    // A colour for each row, taken in turn; the series' own when none.
    rowColors: NONE,
    rowLabels: derived((self) => self.dataProxy?.$data().rowCategories ?? NONE),
    columnLabels: derived((self) => self.dataProxy?.$data().columnCategories ?? NONE),
    valueColoringEnabled: false,
  },
  resolve: { selectedBar: placed("rowCount", "colCount") },
  setup: proxied(BarDataProxy),
});

export const Scatter3DSeries = defineType("Scatter3DSeries", Abstract3DSeries, {
  properties: {
    type: 2,
    itemLabelFormat: "@xLabel, @yLabel, @zLabel",
    // How big each point is, of the graph: as the graph sees fit when 0.
    itemSize: 0,
    // Which point is selected: none when it is not one the series has.
    selectedItem: -1,
    invalidSelectionIndex: -1,
  },
  resolve: {
    selectedItem: (self, own) => {
      const index = own();
      return index >= 0 && index < (self.dataProxy?.itemCount ?? 0) ? index : -1;
    },
  },
  methods: Object.defineProperties({}, selecting("selectedItem")),
  setup: proxied(ScatterDataProxy),
});

export const series3d = (child) => is(child, Abstract3DSeries);
