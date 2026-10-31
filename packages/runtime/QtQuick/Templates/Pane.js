// Pane, and what is one with something added: Frame, GroupBox, Page and
// ToolBar. What is declared in a pane is in its content item.
import { contents, defineType, derived, effect, inside, slot, whenComplete } from "../../object.js";
import { Item } from "../Item.js";
import { Control, keeps } from "./Control.js";
import { untrack } from "#kernel";
import { speaks } from "../Accessible.js";

// What the content would like to be: what the content item says, or with
// one item in it and nothing said, that item.
function natural(self, name) {
  const item = self.contentItem;
  if (!item) return 0;
  const own = item[name];
  if (own) return own;
  const children = item.children;
  return children.length === 1 ? children[0][name] : 0;
}

// What is declared in the control goes in its content item: the one it has
// when its QML gives it none, or the one that makes, which is there only
// once everything is.
const contained = {
  setup(self, props) {
    // A ScrollView's is a Flickable, which it makes itself.
    if ("contentItem" in props || self.$scrolled) return;
    self.$holder = inside(self, () => Item({}));
    slot(self, "contentItem").provide(self.$holder);
  },
  adopt(self, props) {
    if (self.$holder) return Item.adopt(self.$holder, props);
    whenComplete(() => {
      const item = untrack(() => self.contentItem);
      for (const child of contents(props, item)) item.$add(child);
    });
  },
};

const content = {
  contentWidth: derived((self) => natural(self, "implicitWidth")),
  contentHeight: derived((self) => natural(self, "implicitHeight")),
  contentChildren: derived((self) => self.contentItem?.children ?? []),
  contentData: derived((self) => self.contentItem?.children ?? []),
  implicitContentWidth: derived((self) => self.contentWidth),
  implicitContentHeight: derived((self) => self.contentHeight),
};

export const Pane = defineType("Pane", Control, { properties: content, ...contained });

export const Frame = defineType("Frame", Pane);

// The label is where the style's QML puts it.
export const GroupBox = defineType("GroupBox", Frame, {
  properties: {
    title: "",
    label: null,
    implicitLabelWidth: derived((self) => self.label?.implicitWidth ?? 0),
    implicitLabelHeight: derived((self) => self.label?.implicitHeight ?? 0),
  },
  setup(self) {
    keeps(self, () => [self.label]);
  },
});

export const ToolBar = defineType("ToolBar", Pane, {
  properties: { position: 0 },
  enums: { Header: 0, Footer: 1 },
});

const tall = (item) => (item?.visible ? item.height : 0);

// What a page and an application's window share: a header over the content
// and a footer under it, as wide as what they are in. `room` is that size.
export function banded(self, room) {
  keeps(self, () => [self.header, self.footer]);
  effect(
    () => {
      const [width, height] = room();
      const { header, footer } = self;
      return [header, footer, width, footer ? height - footer.height : 0];
    },
    ([header, footer, width, bottom]) => {
      if (header) slot(header, "width").provide(width);
      if (footer) {
        slot(footer, "width").provide(width);
        slot(footer, "y").provide(bottom);
      }
    },
  );
}

// How much of the height a header or a footer takes, with the spacing
// between it and the content.
export const band = (item, spacing = 0) => (tall(item) > 0 ? tall(item) + spacing : 0);

export const Page = defineType("Page", Pane, {
  properties: {
    title: "",
    header: null,
    footer: null,
    implicitHeaderWidth: derived((self) => (self.header?.visible ? self.header.implicitWidth : 0)),
    implicitHeaderHeight: derived((self) => (self.header?.visible ? self.header.implicitHeight : 0)),
    implicitFooterWidth: derived((self) => (self.footer?.visible ? self.footer.implicitWidth : 0)),
    implicitFooterHeight: derived((self) => (self.footer?.visible ? self.footer.implicitHeight : 0)),
  },
  setup(self) {
    banded(self, () => [self.width, self.height]);
  },
});

Page.proto.$inside = function () {
  const over = band(this.header, this.spacing);
  const under = band(this.footer, this.spacing);
  return [this.leftPadding, this.topPadding + over, this.availableWidth, Math.max(0, this.availableHeight - over - under)];
};

// A container is named by its title when it has one.
speaks(Pane, "Pane");
speaks(Frame, "Border");
speaks(GroupBox, "Grouping", (self) => String(self.title ?? ""));
speaks(ToolBar, "ToolBar");
speaks(Page, "PageTab", (self) => String(self.title ?? ""));
