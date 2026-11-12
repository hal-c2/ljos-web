// What several types ask of an object beyond its properties.
import { looped, slot } from "../object.js";

// A value computed from the object's properties when first asked for, and
// again only when one of them changes: a text's layout, an image's size.
// Not made in `setup`, which may not read a property. A property it reads may
// be bound to what it gives: a loop, ended as a binding's is, in which it
// gives `first` until it is computed.
export function lazy(self, compute, first) {
  return looped(self.$owner, compute, first);
}

// Whether a property of a group was given, by itself or through the whole
// group (`font: other.font`, `sourceSize: Qt.size(10, 10)`). A member
// that stands alone (a font's `size`) is given only by itself: a whole
// font value always has one, as its pixel size by the other name.
export function given(self, name, member) {
  const at = slot(self, `${name}$${member}`);
  return at.explicit() || (!at.alone && slot(self, name).get()?.[member] !== undefined);
}

// Whether something decides the item's width (or height): what it was given,
// a layout, its anchors. Qt's `widthValid`: text wraps and elides only then.
export function sized(self, name) {
  const own = slot(self, name);
  if (own.explicit() || own.placed !== undefined) return true;
  const anchors = self.anchors;
  if (anchors.fill) return true;
  return name === "width" ? Boolean(anchors.left && anchors.right) : Boolean(anchors.top && anchors.bottom);
}

// Adds rules to the page, as `style.js` does for items.
export function rules(text) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(text);
  document.adoptedStyleSheets.push(sheet);
}
