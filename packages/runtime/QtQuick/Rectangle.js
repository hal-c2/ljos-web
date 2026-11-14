// Rectangle: a colour, rounded corners, a border, a gradient.
import { contents, defineType, effect, group, QtObject, slot } from "../object.ts";
import { allowedStyle } from "../guard.js";
import { colorValue, css } from "./color.js";
import { Item } from "./Item.js";

export const GradientStop = defineType("GradientStop", QtObject, {
  properties: { position: 0, color: "black" },
  resolve: { color: colorValue },
});

export const Gradient = defineType("Gradient", QtObject, {
  properties: { orientation: 0, stops: undefined },
  enums: { Vertical: 0, Horizontal: 1 },
  methods: {
    $css() {
      const stops = (this.stops ?? this.$stops).map((stop) => `${css(stop.color)} ${stop.position * 100}%`);
      return `linear-gradient(${this.orientation === 1 ? "to right" : "to bottom"},${stops.join(",")})`;
    },
  },
  setup(self) {
    self.$stops = [];
  },
  adopt(self, props) {
    self.$stops = contents(props);
  },
});

// A corner's radius, or the one all four have.
const corner = (self, name) => self[name] ?? self.radius;

export const Rectangle = defineType("Rectangle", Item, {
  properties: {
    color: "white",
    radius: 0,
    topLeftRadius: undefined,
    topRightRadius: undefined,
    bottomLeftRadius: undefined,
    bottomRightRadius: undefined,
    gradient: undefined,
    border: group({ width: 1, color: "black", pixelAligned: true }),
  },
  // Colours read back as values: `rect.color.r`, `Qt.lighter(rect.color)`.
  resolve: { color: colorValue, border$color: colorValue },
  setup(self) {
    const style = self.$node.style;
    effect(
      () => self.gradient?.$css() ?? css(self.color),
      (background) => {
        const allowed = allowedStyle(background);
        style.background = allowed; // guarded
        if (self.$under) style.setProperty("--qq-fill", allowed);
      },
    );
    effect(
      () => {
        const radius = self.radius;
        const corners = [
          corner(self, "topLeftRadius"),
          corner(self, "topRightRadius"),
          corner(self, "bottomRightRadius"),
          corner(self, "bottomLeftRadius"),
        ];
        return corners.every((each) => each === radius) ? radius : corners;
      },
      (radius) => {
        style.borderRadius = Array.isArray(radius) ? radius.map((each) => `${each}px`).join(" ") : radius ? `${radius}px` : "";
      },
    );
    // Qt draws a border only once its width or its colour was given, and
    // inside the rectangle: its size stays the item's.
    effect(
      () => {
        const drawn = slot(self, "border$width").explicit() || slot(self, "border$color").explicit();
        const width = self.border.width;
        return drawn && width > 0 ? `inset 0 0 0 ${width}px ${css(self.border.color)}` : "";
      },
      (shadow) => {
        style.boxShadow = shadow;
        if (self.$under) style.setProperty("--qq-edge", shadow || "none");
      },
    );
  },
  methods: {
    // Every item has a transform, so is a stacking context, and one paints its
    // own background under its children of negative z: Qt has them under the
    // whole item. A child like that moves the fill into a layer above them.
    $lower() {
      if (this.$under) return;
      this.$under = true;
      const { classList, style } = this.$node;
      style.setProperty("--qq-fill", style.background);
      style.setProperty("--qq-edge", style.boxShadow || "none");
      classList.add("qq-under");
    },
  },
});
