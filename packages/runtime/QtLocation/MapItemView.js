// MapItemView: a map's items for the rows of a model.
//
// It is an item over the whole map, and its delegates' items are in it.
import { onCleanup } from "solid-js";
import { defineType, derived, effect } from "../object.js";
import { lazy } from "../QtQuick/compute.js";
import { Item } from "../QtQuick/Item.js";
import { delegateOf, modelOf, Rows, size } from "../QtQuick/model.js";
import { untrack } from "#kernel";

const EMPTY = Object.freeze([]);

// An item is there for as long as its row is: where a row is among the
// others is nothing to a map.
const nothing = () => {};

export const MapItemView = defineType("MapItemView", Item, {
  properties: {
    model: undefined,
    delegate: undefined,
    mapItems: derived((self) => self.$items()),
    width: derived((self) => self.parent?.width ?? 0),
    height: derived((self) => self.parent?.height ?? 0),
  },
  methods: { $mapGroup: true },
  setup(self) {
    self.$items = lazy(self, () => Object.freeze(self.children.filter((child) => child.$mapItem)), EMPTY);
    const rows = new Rows({
      self,
      owner: self.$owner,
      parent: () => self,
      // Every row has its item, wherever on the Earth it is.
      inserted(index, count) {
        if (rows.ready) for (let at = index; at < index + count; at++) rows.row(at);
      },
      removed: nothing,
      moved: nothing,
      created: (row) => row.$item?.$node && self.$add(row.$item),
      destroyed: (row) => self.$remove(row.$item),
    });
    onCleanup(() => rows.dispose());
    effect(
      () => {
        const model = modelOf(self.model);
        return [model, delegateOf(self.model, self.delegate), size(model)];
      },
      ([model, delegate]) => void untrack(() => rows.set(model, delegate)),
    );
  },
});
