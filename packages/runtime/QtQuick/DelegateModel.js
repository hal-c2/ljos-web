// DelegateModel: a model and the delegate its rows are shown with, together.
//
// A view has one whether it was given one or not, and a delegate finds it,
// and where its row is in it, through the attached `DelegateModel`. Qt's
// groups, by which rows are kept out of a view or put in another order
// than the model's, are not done: every row is in `items`, in the model's
// order, and in no other group.
import { runWithOwner } from "solid-js";
import { defineType, derived, QtObject } from "../object.js";
import { modelIndex, modelOf, size } from "./model.js";
import { untrack } from "#kernel";

const count = (model) => (model && typeof model === "object" && !Array.isArray(model) && "count" in model ? Number(model.count) || 0 : size(model));

// What a group says of a row: what it has, and where it is.
function about(model, index) {
  const data = typeof model?.get === "function" ? model.get(index) : { index, modelData: Array.isArray(model) ? model[index] : index };
  return { model: data, itemsIndex: index, inItems: true, persistedItemsIndex: 0, inPersistedItems: false, isUnresolved: false, groups: ["items"] };
}

export const DelegateModelGroup = defineType("DelegateModelGroup", QtObject, {
  properties: { count: 0, name: "", includeByDefault: false },
  methods: {
    get(index) {
      const of = this.$of;
      return of && index >= 0 && index < this.count ? about(of.model, index) : undefined;
    },
    insert() {},
    create() {
      return null;
    },
    resolve() {},
    remove() {},
    addGroups() {},
    removeGroups() {},
    setGroups() {},
    move() {},
  },
});

// The DelegateModel of a view: the one it was given as its model, or one
// that is what the view was given.
function of(view) {
  if (!view?.$props) return null;
  const given = view.model;
  if (given?.$delegates) return given;
  view.$delegateModel ??= runWithOwner(view.$owner, () =>
    untrack(() =>
      DelegateModel({
        get model() {
          return view.model;
        },
        get delegate() {
          return view.delegate;
        },
      }),
    ),
  );
  return view.$delegateModel;
}

const DelegateModelAttached = defineType("DelegateModelAttached", QtObject, {
  properties: {
    model: derived((self) => of(self.$of.$delegate?.$view)),
    itemsIndex: derived((self) => self.$of.$delegate?.index ?? -1),
    inItems: derived((self) => Boolean(self.$of.$delegate)),
    groups: derived((self) => (self.$of.$delegate ? ["items"] : [])),
    persistedItemsIndex: 0,
    inPersistedItems: false,
    isUnresolved: false,
  },
  setup(self, props) {
    self.$of = props.$attachee;
  },
});

function groups(self) {
  if (self.$parted) return self.$parted;
  const make = (props) => {
    const made = runWithOwner(self.$owner, () => untrack(() => DelegateModelGroup(props)));
    made.$of = self;
    return made;
  };
  return (self.$parted = {
    items: make({
      name: "items",
      includeByDefault: true,
      get count() {
        return self.count;
      },
    }),
    persistedItems: make({ name: "persistedItems" }),
  });
}

export const DelegateModel = defineType("DelegateModel", QtObject, {
  properties: {
    model: undefined,
    delegate: undefined,
    filterOnGroup: "",
    rootIndex: undefined,
    delegateModelAccess: 0,
    count: derived((self) => count(modelOf(self.model))),
  },
  enums: { Qt5ReadWrite: 0, ReadOnly: 1, ReadWrite: 2 },
  attached: DelegateModelAttached,
  methods: {
    // A view shows its model with its delegate.
    get $delegates() {
      return true;
    },
    get items() {
      return groups(this).items;
    },
    get persistedItems() {
      return groups(this).persistedItems;
    },
    get groups() {
      const all = groups(this);
      return [all.items, all.persistedItems];
    },
    get parts() {
      return null;
    },
    modelIndex(index) {
      return modelIndex(modelOf(this.model), index);
    },
    parentModelIndex() {
      return modelIndex(modelOf(this.model), -1);
    },
  },
});
