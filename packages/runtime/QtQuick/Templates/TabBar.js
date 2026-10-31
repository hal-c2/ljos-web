// TabBar: a container of tab buttons, of which the current one is the one
// checked. It shares its width among those that say none.
import { defineType, derived, effect, QtObject, slot } from "../../object.js";
import { sized } from "../compute.js";
import { receive, wheels } from "../pointer.js";
import { containerOf, Container, indexOf } from "./Container.js";
import { drive } from "./driven.js";
import { untrack } from "#kernel";
import { speaks } from "../Accessible.js";

const NOTCH = 120;

// Whether a tab says how wide and how high it is. Asked once: what the bar
// gives it would count as said.
const said = new WeakMap();
function says(tab) {
  let own = said.get(tab);
  if (!own) said.set(tab, (own = untrack(() => ({ width: sized(tab, "width"), height: sized(tab, "height") }))));
  return own;
}

const isTabBar = (item) => item?.$type.chain.includes(TabBar);

const TabBarAttached = defineType("TabBarAttached", QtObject, {
  properties: {
    index: derived((self) => (self.tabBar ? indexOf(self.$of) : -1)),
    tabBar: derived((self) => {
      const bar = containerOf(self.$of);
      return isTabBar(bar) ? bar : null;
    }),
    position: derived((self) => self.tabBar?.position ?? 0),
  },
  setup(self, props) {
    self.$of = props.$attachee;
  },
});

export const TabBar = defineType("TabBar", Container, {
  properties: { position: 0 },
  enums: { Header: 0, Footer: 1 },
  attached: TabBarAttached,
  methods: {
    $focusScope: true,
    // Only tab buttons are tabs: anything else declared in a bar is its
    // child and no more.
    $isContent(item) {
      return item.$type.chain.some((type) => type.typeName === "TabButton");
    },
    $contentWidth() {
      const tabs = this.contentChildren;
      let width = Math.max(0, tabs.length - 1) * this.spacing;
      for (const tab of tabs) width += says(tab).width ? tab.width : tab.implicitWidth;
      return width;
    },
    $contentHeight() {
      let height = 0;
      for (const tab of this.contentChildren) height = Math.max(height, tab.implicitHeight);
      return height;
    },
    $wheel(turn) {
      if (!untrack(() => this.wheelEnabled)) return false;
      const turned = (this.$turned ??= { x: 0, y: 0 });
      turned.x += turn.angleX;
      turned.y += turn.angleY;
      const across = Math.trunc(turned.x / NOTCH);
      const down = Math.trunc(turned.y / NOTCH);
      if (across > 0 || down > 0) this.decrementCurrentIndex();
      else if (across < 0 || down < 0) this.incrementCurrentIndex();
      else return true;
      turned.x = turned.y = 0;
      return true;
    },
  },
  setup(self) {
    effect(
      () => self.wheelEnabled,
      (enabled) => {
        if (!enabled) return;
        receive(self);
        wheels();
      },
    );
    // The tabs that say no width share what the others leave.
    effect(
      () => {
        const tabs = self.contentChildren;
        const item = self.contentItem;
        if (!tabs.length || !item) return null;
        let reserved = 0;
        let shared = 0;
        for (const tab of tabs) {
          if (says(tab).width) reserved += tab.width;
          else shared++;
        }
        const height = self.contentHeight;
        const width = (item.width - reserved - (tabs.length - 1) * self.spacing) / Math.max(1, shared);
        return [tabs, width, height, ...tabs.map((tab) => (says(tab).height ? (height - tab.height) / 2 : undefined))];
      },
      (layout) => {
        if (!layout) return;
        const [tabs, width, height] = layout;
        for (let index = 0; index < tabs.length; index++) {
          const tab = tabs[index];
          const own = says(tab);
          if (!own.width) slot(tab, "width").provide(width);
          if (own.height) slot(tab, "y").provide(layout[index + 3]);
          else slot(tab, "height").provide(height);
        }
      },
    );
    // The tab the index comes to name is checked, and one that is checked
    // is current. Qt checks none when the current one goes and the next
    // takes its index.
    let named;
    effect(
      () => self.currentIndex,
      (index) => {
        if (index === named) return;
        named = index;
        const tab = self.$model.$objects[index];
        if (tab && "checked" in tab && !untrack(() => tab.checked)) tab.checked = true;
      },
    );
    let checked = [];
    effect(
      () => self.contentChildren.filter((tab) => tab.checked),
      (now) => {
        const tab = now.find((one) => !checked.includes(one));
        checked = now;
        if (!tab) return;
        const index = self.$model.$objects.indexOf(tab);
        if (index >= 0) drive(self, "currentIndex", index);
      },
    );
  },
});

speaks(TabBar, "PageTabList");
