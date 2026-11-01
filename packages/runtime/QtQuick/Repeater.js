// Repeater: an item for every row of a model, as children of its own parent.
// What it does is what Qt Quick 3D's Repeater3D does with nodes, so both are
// made here.
import { signal, untrack } from "#kernel";
import { defineType, effect, slot } from "../object.js";
import { Item } from "./Item.js";
import { delegateOf, modelOf, Rows, size } from "./model.js";

const next = (version) => version + 1;

// The items in the order of their rows: what `Item` puts in the parent's
// `children` before the Repeater.
function ordered(self) {
  const { rows } = self.$repeat;
  const items = [];
  for (let index = 0; index < rows.count; index++) {
    const item = rows.live.get(index)?.$item;
    if (item?.$node) items.push(item);
  }
  return items;
}

// What makes one of its delegate for every row of a model. QtQuick's puts
// them in its own parent (`own` false) and Qt Quick 3D's in itself; each
// names what it made in its own words: the method that gives one of them,
// and the signals of one made and one gone.
export function repeating(name, base, { at, added, removed, own = false }) {
  return defineType(name, base, {
    properties: { model: undefined, delegate: undefined, count: 0 },
    signals: [added, removed],
    methods: {
      [at](index) {
        return this.$repeat.rows.live.get(index)?.$item ?? null;
      },
      ...(!own && {
        $siblings() {
          const state = this.$repeat;
          state.version();
          return (state.items ??= ordered(this));
        },
      }),
    },
    setup(self) {
      const [version, bump] = signal(0, self.$owner);
      const changed = () => {
        state.items = null;
        slot(self, "count").write(rows.count);
        bump(next);
      };
      const rows = new Rows({
        self,
        owner: self.$owner,
        parent: () => (own ? self : self.$parent),
        // Every row has its item, whether or not it can be seen.
        inserted(index, count) {
          if (rows.ready) for (let at = index; at < index + count; at++) rows.row(at);
          changed();
        },
        // Of those in itself the last goes first, as in Qt.
        removed(index, count, gone) {
          changed();
          for (const row of own ? gone.toReversed() : gone) {
            if (own) self.$remove(row.$item);
            self[removed](row.$index, row.$item);
          }
        },
        moved: changed,
        created(row) {
          if (own) self.$add(row.$item);
          self[added](row.$index, row.$item);
        },
      });
      const state = (self.$repeat = { rows, version, items: null });
      effect(
        () => {
          const model = modelOf(self.model);
          return [model, delegateOf(self.model, self.delegate), size(model)];
        },
        ([model, delegate]) =>
          void untrack(() => {
            // A number of them that changes is all of them anew there.
            if (own && typeof model === "number" && typeof rows.source === "number" && model !== rows.source) rows.set(undefined, delegate);
            rows.set(model, delegate);
          }),
      );
    },
  });
}

export const Repeater = repeating("Repeater", Item, { at: "itemAt", added: "itemAdded", removed: "itemRemoved" });
