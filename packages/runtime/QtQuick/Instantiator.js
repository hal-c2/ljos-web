// Instantiator: an object for every row of a model, of any type and with no
// place in the scene. It is QtQml's, which `import QtQuick` brings with it.
import { defineType, effect, QtObject, slot } from "../object.js";
import { Rows, size } from "./model.js";
import { untrack } from "#kernel";

export const Instantiator = defineType("Instantiator", QtObject, {
  properties: { model: 1, delegate: undefined, active: true, count: 0, object: null },
  signals: ["objectAdded", "objectRemoved"],
  methods: {
    objectAt(index) {
      return this.$rows.live.get(index)?.$item ?? null;
    },
  },
  setup(self) {
    const changed = () => {
      slot(self, "count").write(rows.count);
      slot(self, "object").write(rows.live.get(0)?.$item ?? null);
    };
    const rows = (self.$rows = new Rows({
      self,
      owner: self.$owner,
      parent: () => null,
      inserted(index, count) {
        if (rows.ready) for (let at = index; at < index + count; at++) rows.row(at);
        changed();
      },
      removed(index, count, gone) {
        changed();
        for (const row of gone) self.objectRemoved(row.$index, row.$item);
      },
      moved: changed,
      created: (row) => self.objectAdded(row.$index, row.$item),
    }));
    effect(
      () => [self.active ? self.model : 0, self.delegate, size(self.model)],
      ([model, delegate]) => void untrack(() => rows.set(model, delegate)),
    );
  },
});
