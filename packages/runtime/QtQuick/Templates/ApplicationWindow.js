// ApplicationWindow: a window with a background, a menu bar and a header
// over what is in it and a footer under, and the font and colours of the
// style for the controls in it.
import { contents, defineType, derived, effect, inside, QtObject, slot } from "../../object.js";
import { parts } from "./parts.js";
import { locale } from "../../QtQml/locale.js";
import { Item } from "../Item.js";
import { Window, windowOf } from "../Window.js";
import { fitted, keeps, methods } from "./Control.js";
import { font } from "./font.js";
import { band, banded } from "./Pane.js";

const ApplicationWindowAttached = defineType("ApplicationWindowAttached", QtObject, {
  properties: {
    window: derived((self) => {
      const window = windowOf(self.$item);
      return window?.$fonted ? window : null;
    }),
    contentItem: derived((self) => self.window?.contentItem ?? null),
    activeFocusControl: derived((self) => self.window?.activeFocusControl ?? null),
    header: derived((self) => self.window?.header ?? null),
    footer: derived((self) => self.window?.footer ?? null),
    menuBar: derived((self) => self.window?.menuBar ?? null),
  },
  setup(self, props) {
    self.$item = props.$attachee;
  },
});

export const ApplicationWindow = defineType("ApplicationWindow", Window, {
  properties: {
    font,
    locale: derived(() => locale()),
    background: parts,
    header: parts,
    footer: parts,
    menuBar: parts,
    topPadding: 0,
    leftPadding: 0,
    rightPadding: 0,
    bottomPadding: 0,
    activeFocusControl: null,
    // What the window's items are in, between the header and the footer.
    contentItem: derived((self) => self.$holder),
    contentData: derived((self) => self.$data()),
  },
  methods,
  setup(self) {
    const root = self.$contentItem;
    self.$holder = inside(root, () => Item({}));
    root.$add(self.$holder);
    keeps(self, () => [self.background, self.menuBar]);
    banded(self, () => [self.width, self.height]);
    effect(
      () => {
        const { background, menuBar, header } = self;
        const menu = menuBar?.visible ? menuBar.height : 0;
        const over = menu + band(header);
        const under = band(self.footer);
        return [
          background,
          menuBar,
          header,
          menu,
          self.width,
          self.height,
          self.leftPadding,
          self.topPadding + over,
          self.width - self.leftPadding - self.rightPadding,
          self.height - self.topPadding - self.bottomPadding - over - under,
        ];
      },
      ([background, menuBar, header, menu, width, height, ...box]) => {
        fitted(self.$holder, ...box);
        if (background) {
          slot(background, "z").provide(-1);
          fitted(background, 0, 0, width, height);
        }
        if (menuBar) slot(menuBar, "width").provide(width);
        if (header) slot(header, "y").provide(menu);
      },
    );
  },
  adopt(self, props) {
    const holder = self.$holder;
    const made = contents(props, holder);
    self.$setData(made);
    for (const child of made) holder.$add(child);
  },
  attached: ApplicationWindowAttached,
});
