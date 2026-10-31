// ContextMenu: the menu an item shows when it is asked for one, with the
// right button or the menu key. It is attached to the item, and its menu is
// made when first asked for: a style gives every field one.
import { onCleanup } from "solid-js";
import { defineType, QtObject, settle } from "../../object.js";
import { Point } from "../../QtQml/values.js";
import { globalToScene, sceneToItem } from "../geometry.js";
import { untrack } from "#kernel";

// Qt's `qRound`.
const round = (value) => (value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5));

// The items that have one, by their elements.
const asked = new WeakMap();

function request(self, item, event) {
  const scene = globalToScene(item, event.clientX, event.clientY);
  // A field is asked where its cursor is, wherever the mouse.
  const at = item.$cursor?.() ?? sceneToItem(item, scene.x, scene.y);
  const position = new Point(round(at.x), round(at.y));
  const heard = "onRequested" in self.$props || "requested" in self.$signals;
  if (heard) self.requested(position);
  const menu = self.menu;
  if (!menu && !heard) return;
  // The page's own menu is not shown as well.
  event.preventDefault();
  if (menu) {
    menu.parent = item;
    menu.popup(position);
  }
  settle();
}

// The topmost item under the mouse that has one is asked, and nothing under
// it, as in Qt. The page is asked what is there: whoever holds the mouse is
// told of the event in place of what it is over.
function onContextMenu(event) {
  for (const element of document.elementsFromPoint(event.clientX, event.clientY)) {
    const self = asked.get(element);
    if (!self) continue;
    const item = self.$item;
    if (!untrack(() => item.enabled)) continue;
    return untrack(() => request(self, item, event));
  }
}

let listening = false;

const ContextMenuAttached = defineType("ContextMenu", QtObject, {
  properties: { menu: null },
  signals: ["requested"],
  setup(self, props) {
    const item = props.$attachee;
    const node = item?.$node;
    if (!node) return;
    self.$item = item;
    asked.set(node, self);
    onCleanup(() => asked.delete(node));
    if (listening) return;
    listening = true;
    document.addEventListener("contextmenu", onContextMenu, true);
  },
});

export const ContextMenu = defineType("ContextMenu", QtObject, { attached: ContextMenuAttached });
