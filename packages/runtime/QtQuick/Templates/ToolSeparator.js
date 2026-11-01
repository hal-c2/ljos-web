// ToolSeparator and MenuSeparator: a line between the tools of a tool bar
// and between the items of a menu. The line is the style's.
import { defineType, derived } from "../../object.js";
import { Control } from "./Control.js";
import { Horizontal, Vertical } from "./Slider.js";
import { speaks } from "../Accessible.js";

export const ToolSeparator = defineType("ToolSeparator", Control, {
  properties: {
    orientation: Vertical,
    horizontal: derived((self) => self.orientation === Horizontal),
    vertical: derived((self) => self.orientation === Vertical),
  },
});

export const MenuSeparator = defineType("MenuSeparator", Control, {});

speaks(ToolSeparator, "Separator");
speaks(MenuSeparator, "Separator");
