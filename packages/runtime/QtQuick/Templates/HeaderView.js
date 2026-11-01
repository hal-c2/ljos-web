// HorizontalHeaderView and VerticalHeaderView: a TableView of one row, or of
// one column, that says what the columns and the rows of another are. It
// follows that view through `syncView` in the one direction it has.
//
// What it shows is, as in Qt (qquickheaderview.cpp): the header data of a
// table model it is given, or of the followed view's model when it is given
// none; and a model that is no table (a list, an array, a number) as it is,
// laid out along the header.
import { defineType, derived } from "../../object.js";
import { indexed, tabular } from "../cells.js";
import { columnsOf, modelIndex, rowsOf } from "../model.js";
import { TableView } from "../TableView.js";
import { untrack } from "#kernel";

const Horizontal = 1;
const Vertical = 2;

const DISPLAY = { 0: "display" };

// Qt's QHeaderDataProxyModel: a model whose cells are the header data of
// another. What the other says changed in it, this one says too.
function headers(view, source, orientation) {
  const horizontal = orientation === Horizontal;
  let warned = false;
  const model = {
    rowCount: () => (horizontal ? 1 : rowsOf(source)),
    columnCount: () => (horizontal ? columnsOf(source) : 1),
    index: (row, column) => modelIndex(model, row, column),
    data(index, role = 0) {
      if (!index?.valid) return undefined;
      const section = horizontal ? index.column : index.row;
      if (typeof source.headerData === "function") return source.headerData(section, orientation, role);
      // What a QAbstractItemModel that says nothing of its headers answers.
      return role === 0 ? section + 1 : undefined;
    },
    setData(index, value, role = 2) {
      if (!index?.valid) return false;
      return Boolean(source.setHeaderData?.(horizontal ? index.column : index.row, orientation, value, role));
    },
    headerData: (section, towards, role = 0) => (role === 0 ? section + 1 : undefined),
    roleNames() {
      const names = source.roleNames?.() ?? DISPLAY;
      const role = untrack(() => view.textRole) || "display";
      if (!warned && !Object.values(names).includes(role)) {
        warned = true;
        console.warn(
          `QML ${view.$type.typeName}: The 'textRole' property contains a role that doesn't exist in the model: ${role}. Check your model's roleNames() implementation`,
        );
      }
      return names;
    },
    dataChanged: source.headerDataChanged,
  };
  for (const name of ["modelReset", "rowsInserted", "rowsRemoved", "rowsMoved", "columnsInserted", "columnsRemoved", "columnsMoved", "layoutChanged"]) {
    model[name] = source[name];
  }
  return model;
}

// The model the header shows: Qt's `setModelImpl` and `syncModel`.
function shown(self) {
  const mine = self.$header;
  const given = self.model;
  let source = null;
  if (given !== undefined) {
    if (!tabular(given)) return given;
    source = given;
  } else {
    const followed = self.syncView?.model;
    if (indexed(followed)) source = followed;
  }
  if (source !== mine.source) {
    mine.source = source;
    mine.model = source ? headers(self, source, mine.orientation) : undefined;
  }
  return mine.model;
}

function header(name, orientation) {
  return defineType(name, TableView, {
    properties: {
      syncDirection: orientation,
      // `Flickable.HorizontalFlick` and `VerticalFlick` are the same numbers.
      flickableDirection: orientation,
      // The role a delegate of the style shows: the one a table model has
      // its header's text in.
      textRole: derived((self) => (indexed(self.$source()) ? "display" : "")),
    },
    attached: TableView.spec.attached,
    methods: {
      $source() {
        return shown(this);
      },
      // A model that is a list is laid out along the header.
      $transposed(source) {
        return orientation === Horizontal && (!indexed(source) || columnsOf(source) === 1);
      },
      $syncs() {
        const mine = this.$header;
        if (this.syncDirection !== orientation && !mine.warned) {
          mine.warned = true;
          console.warn(
            `QML ${name}: Setting syncDirection other than Qt::${orientation === Horizontal ? "Horizontal" : "Vertical"} is invalid.`,
          );
        }
        return orientation;
      },
    },
    setup(self) {
      self.$header = { orientation, source: null, model: undefined, warned: false };
    },
  });
}

export const HorizontalHeaderView = header("HorizontalHeaderView", Horizontal);
export const VerticalHeaderView = header("VerticalHeaderView", Vertical);
