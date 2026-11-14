// What a style attaches to an object (`Material.theme`, `Universal.accent`)
// is inherited: an item has what the item it is in has, an item in none what
// its window has, a window what the window it belongs to has. What was set on
// an object is its own and that of everything inside it.
import { chosen, slot } from "../../object.ts";
import { styleHints } from "../../QtQml/application.ts";
import { Color, color } from "../color.ts";
import { Item } from "../Item.js";
import { windowOf } from "../Window.js";

// The attached object of `Type` that the one of `object` inherits from. One
// is made for every object on the way up: only so does each hear of a change
// above it.
export function around(Type, object) {
  // The item of a popup is in the popup, wherever it is shown.
  if (Item.proto.isPrototypeOf(object)) return Type.attached(object.$popup ?? object.parent ?? object.$window) ?? null;
  // A popup is in the window of what it is shown over, as Qt has it, and not
  // in that item.
  if (object.$pop) return Type.attached(windowOf(object.parent)) ?? null;
  // A window is in the window it belongs to.
  return Type.attached("transientParent" in object ? object.transientParent : object.parent) ?? null;
}

// What a property was given, or undefined: its own default is to inherit.
export function said(self, name) {
  const own = slot(self, name);
  return own.explicit() ? own.own() : undefined;
}

// A style imported where nothing has chosen one is the style, as in Qt.
export function preferred(style) {
  if (!chosen.has("QtQuick.Controls")) chosen.set("QtQuick.Controls", style);
}

// A style's `Theme`: Light, Dark, and System, which is whichever of the two
// the platform is in (`Qt::ColorScheme::Dark`).
export const Theme = { Light: 0, Dark: 1, System: 2 };
export const system = (theme) => (theme !== Theme.System ? theme : styleHints().colorScheme === 2 ? Theme.Dark : Theme.Light);

// The theme an object is in, Light or Dark: the one it was given, else that
// of what it is in (`up`), else the application's (`all`).
export function themeOf(self, up, all) {
  const given = said(self, "theme");
  if (given === Theme.Light || given === Theme.Dark || given === Theme.System) return system(given);
  return up ? up.$style.theme() : system(all);
}

// A colour as Qt writes one in its tables, `0xAARRGGBB`, and back.
export const fromArgb = (argb) => color(`#${(argb >>> 0).toString(16).padStart(8, "0")}`);

export function toArgb(value) {
  const text = value.toString();
  return text.length === 7 ? (0xff000000 | parseInt(text.slice(1), 16)) >>> 0 : parseInt(text.slice(1), 16);
}

// What `accent` and its like may be given: a colour of the style's own by
// its number or its name, or any colour. `{ value, custom }` as Qt keeps it,
// the number or the colour's `0xAARRGGBB`; null for what is neither.
export function chosenColour(given, names) {
  if (typeof given === "number") return Number.isInteger(given) && given >= 0 && given < names.length ? { value: given, custom: false } : null;
  if (typeof given === "string") {
    const index = names.indexOf(given);
    if (index !== -1) return { value: index, custom: false };
  }
  const colour = given instanceof Color ? given : typeof given === "string" ? color(given) : null;
  return colour?.valid ? { value: toArgb(colour), custom: true } : null;
}
