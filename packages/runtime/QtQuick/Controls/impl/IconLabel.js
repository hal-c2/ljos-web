// IconLabel: an icon and a text, beside or under one another: what a button
// has inside it. Its implicit size is what makes the button's.
import { defineType, derived, effect, group, inside, slot } from "../../../object.ts";
import { color, colorValue } from "../../color.ts";
import { lazy } from "../../compute.ts";
import { font } from "../../font.ts";
import { Item } from "../../Item.js";
import { AbstractButton } from "../../Templates/AbstractButton.js";
import { chord, chordText } from "../../keycodes.ts";
import { Text } from "../../Text.js";
import { IconImage } from "./images.js";
import { MnemonicLabel } from "./texts.js";
import { untrack } from "#kernel";

const ICON_ONLY = 0;
const TEXT_ONLY = 1;
const BESIDE = 2;
const UNDER = 3;

const LEFT = 0x1;
const RIGHT = 0x2;
const HCENTER = 0x4;
const ABSOLUTE = 0x10;
const TOP = 0x20;
const BOTTOM = 0x40;
const VCENTER = 0x80;
const HORIZONTAL = 0x1f;
const VERTICAL = 0x1e0;

// Where something of a size goes in a rectangle. Left and right change
// places when mirrored, unless the alignment is absolute.
function aligned(mirrored, alignment, width, height, [x, y, wide, tall]) {
  if (!(alignment & HORIZONTAL)) alignment |= LEFT;
  if (mirrored && !(alignment & ABSOLUTE) && alignment & (LEFT | RIGHT)) alignment ^= LEFT | RIGHT;
  if (alignment & VCENTER) y += tall / 2 - height / 2;
  else if (alignment & BOTTOM) y += tall - height;
  if (alignment & RIGHT) x += wide - width;
  else if (alignment & HCENTER) x += wide / 2 - width / 2;
  return [x, y, width, height];
}

// What an object's `icon` was given whole: another's icon (`icon:
// control.icon`), a plain value (`icon: ({ source: … })`), or nothing.
const wholeIcon = (self) => slot(self, "icon").get();

// Whether the icon was given a colour: by itself, by the icon it was given
// whole (a plain value, or the control whose icon this one is), or, for a
// button, by the action it follows. "transparent" is a colour too: it shows
// the picture as it is.
function coloured(self) {
  const own = slot(self, "icon$color");
  // `icon.color = undefined` takes the colour back.
  if (own.explicit()) return own.own() !== undefined;
  const whole = wholeIcon(self);
  const from = whole?.$self;
  if (whole && !from && whole.color !== undefined) return true;
  if (from && from !== self && from.$type.slots.icon$color && coloured(from)) return true;
  const action = isa(self, AbstractButton) ? self.action : null;
  return Boolean(action?.$type?.slots.icon$color) && coloured(action);
}

// The button a label is in, nearest first. Ljós's own styles write no
// `icon: control.icon`: Ljós's native engine shows a label the icon of the
// button it belongs to in whatever the label's own `icon` was not told
// (ljos-ui's crates/ljos_controls/src/icon_label.rs), and so does this, so
// the same QML shows the same icon on both.
const isa = (item, Type) => item?.$type?.chain.includes(Type) === true;
function buttonOf(self) {
  // A parent chain deeper than this is a cycle someone built by hand.
  for (let item = self.parent, depth = 0; item && depth < 4096; item = item.parent, depth++) {
    if (isa(item, AbstractButton)) return item;
  }
  return null;
}

// The button whose icon fills in what a label's own `icon` was not told:
// none where the label's whole `icon` is another's (Qt's `icon: control.icon`,
// which gives every member), or where it is in no button. Tracked, so a
// label moved into a button shows that button's icon.
function inheritsFrom(self) {
  const from = slot(self, "icon").get()?.$self;
  if (from && from !== self) return null;
  return buttonOf(self);
}

// One member of the icon a label shows: its own where it was told one, its
// button's (which is its action's, where it follows one) otherwise.
function leaf(self, name) {
  if (slot(self, `icon$${name}`).explicit()) return self.icon[name];
  // A member of a plain value the label's `icon` was given whole is told.
  const whole = wholeIcon(self);
  if (whole && !whole.$self && whole[name] !== undefined) return self.icon[name];
  const button = inheritsFrom(self);
  return button ? button.icon[name] : self.icon[name];
}

const opaque = (value) => color(value).a > 0;

// The colour a label's icon is drawn in. One it was given, by itself or by
// the control whose `icon` it takes; else, from the button it belongs to,
// the one the button or its action was given (transparent included), its
// `defaultIconColor`, or the colour of its text, as Ljós's
// native engine draws it. A label in no button that was given none keeps
// `defaultIconColor`, transparent unless told: the picture as it is, as Qt
// shows a bare IconLabel's.
function iconColor(self) {
  if (coloured(self)) return self.icon.color;
  const button = inheritsFrom(self);
  if (!button) return self.defaultIconColor;
  if (coloured(button)) return button.icon.color;
  return opaque(self.defaultIconColor) ? self.defaultIconColor : self.color;
}

export const IconLabel = defineType("IconLabel", Item, {
  properties: {
    icon: group({ name: "", source: "", width: 0, height: 0, color: "transparent", cache: true }),
    text: "",
    font,
    color: "black",
    display: BESIDE,
    spacing: 0,
    mirrored: false,
    alignment: HCENTER | VCENTER,
    topPadding: 0,
    leftPadding: 0,
    rightPadding: 0,
    bottomPadding: 0,
    // The colour of an icon that was given none.
    defaultIconColor: "transparent",
    implicitWidth: derived((self) => self.$both.sizes.width()),
    implicitHeight: derived((self) => self.$both.sizes.height()),
    baselineOffset: derived((self) => {
      const { parts, label } = self.$both;
      return parts().text ? label.y + label.baselineOffset : 0;
    }),
  },
  enums: { IconOnly: ICON_ONLY, TextOnly: TEXT_ONLY, TextBesideIcon: BESIDE, TextUnderIcon: UNDER },
  resolve: {
    color: colorValue,
    icon$color: (self, own) => color(own() ?? "transparent"),
    defaultIconColor: colorValue,
    // One that says nothing of a direction is in the middle of it.
    alignment(self, own) {
      const given = Number(own()) || 0;
      return (given & HORIZONTAL || HCENTER) | (given & VERTICAL || VCENTER);
    },
  },
  setup(self) {
    // Which of the two there is: Qt makes each when there is something for
    // it to show, and they are children of the label only then.
    const parts = lazy(self, () => {
      const display = self.display;
      return {
        icon: display !== TEXT_ONLY && (leaf(self, "name") !== "" || String(leaf(self, "source") ?? "") !== ""),
        text: display !== ICON_ONLY && String(self.text ?? "") !== "",
      };
    });
    const image = inside(self, () =>
      untrack(() =>
        IconImage({
          objectName: "image",
          get name() {
            return leaf(self, "name");
          },
          get source() {
            return parts().icon ? leaf(self, "source") : "";
          },
          get sourceSize$width() {
            return leaf(self, "width");
          },
          get sourceSize$height() {
            return leaf(self, "height");
          },
          get color() {
            return iconColor(self);
          },
          get cache() {
            return leaf(self, "cache");
          },
          get horizontalAlignment() {
            return self.alignment & HORIZONTAL;
          },
          get verticalAlignment() {
            return self.alignment & VERTICAL;
          },
          get x() {
            return placed().icon[0];
          },
          get y() {
            return placed().icon[1];
          },
          get width() {
            return placed().icon[2];
          },
          get height() {
            return placed().icon[3];
          },
        }),
      ),
    );
    const label = inside(self, () =>
      untrack(() =>
        MnemonicLabel({
          objectName: "label",
          get text() {
            return parts().text ? self.text : "";
          },
          get font() {
            return self.font;
          },
          get color() {
            return self.color;
          },
          elide: 1,
          get horizontalAlignment() {
            return self.alignment & HORIZONTAL;
          },
          get verticalAlignment() {
            return self.alignment & VERTICAL;
          },
          get x() {
            return placed().text[0];
          },
          get y() {
            return placed().text[1];
          },
          get width() {
            return Math.max(across().text, 0);
          },
          get height() {
            return placed().text[3];
          },
        }),
      ),
    );
    // The implicit size, each side by itself: the height is that of the
    // text's lines, which are laid out in the width the label has.
    const spaced = () => (parts().icon && parts().text && image.implicitWidth > 0 ? self.spacing : 0);
    const sizes = {
      width() {
        const { icon, text } = parts();
        const iconWidth = icon ? image.implicitWidth : 0;
        const textWidth = text ? label.implicitWidth : 0;
        const inner = self.display === BESIDE ? iconWidth + textWidth + spaced() : Math.max(iconWidth, textWidth);
        return inner + self.leftPadding + self.rightPadding;
      },
      height() {
        const { icon, text } = parts();
        const iconHeight = icon ? image.implicitHeight : 0;
        const textHeight = text ? label.implicitHeight : 0;
        const inner = self.display === UNDER ? iconHeight + textHeight + spaced() : Math.max(iconHeight, textHeight);
        return inner + self.topPadding + self.bottomPadding;
      },
    };
    self.$both = { image, label, parts, sizes };

    // How wide the two are, before how tall: the text's height comes of its
    // width. Qt's sizes of what is not there are none at all under an icon
    // (-1) and nothing beside one (0).
    const across = lazy(self, () => {
      const { icon, text } = parts();
      const display = self.display;
      const wide = self.width - self.leftPadding - self.rightPadding;
      const absent = display === UNDER ? -1 : 0;
      const iconWidth = icon ? Math.min(image.implicitWidth, wide) : absent;
      // Qt has no space after an icon that has no height either, which a
      // label with no height itself gives it: that is not asked here, where
      // the height is not known yet.
      const gap = icon && iconWidth > 0 && image.implicitHeight > 0;
      const spacing = text && gap ? self.spacing : 0;
      const room = display === BESIDE ? wide - iconWidth - spacing : wide;
      return { wide, icon: iconWidth, text: text ? Math.min(label.implicitWidth, room) : absent, gap };
    });

    const NONE = [0, 0, 0, 0];
    const placed = lazy(self, () => {
      const { icon, text } = parts();
      const display = self.display;
      const mirrored = self.mirrored;
      const alignment = self.alignment;
      const { wide, icon: iconWidth, text: textWidth, gap } = across();
      const tall = self.height - self.topPadding - self.bottomPadding;
      const room = [self.leftPadding, self.topPadding, wide, tall];
      // An icon is put on a whole pixel of what the label is in.
      const snapped = ([x, y, width, height]) => [Math.round(self.x + x) - self.x, Math.round(self.y + y) - self.y, width, height];
      if (display === ICON_ONLY) {
        return { icon: icon ? snapped(aligned(mirrored, alignment, iconWidth, Math.min(image.implicitHeight, tall), room)) : NONE, text: NONE };
      }
      if (display === TEXT_ONLY) {
        return { icon: NONE, text: text ? aligned(mirrored, alignment, textWidth, Math.min(label.implicitHeight, tall), room) : NONE };
      }
      const absent = display === UNDER ? -1 : 0;
      const iconHeight = icon ? Math.min(image.implicitHeight, tall) : absent;
      const spacing = text && gap && iconHeight > 0 ? self.spacing : 0;
      if (display === UNDER) {
        const textHeight = text ? Math.min(label.implicitHeight, tall - iconHeight - spacing) : absent;
        const both = aligned(mirrored, alignment, Math.max(iconWidth, textWidth), iconHeight + spacing + textHeight, room);
        return {
          icon: icon ? snapped(aligned(mirrored, HCENTER | TOP, iconWidth, iconHeight, both)) : NONE,
          text: text ? aligned(mirrored, HCENTER | BOTTOM, textWidth, textHeight, both) : NONE,
        };
      }
      const textHeight = text ? Math.min(label.implicitHeight, tall) : absent;
      const both = aligned(mirrored, alignment, iconWidth + spacing + textWidth, Math.max(iconHeight, textHeight), room);
      return {
        icon: icon ? snapped(aligned(mirrored, LEFT | VCENTER, iconWidth, iconHeight, both)) : NONE,
        text: text ? aligned(mirrored, RIGHT | VCENTER, textWidth, textHeight, both) : NONE,
      };
    });

    let shown = { icon: false, text: false };
    effect(
      () => parts(),
      (next) => {
        if (next.icon !== shown.icon) next.icon ? self.$add(image) : self.$remove(image);
        if (next.text !== shown.text) next.text ? self.$add(label) : self.$remove(label);
        shown = next;
      },
    );
  },
});

// A shortcut's text as Qt writes it: each of its chords, up to four, between
// ", ". "" for one Qt cannot read; null for none.
function sequenceText(sequence) {
  if (typeof sequence === "number") {
    const one = chord(sequence);
    return one ? chordText(one) : null;
  }
  if (typeof sequence !== "string" || sequence.trim() === "") return null;
  const texts = [];
  let rest = sequence.trim();
  while (rest !== "") {
    // The first character of a chord, and the one after each `+` between
    // its keys, belong to a key, so `Ctrl+,` is one chord and `Ctrl++,B` two.
    let at = -1;
    let key = true;
    for (let i = 0; i < rest.length && at < 0; i++) {
      if (key) key = false;
      else if (rest[i] === "+") key = true;
      else if (rest[i] === ",") at = i;
    }
    const one = chord(at < 0 ? rest : rest.slice(0, at));
    if (!one) return "";
    texts.push(chordText(one));
    rest = at < 0 ? "" : rest.slice(at + 1).trim();
  }
  return texts.length > 4 ? "" : texts.join(", ");
}

// MenuItemIconLabel (Qt 6.12): the IconLabel in a menu item, told which item
// it is in. Where the label shows its text and the item's action has a
// shortcut, the label shows the shortcut too: at its far side (its near side
// when mirrored), in the middle of its height, and only where it fits beside
// what else the label shows. Measured under qml6 6.12.
export const MenuItemIconLabel = defineType("MenuItemIconLabel", IconLabel, {
  properties: { menuItem: null },
  setup(self) {
    const both = self.$both;
    const keys = lazy(self, () => {
      const display = self.display;
      if (display !== TEXT_ONLY && display !== BESIDE) return null;
      return sequenceText(self.menuItem?.action?.shortcut);
    });
    // Qt 6.12: the shortcut's text takes the label's font and colour, and
    // the action's shortcut, as it is made, and follows none of them after.
    // Here it follows them.
    const shortcut = inside(self, () =>
      untrack(() =>
        Text({
          get text() {
            return keys() ?? "";
          },
          get font() {
            return self.font;
          },
          get color() {
            return self.color;
          },
          get visible() {
            return placed().shown;
          },
          get x() {
            return placed().x;
          },
          get y() {
            return placed().y;
          },
        }),
      ),
    );
    const { width: contentWidth, height: contentHeight } = both.sizes;
    const across = () => contentWidth() - self.leftPadding - self.rightPadding;
    const placed = lazy(self, () => {
      const width = shortcut.implicitWidth;
      // Shown only with room to spare: one that would just fit is not.
      // Qt 6.12: by itself, the text keeps the spacing from it twice.
      const spacing = self.display === TEXT_ONLY ? 2 * self.spacing : self.spacing;
      if (!(across() + spacing + width < self.width - self.leftPadding - self.rightPadding)) return { shown: false, x: 0, y: 0 };
      const tall = self.height - self.topPadding - self.bottomPadding;
      return {
        shown: true,
        x: self.mirrored ? self.leftPadding : self.width - self.rightPadding - width,
        y: self.topPadding + (tall - shortcut.implicitHeight) / 2,
      };
    });
    both.sizes = {
      width() {
        if (keys() === null) return contentWidth();
        // Qt 6.12: beside an icon, what it keeps for the shortcut is the
        // spacing and the shortcut's height, however wide the shortcut is;
        // for one it cannot read, which says nothing, only the height.
        if (self.display === BESIDE) return contentWidth() + (shortcut.implicitWidth > 0 ? self.spacing : 0) + shortcut.implicitHeight;
        return Math.max(across(), shortcut.implicitWidth) + self.leftPadding + self.rightPadding;
      },
      height() {
        if (keys() === null) return contentHeight();
        const padding = self.topPadding + self.bottomPadding;
        return Math.max(contentHeight() - padding, shortcut.implicitHeight) + padding;
      },
    };

    let shown = false;
    effect(
      () => keys() !== null,
      (next) => {
        if (next !== shown) next ? self.$add(shortcut) : self.$remove(shortcut);
        shown = next;
      },
    );
  },
});
