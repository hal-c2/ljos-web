// ScrollView: a pane whose content item is a Flickable, the one declared in
// it or one of its own, with the scroll bars its style attaches to it.
import { contents, defineType, derived, effect, inside, settle, slot, whenComplete } from "../../object.js";
import { Flickable } from "../Flickable.js";
import { Key } from "../keycodes.js";
import { receive, wheels } from "../pointer.js";
import { Pane } from "./Pane.js";
import { AlwaysOff, interact, ScrollBar } from "./ScrollBar.js";
import { untrack } from "#kernel";

// The Flickable the view makes when its QML gives it none.
function own(self) {
  const flickable = (self.$flick = inside(self, () => untrack(() => Flickable({ clip: true }))));
  slot(self, "contentItem").provide(flickable);
  return flickable;
}

// What is declared in the view: the first Flickable is its content item,
// unless it has one, and everything else is that Flickable's content.
function house(self, made, flickable) {
  for (const child of made) {
    if (!child.$node) continue;
    if (!flickable && child.$viewport) {
      flickable = child;
      slot(self, "contentItem").provide(child);
      continue;
    }
    flickable ??= own(self);
    const content = flickable.contentItem;
    slot(child, "parent").write(content);
    content.$add(child);
  }
  if (!flickable) own(self);
}

// How big the content is. A Flickable that is not the view's own says so
// itself; for its own it is what the one item in it would like to be, and
// what Qt never works out when there is nothing in it.
function natural(self, name, implicit) {
  const flickable = self.$scrolled();
  if (!flickable) return 0;
  if (flickable !== self.$flick) return flickable[name];
  const children = flickable.contentItem.children;
  if (children.length === 0) return -1;
  return children.length === 1 ? children[0][implicit] : 0;
}

// How much of the view a bar takes: nothing when it is not there.
const thickness = (bar, name) => (bar && bar.policy !== AlwaysOff && bar.visible ? bar[name] : 0);

// A finger makes indicators of the bars, and a mouse makes them bars again.
function pressed(self, point) {
  const bars = self.$attached?.ScrollBar;
  if (!bars) return;
  const interactive = point.type !== "touch";
  untrack(() => {
    if (bars.horizontal) interact(bars.horizontal, interactive);
    if (bars.vertical) interact(bars.vertical, interactive);
  });
  settle();
}

export const ScrollView = defineType("ScrollView", Pane, {
  properties: {
    contentWidth: derived((self) => natural(self, "contentWidth", "implicitWidth")),
    contentHeight: derived((self) => natural(self, "contentHeight", "implicitHeight")),
    contentChildren: derived((self) => self.$scrolled()?.contentItem.children ?? []),
    contentData: derived((self) => self.$scrolled()?.contentItem.children ?? []),
    wheelEnabled: true,
    effectiveScrollBarWidth: derived((self) => thickness(ScrollBar.attached(self).vertical, "width")),
    effectiveScrollBarHeight: derived((self) => thickness(ScrollBar.attached(self).horizontal, "height")),
  },
  methods: {
    // The Flickable: what the view's attached `ScrollBar` follows.
    $scrolled() {
      const item = this.contentItem;
      return item?.$viewport ? item : null;
    },
    // A press that is nobody's inside the view, and one that is somebody's.
    $press(point) {
      pressed(this, point);
      return false;
    },
    $filter(point) {
      pressed(this, point);
      return false;
    },
    // A view that is not `wheelEnabled` keeps the wheel from its Flickable.
    $wheel() {
      return !untrack(() => this.wheelEnabled);
    },
    $keyPressed(event) {
      const bars = this.$attached?.ScrollBar;
      if (!bars) return;
      const { key } = event;
      const down = key === Key.Key_Down || key === Key.Key_Right;
      if (!down && key !== Key.Key_Up && key !== Key.Key_Left) return;
      const bar = untrack(() => (key === Key.Key_Up || key === Key.Key_Down ? bars.vertical : bars.horizontal));
      if (!bar) return;
      if (down) bar.increase();
      else bar.decrease();
      event.accepted = true;
    },
  },
  setup(self, props) {
    self.$flick = null;
    receive(self);
    if (!("contentItem" in props) && !("children" in props)) own(self);
    effect(
      () => {
        const item = self.contentItem;
        const flickable = self.$scrolled();
        if (!flickable) return [item, null];
        // What the view was told wins over what the Flickable was, and its
        // own Flickable is told what the view found.
        const mine = flickable === self.$flick;
        return [
          item,
          flickable,
          mine || slot(self, "contentWidth").explicit() ? self.contentWidth : undefined,
          mine || slot(self, "contentHeight").explicit() ? self.contentHeight : undefined,
        ];
      },
      ([item, flickable, width, height]) => {
        if (item && !flickable) console.warn("ScrollView only supports Flickable types as its contentItem");
        if (!flickable) return;
        if (width !== undefined) slot(flickable, "contentWidth").provide(width);
        if (height !== undefined) slot(flickable, "contentHeight").provide(height);
      },
    );
    effect(
      () => self.wheelEnabled,
      (enabled) => {
        if (!enabled) wheels();
      },
    );
  },
  adopt(self, props) {
    const made = contents(props, self);
    if (!("contentItem" in props)) return house(self, made, null);
    // The content item its QML gives it is there only once everything is.
    whenComplete(() => {
      const flickable = untrack(() => self.$scrolled());
      if (flickable) house(self, made, flickable);
    });
  },
});
