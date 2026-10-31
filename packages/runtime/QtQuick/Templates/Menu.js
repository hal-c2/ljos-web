// Menu: a popup whose items are the rows of a model, `contentModel`, as a
// container's are, and one of them is current: the one the mouse is over or
// the arrow keys came to. An item that has a sub-menu opens it beside
// itself, or in the menu's place where menus do not cascade. MenuItem is the
// button its items are, and what its delegate makes for an Action or a Menu
// declared in it.
import { onCleanup } from "solid-js";
import { contents, defineType, derived, effect, group, instantiate, last, settle, slot } from "../../object.js";
import { colorValue } from "../color.js";
import { BacktabFocusReason, departing, forceActiveFocus, OtherFocusReason, setFocus, TabFocusReason } from "../focus.js";
import { globalToScene, itemToScene, sceneToItem } from "../geometry.js";
import { Key } from "../keycodes.js";
import { ObjectModel } from "../model.js";
import { after, cancel, cursor, rehover } from "../pointer.js";
import { AbstractButton } from "./AbstractButton.js";
import { Action, ICON } from "./Action.js";
import { house, reparent, repeat, shows, within } from "./Container.js";
import { keeps } from "./Control.js";
import { housed, overlayOf, Popup, PopupFocusReason, stacked } from "./Popup.js";
import { signal, untrack } from "#kernel";

// How long the mouse is over an item before its sub-menu opens.
const SUBMENU_DELAY = 225;

// CloseOnEscape with CloseOnPressOutside, and with CloseOnPressOutsideParent
// for a sub-menu beside its item: a press on that item does not close it.
const POLICY = 17;
const CASCADING_POLICY = 18;

const isa = (item, Type) => item?.$type?.chain.includes(Type) === true;

// The widest of what the items of a menu have before their texts, so that
// the texts are in a line: Qt's `updateTextPadding`. An item that is not
// seen has no say, and none is in a menu that is closed.
function padding(menu) {
  if (!menu) return 0;
  const model = menu.$menu.model;
  model.$ordered();
  let most = 0;
  for (const item of model.$objects) {
    if (isa(item, MenuItem) && item.visible) most = Math.max(most, item.implicitTextPadding);
  }
  return most;
}

export const MenuItem = defineType("MenuItem", AbstractButton, {
  properties: {
    highlighted: false,
    arrow: null,
    menu: null,
    subMenu: null,
    implicitTextPadding: 0,
    textPadding: derived((self) => padding(self.menu)),
  },
  signals: ["triggered"],
  setup(self) {
    keeps(self, () => [self.arrow]);
    self.clicked.connect(() => self.triggered());
    // The item of a sub-menu says what the menu is called and is enabled
    // when it is. Qt gives it the menu's whole icon; here it has what the
    // menu says of one, and the style's colour for the rest.
    effect(
      () => {
        const menu = self.subMenu;
        if (!menu) return null;
        const icon = {};
        for (const name in ICON) if (slot(menu, `icon$${name}`).explicit()) icon[name] = menu.icon[name];
        return [menu.title, menu.enabled, icon];
      },
      (stated) => {
        if (!stated) return;
        const [title, enabled, icon] = stated;
        slot(self, "text").write(title);
        slot(self, "enabled").write(enabled);
        for (const name in icon) slot(self, `icon$${name}`).write(icon[name]);
      },
    );
  },
});

const parentMenuOf = (self) => untrack(() => self.$parentMenu());

const firstEnabled = (self) => self.$menu.model.$objects.find((item) => item.enabled && isa(item, MenuItem)) ?? null;

// Qt's `setCurrentIndex`: the current item is highlighted and has the keys.
// The item says it has them while it is given them, and that is heard here
// as well: Qt tells of the index twice then, and so does this.
function setCurrent(self, index, reason) {
  const state = self.$menu;
  if (state.index === index) return;
  const item = state.model.$objects[index];
  const next = isa(item, MenuItem) ? item : null;
  const old = state.current;
  if (old !== next) {
    cancel(state.hover);
    if (old) {
      slot(old, "highlighted").write(false);
      if (!next) setFocus(old, false, OtherFocusReason);
    }
    if (next) {
      slot(next, "highlighted").write(true);
      forceActiveFocus(next, reason);
    }
    state.current = next;
  }
  if (state.index === index) return void self.currentIndexChanged();
  state.index = index;
  slot(self, "currentIndex").changed();
  settle();
}

// Qt's `activateNextItem` and `activatePreviousItem`: whether there was one.
function step(self, by) {
  const state = self.$menu;
  const objects = state.model.$objects;
  for (let index = state.index + by; index >= 0 && index < objects.length; index += by) {
    const item = objects[index];
    if (!item.activeFocusOnTab || !item.enabled) continue;
    setCurrent(self, index, by > 0 ? TabFocusReason : BacktabFocusReason);
    return true;
  }
  return false;
}

// The item the mouse came over is the current one, the sub-menu of the one
// it left closes, and its own opens if the mouse stays.
function hovered(self, item) {
  const state = self.$menu;
  if (!item.hovered || !item.enabled) return;
  const index = state.model.$objects.indexOf(item);
  if (index < 0) return;
  const old = state.current;
  setCurrent(self, index, OtherFocusReason);
  if (state.current === old) return;
  old?.subMenu?.close();
  if (!state.current || !self.cascade) return;
  state.hover = after(SUBMENU_DELAY, () => untrack(() => state.current?.subMenu?.open()), state.hover ?? undefined);
}

// A menu's item is told whose it is, and the menu hears what it says: Qt's
// `insertItem`. `sub` is the sub-menu it is for.
function join(self, item, sub = untrack(() => item.subMenu)) {
  if (!isa(item, MenuItem)) return;
  const state = self.$menu;
  slot(item, "menu").write(self);
  sub?.$setParentMenu(self);
  const triggered = () =>
    untrack(() => {
      const menu = item.subMenu;
      if (menu) popupAt(menu, firstEnabled(menu));
      else self.dismiss();
    });
  const hover = () => untrack(() => hovered(self, item));
  const focused = () =>
    untrack(() => {
      if (item.activeFocus) setCurrent(self, state.model.$objects.indexOf(item), item.focusReason);
    });
  item.triggered.connect(triggered);
  item.hoveredChanged.connect(hover);
  item.activeFocusChanged.connect(focused);
  state.heard.set(item, () => {
    item.triggered.disconnect(triggered);
    item.hoveredChanged.disconnect(hover);
    item.activeFocusChanged.disconnect(focused);
  });
}

function part(self, item) {
  const state = self.$menu;
  const undo = state.heard.get(item);
  if (!undo) return;
  state.heard.delete(item);
  undo();
  slot(item, "menu").write(null);
  untrack(() => item.subMenu)?.$setParentMenu(null);
}

function insert(self, index, item) {
  const state = self.$menu;
  reparent(item, within(untrack(() => self.contentItem)));
  state.model.insert(index, item);
  join(self, item);
  settle();
}

// The current index is left as it was, as in Qt.
function remove(self, index) {
  const state = self.$menu;
  const item = state.model.$objects[index];
  // The keys are no more the item's: they stay with the menu.
  departing(item);
  state.model.remove(index);
  state.housed.get(item)?.$remove(item);
  state.housed.delete(item);
  state.repeated.delete(item);
  reparent(item, null);
  part(self, item);
  settle();
  return item;
}

// One the delegate made goes with what it was made for; one that was
// declared is its program's.
function destroy(self, item) {
  const state = self.$menu;
  const dispose = state.made.get(item);
  if (!dispose) return;
  state.made.delete(item);
  if (state.current === item) state.current = null;
  dispose();
}

// The item the delegate makes for an action or a sub-menu, or nothing with
// no delegate, or with one that makes no item.
function make(self, name, object) {
  const delegate = untrack(() => self.delegate);
  if (typeof delegate !== "function") return null;
  const made = instantiate(delegate, {}, self.$item, self.$owner);
  const item = made.object;
  if (!item?.$node) {
    made.dispose();
    return null;
  }
  if (isa(item, name === "subMenu" ? MenuItem : AbstractButton)) slot(item, name).write(object);
  self.$menu.made.set(item, made.dispose);
  return item;
}

// Where the item is that was made for an action or a sub-menu.
const indexFor = (self, Type, name, object) =>
  self.$menu.model.$objects.findIndex((item) => isa(item, Type) && untrack(() => item[name]) === object);

const inside = (self, item) => {
  for (let at = item; at; at = at.$parent) if (at === self.$item) return true;
  return false;
};

// Where a sub-menu is in its parent: beside the item it is for, over it by
// `overlap`, or in the middle of its parent menu where menus do not
// cascade. Qt's `QQuickMenuPositioner`.
function beside(self) {
  const parent = self.$parentMenu();
  if (!parent) return null;
  if (!self.cascade) return [parent.x + (parent.width - self.width) / 2, parent.y + (parent.height - self.height) / 2];
  if (self.mirrored) return [-self.width - parent.leftPadding + self.overlap, -self.topPadding];
  const item = self.parent;
  return item ? [item.width + parent.rightPadding - self.overlap, -self.topPadding] : null;
}

function move(self, where) {
  if (!where) return;
  slot(self, "x").write(where[0]);
  slot(self, "y").write(where[1]);
}

// What Qt does before a menu comes: another menu of the window goes, a
// sub-menu that takes its parent's place closes it, and one beside its item
// stays open when that item is pressed.
function prepare(self) {
  const state = self.$menu;
  if (self.$pop.visible) return;
  const parentMenu = self.$parentMenu();
  const parent = self.parent;
  if (!parentMenu && parent && housed(parent)) {
    for (const popup of stacked(overlayOf(parent))) if (popup !== self && isa(popup, Menu)) popup.close();
  }
  const cascading = parentMenu !== null && self.cascade;
  if (parentMenu && !cascading) parentMenu.close();
  const policy = cascading ? CASCADING_POLICY : POLICY;
  if (policy !== state.policy) {
    state.policy = policy;
    slot(self, "closePolicy").changed();
  }
  move(self, beside(self));
}

// Qt's `popup(pos, menuItem)`: the menu opens with `item` at the place and
// current. A sub-menu's place is beside its item whatever is said.
function place(self, x, y, item) {
  const state = self.$menu;
  let offset = 0;
  if (item) {
    const scene = itemToScene(item, 0, 0);
    offset = sceneToItem(self.$item, scene.x, scene.y).y;
  }
  if (!self.$parentMenu()) move(self, [x, y - offset]);
  setCurrent(self, item ? state.model.$objects.indexOf(item) : -1, PopupFocusReason);
  self.open();
}

// With no place said, where the mouse is, and in the middle of its parent
// where there is no mouse.
function popupAt(self, item) {
  const parent = self.parent;
  let x = 0;
  let y = 0;
  if (parent && !self.$parentMenu()) {
    const at = cursor();
    if (at) {
      const scene = globalToScene(parent, at.x, at.y);
      ({ x, y } = sceneToItem(parent, scene.x, scene.y));
    } else {
      x = (parent.width - self.width) / 2;
      y = (parent.height - self.height) / 2;
    }
  }
  place(self, x, y, item);
}

// The key a text names with `&`: Qt's `QKeySequence::mnemonic`.
export function mnemonic(text) {
  for (let at = text.indexOf("&"); at >= 0 && at < text.length - 1; at = text.indexOf("&", at + 1)) {
    const next = text[at + 1];
    if (next !== "&") return next.toUpperCase().charCodeAt(0);
    at++;
  }
  return 0;
}

// A key the menu has no use for is its parent's: a menu's, or a menu bar's,
// which is known by its item here.
function propagate(self, event) {
  const parent = self.parent;
  if (isa(parent, MenuItem)) {
    if (parent.menu) propagate(parent.menu, event);
  } else parent?.menuBar?.$keyPressed?.(event);
}

function keyed(self, event) {
  const state = self.$menu;
  const key = event.key;
  if (key === Key.Key_Up) {
    if (!step(self, -1)) propagate(self, event);
  } else if (key === Key.Key_Down) step(self, 1);
  else if (key === Key.Key_Left || key === Key.Key_Right) {
    let used = false;
    if (self.mirrored === (key === Key.Key_Right)) {
      // Back to the menu it came from.
      const parent = self.$parentMenu();
      if (parent && state.current) {
        if (!self.cascade) parent.open();
        self.close();
        used = true;
      }
    } else {
      const menu = state.current?.subMenu;
      if (menu) {
        popupAt(menu, firstEnabled(menu));
        used = true;
      }
    }
    if (!used) propagate(self, event);
  } else if (key === Key.Key_Alt) self.close();
  if (event.modifiers) return;
  for (const item of state.model.$objects.slice()) {
    if (!isa(item, AbstractButton) || mnemonic(String(item.text ?? "")) !== key) continue;
    item.click();
    break;
  }
}

export const Menu = defineType("Menu", Popup, {
  properties: {
    count: derived((self) => self.$menu.model.count),
    title: "",
    icon: group(ICON),
    cascade: undefined,
    overlap: 0,
    delegate: null,
    currentIndex: -1,
    focus: true,
    closePolicy: undefined,
  },
  resolve: {
    icon$color: colorValue,
    // A sub-menu cascades as its parent does.
    cascade: (self, own) => {
      const parent = self.$parentMenu();
      return parent ? parent.cascade : Boolean(own() ?? true);
    },
    currentIndex: (self) => self.$menu.index,
    closePolicy: (self, own) => own() ?? self.$menu.policy,
  },
  methods: {
    $relax: false,
    get $flipX() {
      return this.cascade && this.$parentMenu() !== null;
    },
    get contentModel() {
      return this.$menu.model;
    },
    itemAt(index) {
      return this.$menu.model.$objects[index] ?? null;
    },
    addItem(item) {
      this.insertItem(this.$menu.model.$objects.length, item);
    },
    // One that is in it already is moved.
    insertItem(index, item) {
      if (!item?.$node) return;
      const model = this.$menu.model;
      const count = model.$objects.length;
      if (!(index >= 0 && index <= count)) index = count;
      const from = model.$objects.indexOf(item);
      if (from < 0) return insert(this, index, item);
      if (from < index) index--;
      if (from !== index) this.moveItem(from, index);
    },
    moveItem(from, to) {
      const model = this.$menu.model;
      const count = model.$objects.length;
      if (!(from >= 0 && from < count)) return;
      if (!(to >= 0 && to < count)) to = count - 1;
      if (from === to) return;
      model.move(from, to);
      settle();
    },
    removeItem(item) {
      const index = this.$menu.model.$objects.indexOf(item);
      if (index < 0) return;
      remove(this, index);
      destroy(this, item);
    },
    takeItem(index) {
      return index >= 0 && index < this.$menu.model.$objects.length ? remove(this, index) : null;
    },
    menuAt(index) {
      const item = this.itemAt(index);
      return isa(item, MenuItem) ? untrack(() => item.subMenu) : null;
    },
    addMenu(menu) {
      this.insertMenu(this.$menu.model.$objects.length, menu);
    },
    insertMenu(index, menu) {
      if (menu) this.insertItem(index, make(this, "subMenu", menu));
    },
    removeMenu(menu) {
      if (menu) this.takeMenu(indexFor(this, MenuItem, "subMenu", menu));
    },
    takeMenu(index) {
      const menu = this.menuAt(index);
      if (!menu) return null;
      destroy(this, remove(this, index));
      return menu;
    },
    actionAt(index) {
      const item = this.itemAt(index);
      return isa(item, AbstractButton) ? untrack(() => item.action) : null;
    },
    addAction(action) {
      this.insertAction(this.$menu.model.$objects.length, action);
    },
    insertAction(index, action) {
      if (action) this.insertItem(index, make(this, "action", action));
    },
    removeAction(action) {
      if (action) this.takeAction(indexFor(this, AbstractButton, "action", action));
    },
    takeAction(index) {
      const action = this.actionAt(index);
      if (!action) return null;
      destroy(this, remove(this, index));
      return action;
    },
    // `popup()`, `popup(item)`, `popup(x, y, item)`, `popup(pos, item)`, and
    // each with a parent before it: an item of the menu is the one to be
    // current, and any other the one to open over.
    popup(...args) {
      untrack(() => {
        const first = args[0];
        const end = args[args.length - 1];
        const parent = first?.$node && !inside(this, first) ? first : null;
        const item = end?.$node && inside(this, end) ? end : null;
        const [x, y] = args.filter((arg) => arg !== null && arg !== undefined && !arg.$node);
        if (parent) slot(this, "parent").write(parent);
        if (typeof x === "number" && typeof y === "number") place(this, x, y, item);
        else if (typeof x === "object") place(this, Number(x.x), Number(x.y), item);
        else popupAt(this, item);
        settle();
      });
    },
    // The menu and every menu it was opened from close.
    dismiss() {
      for (let menu = this; menu; menu = parentMenuOf(menu)) menu.close();
    },
    $show(shown) {
      if (shown) untrack(() => prepare(this));
      Popup.proto.$show.call(this, shown);
    },
    // Its sub-menus go with it, each with the one open from it.
    $leaving() {
      const state = this.$menu;
      cancel(state.hover);
      let menu = state.current?.subMenu ?? null;
      while (menu) {
        const item = menu.$menu.current;
        menu.close();
        menu = item?.subMenu ?? null;
      }
    },
    // A menu that is gone has no current item, but for one that took its
    // parent's place: its parent comes back to the item it left.
    $appeared(shown) {
      if (!shown && untrack(() => this.cascade)) setCurrent(this, -1, OtherFocusReason);
    },
    // What is under the mouse now may be one of its items.
    $came() {
      rehover();
    },
    $key(event) {
      if (Popup.proto.$key.call(this, event)) return true;
      untrack(() => keyed(this, event));
      return true;
    },
  },
  setup(self, props) {
    const model = untrack(() => ObjectModel({}));
    const state = (self.$menu = {
      model,
      data: [],
      declared: [],
      repeated: new Set(),
      housed: new Map(),
      // The items its delegate made, and how each is unmade.
      made: new Map(),
      // The items it listens to, and how it stops.
      heard: new Map(),
      index: -1,
      current: null,
      hover: null,
      policy: POLICY,
    });
    [self.$parentMenu, self.$setParentMenu] = signal(null, self.$owner);
    // The items are children of the content item, as a container's are.
    effect(
      () => {
        const item = self.contentItem;
        model.$ordered();
        return [within(item), shows(item, model)];
      },
      ([into, viewed]) => house(state.housed, model.$objects, into, viewed),
    );
    // And as wide as it is, unless they say how wide they are.
    const sized = new Set();
    effect(
      () => {
        model.$ordered();
        return model.$objects.slice();
      },
      (items) => {
        for (const item of [...sized]) {
          if (items.includes(item)) continue;
          slot(item, "width").place(undefined);
          sized.delete(item);
        }
        for (const item of items) {
          if (sized.has(item)) continue;
          sized.add(item);
          const width = slot(item, "width");
          width.place(() => (width.explicit() ? undefined : self.contentItem?.width));
        }
      },
    );
    // A sub-menu opens over the item that is for it, and over what its
    // parent opens over where menus do not cascade. One that is no more a
    // sub-menu is over what it was declared in again.
    let had = false;
    effect(
      () => {
        const parent = self.$parentMenu();
        if (!parent) return undefined;
        if (!self.cascade) return parent.parent;
        const items = parent.$menu.model;
        items.$ordered();
        return items.$objects.find((item) => isa(item, MenuItem) && item.subMenu === self) ?? null;
      },
      (found) => {
        const held = slot(self, "parent");
        if (found !== undefined) held.write(found);
        else if (!had) return;
        else if (self.$parent?.$popup) held.write(null);
        else held.reset();
        had = found !== undefined;
      },
    );
    effect(
      () => (self.$placing() ? beside(self) : null),
      (where) => move(self, where),
    );
    if ("currentIndex" in props) {
      effect(
        () => Number(slot(self, "currentIndex").asked()),
        (index) => last(() => untrack(() => setCurrent(self, index, OtherFocusReason))),
      );
    }
    onCleanup(() => cancel(state.hover));
  },
  // What is declared in a menu: its items, an item for each Action and each
  // Menu, and the items of a Repeater where it stands. With no delegate an
  // Action and a Menu are not shown, as in Qt.
  adopt(self, props) {
    const state = self.$menu;
    const model = state.model;
    for (const child of contents(props, self.$item)) {
      if (child?.$siblings) {
        state.declared.push(child);
        state.data.push(child);
        continue;
      }
      const sub = isa(child, Menu) ? child : null;
      const item = sub ? make(self, "subMenu", sub) : isa(child, Action) ? make(self, "action", child) : child;
      if (!item?.$node) {
        state.data.push(child);
        continue;
      }
      item.$objectModel = model;
      model.$objects.push(item);
      state.declared.push(item);
      join(self, item, sub ?? undefined);
    }
    slot(model, "count").write(model.$objects.length);
    if (!state.declared.some((child) => child.$siblings)) return;
    effect(
      () => {
        for (const child of state.declared) child.$siblings?.();
        return state.declared.length;
      },
      () =>
        untrack(() =>
          repeat(
            state,
            model.$objects,
            (index, item) => insert(self, index, item),
            (index) => remove(self, index),
          ),
        ),
    );
  },
});

// Assigning `currentIndex` makes the item current.
Object.defineProperty(Menu.proto, "currentIndex", {
  ...Object.getOwnPropertyDescriptor(Menu.proto, "currentIndex"),
  set(value) {
    untrack(() => setCurrent(this, Number(value), OtherFocusReason));
  },
});
