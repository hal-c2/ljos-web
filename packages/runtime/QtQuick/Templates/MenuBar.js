// MenuBar: a container of the items its menus open from. One of them is the
// current one, the one the mouse is over or the arrow keys came to, and its
// menu is the one that is open: with a menu open, the menu of whichever item
// comes to be current opens in its place. MenuBarItem is the button those
// items are, and what the bar's delegate makes for each Menu declared in it.
import { defineType, effect, inside, instantiate, settle, slot } from "../../object.js";
import { forceActiveFocus, OtherFocusReason, setFocus } from "../focus.js";
import { Key, LeftButton } from "../keycodes.js";
import { Shortcut } from "../Keys.js";
import { AbstractButton } from "./AbstractButton.js";
import { Container } from "./Container.js";
import { Menu, mnemonic } from "./Menu.js";
import { untrack } from "#kernel";

// CloseOnEscape with CloseOnPressOutsideParent and
// CloseOnReleaseOutsideParent: a press of the item is the bar's to answer.
const POLICY = 26;

// The keys whose release is the bar's.
const USED = [Key.Key_Up, Key.Key_Down, Key.Key_Left, Key.Key_Right, Key.Key_Escape];

const isa = (item, Type) => item?.$type?.chain.includes(Type) === true;

const now = (self, name) => untrack(() => self[name]);

export const MenuBarItem = defineType("MenuBarItem", AbstractButton, {
  properties: {
    menuBar: null,
    menu: null,
    highlighted: false,
    focusPolicy: 0,
  },
  signals: ["triggered"],
  methods: {
    // The mouse triggers it as it is pressed, and a finger as it lets go.
    $handlePress(x, y, point) {
      const pressed = now(this, "pressed");
      AbstractButton.proto.$handlePress.call(this, x, y, point);
      if (point && point.type !== "touch" && !pressed) this.triggered();
    },
    $handleRelease(x, y, point) {
      const double = this.$button.double;
      AbstractButton.proto.$handleRelease.call(this, x, y, point);
      if (point?.type === "touch" && !double) this.triggered();
    },
    $keyReleased(event) {
      const pressed = now(this, "pressed");
      AbstractButton.proto.$keyReleased.call(this, event);
      if (pressed && event.accepted) this.triggered();
    },
  },
  setup(self) {
    // Its menu opens under it, and it says what the menu is called.
    let had = [];
    effect(
      () => {
        const menu = self.menu;
        return menu ? [menu, menu.title, self.height] : [];
      },
      (stated) => {
        const [menu, title, height] = stated;
        const before = had;
        const other = menu !== before[0];
        had = stated;
        if (!menu) return;
        if (other || title !== before[1]) slot(self, "text").write(title);
        if (other || height !== before[2]) slot(menu, "y").write(height);
        if (!other) return;
        slot(menu, "parent").write(self);
        slot(menu, "closePolicy").write(POLICY);
      },
    );
    // Alt with the key its text names triggers it, wherever focus is.
    const shortcut = inside(self, () => untrack(() => Shortcut({})));
    const triggered = () => {
      self.$trigger();
      self.triggered();
    };
    shortcut.activated.connect(triggered);
    shortcut.activatedAmbiguously.connect(triggered);
    effect(
      () => [mnemonic(String(self.text ?? "")), self.visible],
      ([key, visible]) => {
        slot(shortcut, "sequence").write(key ? `Alt+${String.fromCharCode(key)}` : undefined);
        slot(shortcut, "enabled").write(visible);
      },
    );
  },
});

// Qt's `openCurrentMenu`: under the current item.
function open(self) {
  const state = self.$menus;
  const item = state.current;
  if (!item || state.open) return;
  const menu = now(item, "menu");
  if (!menu || now(menu, "opened")) return;
  state.open = true;
  menu.popup({ x: 0, y: now(item, "y") + now(item, "height") });
}

// A menu the bar closes itself is not one it hears closing.
function close(self) {
  const state = self.$menus;
  if (!state.current || !state.open) return;
  state.open = false;
  state.closing = true;
  try {
    now(state.current, "menu")?.dismiss();
  } finally {
    state.closing = false;
  }
}

// Qt's `activateItem`: the current item is highlighted, and its menu is open
// if the one before it had its menu open. Each is told before the next
// thing happens, as in Qt.
function activate(self, item) {
  const state = self.$menus;
  if (state.current === item) return;
  const stay = state.open;
  if (state.current) {
    slot(state.current, "highlighted").write(false);
    settle();
    close(self);
  }
  state.current = item;
  if (!item) return;
  slot(item, "highlighted").write(true);
  settle();
  if (stay) open(self);
}

// Qt's `activateMenuItem`: the first item of the menu that is open is its
// current one.
function first(item) {
  const menu = item ? now(item, "menu") : null;
  if (menu) menu.currentIndex = 0;
}

// The item after the current one, or before it, and round.
function step(self, by) {
  const state = self.$menus;
  const objects = self.$model.$objects;
  const count = objects.length;
  let index = state.current ? objects.indexOf(state.current) : by > 0 ? -1 : count;
  if (by > 0 && index >= count - 1) index = -1;
  if (by < 0 && index <= 0) index = count;
  activate(self, objects[index + by] ?? null);
}

// The item of the bar is told whose it is, and the bar hears what it says:
// Qt's `itemAdded`. The menu it has then is the one the bar listens to.
function join(self, item) {
  const state = self.$menus;
  slot(item, "menuBar").write(self);
  const menu = now(item, "menu");
  const hovered = () =>
    untrack(() => {
      if (item === state.current || !item.hovered || !item.enabled || item.$point?.type === "touch") return;
      activate(self, item);
      settle();
    });
  const triggered = () =>
    untrack(() => {
      if (item !== state.current) {
        activate(self, item);
        open(self);
      } else if (state.open) {
        close(self);
        forceActiveFocus(item, OtherFocusReason);
      } else open(self);
      settle();
    });
  // One that closes of itself: its item is current no more, unless the
  // mouse is over it.
  const hiding = () =>
    untrack(() => {
      const current = state.current;
      if (state.closing || !current || current.menu !== menu) return;
      state.open = false;
      if (current.highlighted && !current.hovered) activate(self, null);
    });
  item.hoveredChanged.connect(hovered);
  item.triggered.connect(triggered);
  menu?.aboutToHide.connect(hiding);
  state.heard.set(item, () => {
    item.hoveredChanged.disconnect(hovered);
    item.triggered.disconnect(triggered);
    menu?.aboutToHide.disconnect(hiding);
  });
}

function part(self, item) {
  const state = self.$menus;
  state.heard.get(item)();
  state.heard.delete(item);
  if (now(item, "menuBar") === self) slot(item, "menuBar").write(null);
}

// The item the delegate makes for a menu. With no delegate, or with one
// that makes something else, the menu has an item that is not seen: the
// bar keeps its menus by their items.
function make(self, menu) {
  const state = self.$menus;
  const delegate = now(self, "delegate");
  let made = typeof delegate === "function" ? instantiate(delegate, {}, self, self.$owner) : null;
  if (made && !isa(made.object, MenuBarItem)) {
    console.warn("MenuBar: cannot insert menu: the delegate is not a MenuBarItem.");
    made.dispose();
    made = null;
  }
  made ??= instantiate(() => MenuBarItem({ visible: false }), {}, self, self.$owner);
  const item = made.object;
  slot(item, "menu").write(menu);
  state.made.set(item, made.dispose);
  return item;
}

const menuIndex = (self, menu) =>
  self.$model.$objects.findIndex((item) => isa(item, MenuBarItem) && now(item, "menu") === menu);

function insert(self, index, menu) {
  if (!menu) return void console.warn("MenuBar: cannot insert menu: menu is null.");
  self.insertItem(index, make(self, menu));
}

// Qt's private `takeMenu`: the item made for it goes with it.
function take(self, index) {
  const state = self.$menus;
  const item = self.$model.$objects[index];
  const menu = now(item, "menu");
  if (!menu) return void console.warn(`MenuBar: cannot take/remove menu: MenuBarItem.menu at index ${index} is null.`);
  menu.dismiss();
  if (item === state.current) activate(self, null);
  self.removeItem(item);
  const dispose = state.made.get(item);
  if (!dispose) return menu;
  // The menu opened over an item that is no more.
  state.made.delete(item);
  dispose();
  slot(menu, "parent").write(null);
  return menu;
}

// Another delegate makes the items again, of those that one made: Qt's
// `setDelegate`.
function remake(self, delegate) {
  const state = self.$menus;
  const first = state.delegate === undefined;
  if (delegate === state.delegate) return;
  state.delegate = delegate;
  if (first) return;
  const objects = self.$model.$objects;
  for (let index = objects.length - 1; index >= 0; index--) {
    const item = objects[index];
    if (!state.made.has(item)) continue;
    if (!now(item, "menu")) self.removeItem(item);
    else insert(self, index, take(self, index));
  }
}

function keyed(self, event) {
  const state = self.$menus;
  const key = event.key;
  if (key === Key.Key_Up) close(self);
  else if (key === Key.Key_Down) {
    open(self);
    first(state.current);
  } else if (key === Key.Key_Left || key === Key.Key_Right) step(self, self.mirrored === (key === Key.Key_Left) ? 1 : -1);
  else if (key === Key.Key_Escape) {
    // No menu is open, but an item is highlighted and has the keys.
    if (!state.current) return;
    activate(self, null);
    setFocus(self, false, OtherFocusReason);
  } else if (event.text && !event.modifiers) {
    for (const item of self.$model.$objects.slice()) {
      if (mnemonic(String(now(item, "text") ?? "")) !== key) continue;
      activate(self, item);
      open(self);
      first(item);
    }
  }
}

export const MenuBar = defineType("MenuBar", Container, {
  properties: {
    delegate: null,
    menus: undefined,
    focusPolicy: 2,
  },
  resolve: {
    // The same list while the menus are the same: it changes when they do.
    menus: (self) => {
      const state = self.$menus;
      const menus = self.contentChildren.map((item) => item.menu ?? null);
      const same = menus.length === state.menus.length && menus.every((menu, index) => menu === state.menus[index]);
      return same ? state.menus : (state.menus = menus);
    },
  },
  methods: {
    $focusScope: true,
    $accepts: LeftButton,
    $isContent(item) {
      return isa(item, MenuBarItem);
    },
    // The item for a menu that is declared in the bar.
    $itemFor(child) {
      return isa(child, Menu) ? make(this, child) : child;
    },
    // As wide as its items would like to be with the spacing between them,
    // and as high as the highest.
    $contentWidth() {
      const items = this.contentChildren;
      let width = Math.max(0, items.length - 1) * this.spacing;
      for (const item of items) width += item.implicitWidth;
      return width;
    },
    $contentHeight() {
      let height = 0;
      for (const item of this.contentChildren) height = Math.max(height, item.implicitHeight);
      return height;
    },
    menuAt(index) {
      const item = this.itemAt(index);
      return item ? now(item, "menu") : null;
    },
    addMenu(menu) {
      if (menu && menuIndex(this, menu) >= 0) {
        return void console.warn(`MenuBar: cannot add menu: '${now(menu, "title")}' is already in the MenuBar.`);
      }
      untrack(() => insert(this, this.$model.$objects.length, menu));
    },
    insertMenu(index, menu) {
      if (menu && menuIndex(this, menu) >= 0) {
        return void console.warn(`MenuBar: cannot insert menu: '${now(menu, "title")}' is already in the MenuBar.`);
      }
      untrack(() => insert(this, index, menu));
    },
    removeMenu(menu) {
      const index = menuIndex(this, menu);
      if (index < 0) {
        return void console.warn(`MenuBar: cannot remove menu: '${menu ? now(menu, "title") : ""}' is not in the MenuBar.`);
      }
      untrack(() => take(this, index));
    },
    takeMenu(index) {
      if (!(index >= 0 && index < this.$model.$objects.length)) {
        console.warn(`MenuBar: index out of range: ${index}`);
        return null;
      }
      return untrack(() => take(this, index)) ?? null;
    },
    // The keys of its items and of its menus come to the bar. Qt leaves
    // them to whatever is around it as well.
    $keyPressed(event) {
      untrack(() => keyed(this, event));
      settle();
    },
    $keyReleased(event) {
      if (USED.includes(event.key)) event.accepted = true;
    },
  },
  setup(self, props) {
    const state = (self.$menus = {
      current: null,
      menus: [],
      // The delegate its items were made by.
      delegate: undefined,
      // Whether the current item's menu is open, as the bar knows it, and
      // whether the bar is closing it.
      open: false,
      closing: false,
      // The items its delegate made, and how each is unmade.
      made: new Map(),
      // The items it listens to, and how it stops.
      heard: new Map(),
    });
    effect(
      () => self.contentChildren,
      (items) => {
        for (const item of [...state.heard.keys()]) if (!items.includes(item)) part(self, item);
        for (const item of items) if (!state.heard.has(item)) join(self, item);
      },
    );
    // The mouse that leaves the bar leaves no item current, unless a menu
    // is open.
    self.hoveredChanged.connect(() =>
      untrack(() => {
        if (self.hovered || state.open || !state.current) return;
        activate(self, null);
        settle();
      }),
    );
    effect(
      () => self.delegate,
      (delegate) => untrack(() => remake(self, delegate)),
    );
    // Menus given as `menus` are added as those declared in it are.
    if ("menus" in props) {
      effect(
        () => slot(self, "menus").asked(),
        (menus) =>
          untrack(() => {
            for (const menu of menus ?? []) if (menuIndex(self, menu) < 0) self.addMenu(menu);
          }),
      );
    }
  },
});

// A delegate that is assigned makes the items at once, and each that goes
// and comes is told.
const delegate = Object.getOwnPropertyDescriptor(MenuBar.proto, "delegate");
Object.defineProperty(MenuBar.proto, "delegate", {
  ...delegate,
  set(value) {
    const state = this.$menus;
    const known = state.delegate;
    state.delegate = value;
    delegate.set.call(this, value);
    state.delegate = known;
    untrack(() => remake(this, value));
    settle();
  },
});
