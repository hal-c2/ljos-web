// The colours a style paints with: `SystemPalette`, and `Palette` with its
// three `ColorGroup`s.
//
// The numbers are what Qt 6.11 answers with its own (Fusion) light palette,
// read from `qml6`: a browser has no palette to ask for.
import { runWithOwner } from "solid-js";
import { defineType, derived, group, QtObject, slot } from "../object.js";
import { color, colorValue } from "./color.js";
import { untrack } from "#kernel";

const ACTIVE = {
  alternateBase: "#f7f7f7",
  base: "#ffffff",
  brightText: "#ffffff",
  button: "#efefef",
  buttonText: "#000000",
  dark: "#9f9f9f",
  highlight: "#308cc6",
  highlightedText: "#ffffff",
  light: "#ffffff",
  link: "#0000ff",
  linkVisited: "#ff00ff",
  mid: "#b8b8b8",
  midlight: "#cacaca",
  shadow: "#767676",
  text: "#000000",
  toolTipBase: "#ffffdc",
  toolTipText: "#000000",
  window: "#efefef",
  windowText: "#000000",
  placeholderText: "#80000000",
  accent: "#308cc6",
};

const DISABLED = {
  ...ACTIVE,
  base: "#efefef",
  buttonText: "#bebebe",
  dark: "#bebebe",
  highlight: "#919191",
  shadow: "#b1b1b1",
  text: "#bebebe",
  windowText: "#bebebe",
  accent: "#919191",
};

const ROLES = Object.keys(ACTIVE);
// An inactive window is painted as an active one.
const NUMBERS = { active: ACTIVE, inactive: ACTIVE, disabled: DISABLED };

const each = (make) => Object.fromEntries(ROLES.map((role) => [role, make(role)]));

// `ColorGroup {}` on its own: the active colours, until it is given others.
export const ColorGroup = defineType("ColorGroup", QtObject, {
  properties: each((role) => ACTIVE[role]),
  resolve: each(() => colorValue),
});

// What a palette says for a role whatever the group: `palette.button: "red"`
// is the button colour of all three.
function common(self, role) {
  const all = slot(self, role);
  return all.explicit() ? all.own() : undefined;
}

// What the palette was given for a role of a group, or the one it follows
// was: not what either answers when nothing was said.
function said(self, name, role) {
  for (let at = self; at; at = at.$from?.()) {
    const own = slot(at, `${name}$${role}`);
    const value = own.explicit() ? own.get() : common(at, role);
    if (value !== undefined) return value;
  }
  return undefined;
}

// A group's colour: its own, else the palette's for every group, else what
// the palette this one follows was given (an item's follows its parent's:
// `$from` is set by `paletteOf`, which gives items a palette), else the
// colours of whatever has the palette (`$base`: a control's are its
// style's), else Qt's.
const part = (name) =>
  group(
    each((role) =>
      derived((self) => common(self, role) ?? said(self.$from?.(), name, role) ?? (self.$base?.() ?? NUMBERS)[name][role]),
    ),
  );

// The colours of a style, as a palette's defaults: the active ones, and what
// is different of an object that is not enabled.
export const colours = (active, disabled) => ({ active, inactive: active, disabled: { ...active, ...disabled } });

const resolve = each((role) => (self) => self[self.$group?.() ?? "active"][role]);
for (const name of Object.keys(NUMBERS)) {
  for (const role of ROLES) resolve[`${name}$${role}`] = colorValue;
}

// Read without a group, a palette answers for the one in use: `$group`,
// which says "disabled" for an item that is, is set like `$from`.
export const Palette = defineType("Palette", ColorGroup, {
  properties: {
    ...each(() => undefined),
    active: part("active"),
    inactive: part("inactive"),
    disabled: part("disabled"),
  },
  resolve,
});

// By `SystemPalette.Active`, `Disabled` and `Inactive`.
const GROUPS = ["active", "disabled", "inactive"];

// SystemPalette: the same colours by `colorGroup`, read only.
export const SystemPalette = defineType("SystemPalette", QtObject, {
  properties: {
    colorGroup: 0,
    ...Object.fromEntries(
      [
        "window",
        "windowText",
        "base",
        "text",
        "alternateBase",
        "button",
        "buttonText",
        "light",
        "midlight",
        "dark",
        "mid",
        "shadow",
        "highlight",
        "highlightedText",
        "placeholderText",
        "accent",
      ].map((role) => [role, derived((self) => color(NUMBERS[GROUPS[self.colorGroup] ?? "active"][role]))]),
    ),
  },
  enums: { Active: 0, Disabled: 1, Inactive: 2 },
});

// The `palette` of an item or a window (Item.js and Window.js give each
// theirs), made once from the roles somebody set on it: the object's
// `palette$button` is its palette's `button`. What nobody set comes
// `from` its parent's, or from what the item is (`$colours`).
const PREFIX = "palette$";

export function paletteOf(self, from, group) {
  if (self.$palette) return self.$palette;
  const props = {};
  for (const key of Object.keys(self.$props)) {
    if (key.startsWith(PREFIX)) Object.defineProperty(props, key.slice(PREFIX.length), Object.getOwnPropertyDescriptor(self.$props, key));
  }
  const made = runWithOwner(self.$owner, () => untrack(() => Palette(props)));
  made.$from = from;
  made.$group = group;
  made.$base = () => self.$colours?.();
  Object.defineProperty(self, "$palette", { value: made });
  return made;
}
