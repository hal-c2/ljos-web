// ItemGroup: items one over the other, each as big as the group, which is
// as big as the biggest of them wants to be.
import { defineType, derived, effect, slot } from "../../../object.ts";
import { Item } from "../../Item.js";

const most = (name) => derived((self) => self.children.reduce((size, child) => Math.max(size, child[name]), 0));

export const ItemGroup = defineType("ItemGroup", Item, {
  properties: {
    implicitWidth: most("implicitWidth"),
    implicitHeight: most("implicitHeight"),
  },
  setup(self) {
    effect(
      () => [self.children, self.width, self.height],
      ([children, width, height]) => {
        for (const child of children) {
          slot(child, "width").provide(width);
          slot(child, "height").provide(height);
        }
      },
    );
  },
});
