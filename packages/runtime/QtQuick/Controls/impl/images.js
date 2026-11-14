// ColorImage, IconImage: a picture painted in one colour, as a style's
// indicators and a button's icon are.
import { allowedUrl } from "../../../guard.js";
import { defineType, derived, effect } from "../../../object.ts";
import { colorValue, equal } from "../../color.ts";
import { rules } from "../../compute.ts";
import { drawn, geometry, Image } from "../../Image.js";

// The colour is what is painted, and the picture what lets it through: the
// picture's own colours are gone, its shape and how opaque it is stay.
rules(`
.qq-image.qq-tinted { background-image: none !important; }
`);

const READY = 1;
const FIT = 1;
const PAD = 6;

// `tint` reads the colour to paint in, or nothing for the picture as it is.
function tinted(self, tint) {
  const face = self.$face;
  const style = face.style;
  effect(
    () => {
      const colour = tint();
      const record = self.$image.record();
      if (!colour || !record || record.status() !== READY) return null;
      const { inner, repeat } = geometry(self);
      return { url: drawn(record), inner, repeat, colour: colour.css() };
    },
    (next) => {
      face.classList.toggle("qq-tinted", Boolean(next));
      if (!next) return void (style.maskImage = style.backgroundColor = "");
      const [x, y, wide, tall] = next.inner;
      style.maskImage = `url(${JSON.stringify(allowedUrl(next.url))})`;
      style.maskSize = `${wide}px ${tall}px`;
      style.maskPosition = `${x}px ${y}px`;
      style.maskRepeat = next.repeat;
      style.backgroundColor = next.colour;
    },
  );
}

// A colour that is not see-through at all is one to paint in.
const seen = (colour) => (colour.valid && colour.a > 0 ? colour : null);

export const ColorImage = defineType("ColorImage", Image, {
  properties: {
    color: "transparent",
    // The colour the picture is drawn in already: asked for that one, it is
    // left as it is.
    defaultColor: "transparent",
  },
  resolve: { color: colorValue, defaultColor: colorValue },
  setup(self) {
    tinted(self, () => (equal(self.color, self.defaultColor) ? null : seen(self.color)));
  },
});

// An icon: by its source, in its colour. One by `name` is of an icon theme,
// which a browser has none of: it is no picture here.
export const IconImage = defineType("IconImage", Image, {
  properties: {
    name: "",
    color: "transparent",
    // At its own size where there is room for it, and smaller where not.
    fillMode: derived((self) => {
      const { width, height } = self.$image.size();
      return width > self.width || height > self.height ? FIT : PAD;
    }),
    // The picture's, whatever the room: the size of an icon's item is
    // worked out from these.
    implicitWidth: derived((self) => self.$image.size().width),
    implicitHeight: derived((self) => self.$image.size().height),
  },
  resolve: { color: colorValue },
  methods: {
    // An icon is loaded before its fill mode is chosen, by the size it
    // came at.
    $keeps() {
      return false;
    },
  },
  setup(self) {
    tinted(self, () => seen(self.color));
  },
});
