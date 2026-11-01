// IconLabel: an icon and a text, beside or under one another: what a button
// has inside it. Its implicit size is what makes the button's.
import { defineType, derived, effect, group, inside, slot } from "../../../object.js";
import { color, colorValue } from "../../color.js";
import { lazy } from "../../compute.js";
import { font } from "../../font.js";
import { Item } from "../../Item.js";
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

// Whether the icon was given a colour: by itself, or by the control whose
// icon this one is (`icon: control.icon`).
function coloured(self) {
  const own = slot(self, "icon$color");
  // `icon.color = undefined` takes the colour back.
  if (own.explicit()) return own.own() !== undefined;
  const from = slot(self, "icon").get()?.$self;
  return Boolean(from && from !== self && from.$type.slots.icon$color && coloured(from));
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
      const icon = self.icon;
      return {
        icon: display !== TEXT_ONLY && (icon.name !== "" || String(icon.source ?? "") !== ""),
        text: display !== ICON_ONLY && String(self.text ?? "") !== "",
      };
    });
    const image = inside(self, () =>
      untrack(() =>
        IconImage({
          objectName: "image",
          get name() {
            return self.icon.name;
          },
          get source() {
            return parts().icon ? self.icon.source : "";
          },
          get sourceSize$width() {
            return self.icon.width;
          },
          get sourceSize$height() {
            return self.icon.height;
          },
          get color() {
            return coloured(self) ? self.icon.color : self.defaultIconColor;
          },
          get cache() {
            return self.icon.cache;
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
