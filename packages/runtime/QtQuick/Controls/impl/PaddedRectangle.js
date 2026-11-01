// PaddedRectangle: a rectangle painted inside its item, or beyond it where a
// padding is negative: a style rounds two corners of four by letting the
// other two fall outside what is clipped.
import { defineType, derived, effect, slot } from "../../../object.js";
import { allowedStyle } from "../../../guard.js";
import { css } from "../../color.js";
import { rules } from "../../compute.js";
import { Rectangle } from "../../Rectangle.js";

// The item paints nothing itself: what a Rectangle would is painted by an
// element of its own, under what is inside the item.
rules(`
.qq.qq-padded { background: none !important; box-shadow: none !important; border-radius: 0 !important; }
.qq-padded > .qq-pad { position: absolute; box-sizing: border-box; }
`);

const padding = derived((self) => self.padding);
const corner = (self, name) => self[name] ?? self.radius;

export const PaddedRectangle = defineType("PaddedRectangle", Rectangle, {
  properties: {
    padding: 0,
    topPadding: padding,
    leftPadding: padding,
    rightPadding: padding,
    bottomPadding: padding,
  },
  setup(self) {
    const face = document.createElement("div");
    face.className = "qq-pad";
    self.$node.classList.add("qq-padded");
    self.$node.append(face);
    const style = face.style;
    effect(
      () => {
        const left = self.leftPadding;
        const top = self.topPadding;
        const drawn = slot(self, "border$width").explicit() || slot(self, "border$color").explicit();
        const border = self.border.width;
        return {
          left,
          top,
          width: Math.max(0, self.width - left - self.rightPadding),
          height: Math.max(0, self.height - top - self.bottomPadding),
          background: self.gradient?.$css() ?? css(self.color),
          radius: ["topLeftRadius", "topRightRadius", "bottomRightRadius", "bottomLeftRadius"].map((name) => `${corner(self, name)}px`).join(" "),
          shadow: drawn && border > 0 ? `inset 0 0 0 ${border}px ${css(self.border.color)}` : "",
        };
      },
      (next) => {
        style.left = `${next.left}px`;
        style.top = `${next.top}px`;
        style.width = `${next.width}px`;
        style.height = `${next.height}px`;
        style.background = allowedStyle(next.background);
        style.borderRadius = next.radius;
        style.boxShadow = next.shadow;
      },
    );
  },
});
