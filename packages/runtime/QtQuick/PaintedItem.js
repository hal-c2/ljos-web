// PaintedItem: an item that paints itself, what a type of another module
// (LottieAnimation) is made from. It is not made in QML by itself.
//
// What it paints starts at its top left corner and is cut off at the edge
// of the area it paints: its own rectangle, made larger by `contentsSize`
// times `contentsScale` where that reaches further. `fillColor` fills that
// area under what is painted, and a `contentsScale` of 0 paints nothing at
// all. `textureSize` and `renderTarget` say how Qt keeps the picture, which
// here the browser does: they are kept and change nothing.
import { defineType } from "../object.ts";
import { Size } from "../QtQml/values.ts";
import { colorValue } from "./color.ts";
import { Item } from "./Item.js";

export const PaintedItem = defineType("PaintedItem", Item, {
  properties: {
    contentsSize: new Size(-1, -1),
    fillColor: "#00000000",
    contentsScale: 1,
    renderTarget: 0,
    textureSize: new Size(-1, -1),
  },
  enums: { Image: 0, FramebufferObject: 1, InvertedYFramebufferObject: 2, FastFBOResizing: 1 },
  resolve: { fillColor: colorValue },
});

// The width and height of the area `self` paints, from its top left corner.
export function paintArea(self) {
  const scale = Number(self.contentsScale) || 0;
  const contents = self.contentsSize;
  const width = Math.max(Number(self.width) || 0, (Number(contents?.width) || 0) * scale, 0);
  const height = Math.max(Number(self.height) || 0, (Number(contents?.height) || 0) * scale, 0);
  return [width, height];
}
