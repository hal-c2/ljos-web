// The buttons that are only pressed: Button, RoundButton, ToolButton, and
// TabButton, of which one of a bar is checked.
import { defineType } from "../../object.js";
import { AbstractButton } from "./AbstractButton.js";
import { speaks } from "../Accessible.js";

export const Button = defineType("Button", AbstractButton, {
  properties: { highlighted: false, flat: false },
});

// As round as it can be, unless it is told how round.
const round = (self, own) => {
  const radius = own();
  return radius < 0 ? Math.max(0, Math.min(self.width, self.height) / 2) : radius;
};

export const RoundButton = defineType("RoundButton", Button, {
  properties: { radius: -1 },
  resolve: { radius: round },
});

export const ToolButton = defineType("ToolButton", Button);

export const TabButton = defineType("TabButton", AbstractButton, {
  properties: { checkable: true, autoExclusive: true },
});

speaks(TabButton, "PageTab");
