// The colours a style paints with: `SystemPalette`, and `Palette` with its
// three `ColorGroup`s.
//
// The numbers are what Qt 6.11 answers with its own (Fusion) light palette,
// read from `qml6`: a browser has no palette to ask for.
import { runWithOwner } from "solid-js";
import { defineType, derived, group, QtObject, slot } from "../object.ts";
import type { QObject, Resolve } from "../object.ts";
import { color, colorValue } from "./color.ts";
import { untrack } from "#kernel";
import { styleHints } from "../QtQml/application.ts";

type Role = keyof typeof ACTIVE;
type Colours = Record<Role, string>;

// What a palette is asked through: `paletteOf` sets all three.
interface Paletted extends QObject {
  $from?: (() => Paletted | null | undefined) | undefined;
  $base?: (() => Record<string, Colours> | undefined) | undefined;
  $group?: (() => string) | undefined;
}

// What an item or a window that has a palette gives it.
interface Owning extends QObject {
  $palette?: Paletted;
  $colours?: () => Record<string, Colours> | undefined;
}

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

// Qt 6.11: Fusion's dark palette is not measured (the oracle cannot be put
// in a dark scheme), so a dark scheme answers with Basic's dark colours,
// as ljos-ui's palette does (ljos_quick palette.rs): a palette nobody set
// follows the reader's scheme, and what is drawn with it stays readable.
const DARK_ACTIVE: Colours = {
  alternateBase: "#2b2b2b",
  base: "#000000",
  brightText: "#000000",
  button: "#2f2f2f",
  buttonText: "#d4d6d8",
  dark: "#c8c9cb",
  highlight: "#0d69f2",
  highlightedText: "#fdfdfd",
  light: "#1a1a1a",
  link: "#2f86b1",
  linkVisited: "#ff00ff",
  mid: "#626262",
  midlight: "#2c2c2c",
  shadow: "#28282a",
  text: "#eff0f2",
  toolTipBase: "#000000",
  toolTipText: "#ffffff",
  window: "#000000",
  windowText: "#d4d6d8",
  placeholderText: "#88c8c9cb",
  accent: "#308cc6",
};

const DARK_DISABLED: Colours = {
  ...DARK_ACTIVE,
  base: "#292929",
  brightText: "#4d000000",
  buttonText: "#4dd4d6d8",
  highlight: "#01060f",
  text: "#7fc8c9cb",
  windowText: "#3f4040",
  accent: "#919191",
};

const ROLES = Object.keys(ACTIVE) as Role[];
// An inactive window is painted as an active one.
const LIGHT: Record<string, Colours> = { active: ACTIVE, inactive: ACTIVE, disabled: DISABLED };
const DARK: Record<string, Colours> = { active: DARK_ACTIVE, inactive: DARK_ACTIVE, disabled: DARK_DISABLED };
// The colours of the scheme in use (`Qt::ColorScheme::Dark` is 2), read
// where a colour is, so it changes as the scheme does.
const numbers = () => (styleHints().colorScheme === 2 ? DARK : LIGHT);

const each = <T,>(make: (role: Role) => T): Record<Role, T> => Object.fromEntries(ROLES.map((role) => [role, make(role)])) as Record<Role, T>;

// `ColorGroup {}` on its own: the active colours, until it is given others.
export const ColorGroup = defineType("ColorGroup", QtObject, {
  properties: each((role) => ACTIVE[role]),
  resolve: each(() => colorValue),
});

// What a palette says for a role whatever the group: `palette.button: "red"`
// is the button colour of all three.
function common(self: QObject, role: Role): unknown {
  const all = slot(self, role)!;
  return all.explicit() ? all.own() : undefined;
}

// What the palette was given for a role of a group, or the one it follows
// was: not what either answers when nothing was said.
function said(self: Paletted | null | undefined, name: string, role: Role): unknown {
  for (let at = self; at; at = at.$from?.()) {
    const own = slot(at, `${name}$${role}`)!;
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
const part = (name: string) =>
  group(
    each((role) =>
      derived((self: Paletted) => common(self, role) ?? said(self.$from?.(), name, role) ?? (self.$base?.() ?? numbers())[name]![role]),
    ),
  );

// The colours of a style, as a palette's defaults: the active ones, and what
// is different of an object that is not enabled.
export const colours = (active: Colours, disabled: Partial<Colours>): Record<string, Colours> => ({ active, inactive: active, disabled: { ...active, ...disabled } });

const resolve: Record<string, Resolve> = each(
  (role): Resolve =>
    (self) =>
      (self[(self as Paletted).$group?.() ?? "active"] as Colours)[role],
);
for (const name of Object.keys(LIGHT)) {
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
      ].map((role) => [role, derived((self) => color(numbers()[GROUPS[self.colorGroup as number] ?? "active"]![role as Role]))]),
    ),
  },
  enums: { Active: 0, Disabled: 1, Inactive: 2 },
});

// The `palette` of an item or a window (Item.js and Window.js give each
// theirs), made once from the roles somebody set on it: the object's
// `palette$button` is its palette's `button`. What nobody set comes
// `from` its parent's, or from what the item is (`$colours`).
const PREFIX = "palette$";

export function paletteOf(
  self: Owning,
  from?: () => Paletted | null | undefined,
  group?: () => string,
): Paletted {
  if (self.$palette) return self.$palette;
  const props: Record<string, unknown> = {};
  for (const key of Object.keys(self.$props)) {
    if (key.startsWith(PREFIX)) Object.defineProperty(props, key.slice(PREFIX.length), Object.getOwnPropertyDescriptor(self.$props, key)!);
  }
  const made = runWithOwner(self.$owner, () => untrack(() => Palette(props))) as Paletted;
  made.$from = from;
  made.$group = group;
  made.$base = () => self.$colours?.();
  Object.defineProperty(self, "$palette", { value: made });
  return made;
}
