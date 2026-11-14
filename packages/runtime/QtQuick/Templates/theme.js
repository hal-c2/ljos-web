// What a style says in C++ and not in QML: the colours its controls take
// from their palette, and the fonts they are set in.
//
// Each style the runtime has tells what its are (`themed`); the one a build
// chose for `QtQuick.Controls` is the one in use. Without any, a control is
// painted in Qt's own colours and font, as with Qt's Fusion style.
import { chosen } from "../../object.ts";

const FONT = Object.freeze({ family: "Sans Serif", pixelSize: 12, weight: 400 });
const PLAIN = { palette: undefined, font: FONT, fonts: {} };

const themes = new Map();

// - `palette`: what `colours()` of `Palette.js` makes, or none for Qt's own.
// - `font`: what every control is set in, where it is not Qt's default.
// - `fonts`: by the name of a type of QtQuick.Templates, what is different
//   for a control of that type or of one derived from it.
export function themed(style, { palette, font, fonts = {} }) {
  themes.set(style, { palette, font: Object.freeze({ ...FONT, ...font }), fonts, resolved: new Map() });
}

const theme = () => themes.get(chosen.get("QtQuick.Controls")) ?? PLAIN;

export const palette = () => theme().palette;

// The font of a control that nothing gave one: its type's, the nearest in
// the chain the style says anything about.
export function font(type) {
  const { font, fonts, resolved } = theme();
  if (!resolved) return font;
  let found = resolved.get(type.typeName);
  if (!found) {
    const said = type.chain.findLast((one) => Object.hasOwn(fonts, one.typeName));
    resolved.set(type.typeName, (found = said ? Object.freeze({ ...font, ...fonts[said.typeName] }) : font));
  }
  return found;
}
