// RectangularShadow: the shadow a rectangle would cast, without the
// rectangle. A box in the shadow's colour, blurred by CSS.
import { Vector2d } from "../../QtQml/values.ts";
import { defineType, derived, effect } from "../../object.ts";
import { allowedStyle } from "../../guard.js";
import { colorValue, css } from "../color.js";
import { rules } from "../compute.js";
import { Item } from "../Item.js";

rules(".qq-shadow { position: absolute; pointer-events: none; }");

// How soft a `blur` of one pixel is, as the standard deviation CSS blurs
// by: measured on what Qt draws, where the edge of a shadow is as wide as
// one blurred by 0.42 of its `blur`.
export const SOFTNESS = 0.42;

// A corner that was not given its own radius has the one all four have.
const corner = derived((self) => self.radius);

const CORNERS = ["topLeftRadius", "topRightRadius", "bottomRightRadius", "bottomLeftRadius"];

export const RectangularShadow = defineType("RectangularShadow", Item, {
  properties: {
    offset: Object.freeze(new Vector2d(0, 0)),
    color: "black",
    blur: 10,
    radius: 0,
    topLeftRadius: corner,
    topRightRadius: corner,
    bottomLeftRadius: corner,
    bottomRightRadius: corner,
    spread: 0,
    // Qt can keep the shadow as a picture and draw it with a shader of
    // one's own: the browser decides the first, and there is no second.
    cached: false,
    material: null,
    antialiasing: true,
  },
  resolve: { color: colorValue },
  setup(self) {
    const box = document.createElement("div");
    box.className = "qq-shadow";
    self.$node.append(box);
    const style = box.style;
    effect(
      () => {
        const spread = Number(self.spread) || 0;
        const width = Math.max(0, self.width + 2 * spread);
        const height = Math.max(0, self.height + 2 * spread);
        const most = Math.min(width, height) / 2;
        return {
          left: (Number(self.offset?.x) || 0) - spread,
          top: (Number(self.offset?.y) || 0) - spread,
          width,
          height,
          // The shadow spreads around a round corner; a square one stays
          // square.
          radii: CORNERS.map((name) => {
            const radius = Number(self[name]) || 0;
            return radius > 0 ? Math.min(Math.max(0, radius + spread), most) : 0;
          }),
          colour: css(self.color),
          soft: Math.max(0, Number(self.blur) || 0) * SOFTNESS,
        };
      },
      (next) => {
        style.left = `${next.left}px`;
        style.top = `${next.top}px`;
        style.width = `${next.width}px`;
        style.height = `${next.height}px`;
        style.borderRadius = next.radii.some((radius) => radius > 0)
          ? next.radii.map((radius) => `${radius}px`).join(" ")
          : "";
        style.background = allowedStyle(next.colour);
        style.filter = next.soft > 0 ? allowedStyle(`blur(${next.soft}px)`) : "";
      },
    );
  },
});
