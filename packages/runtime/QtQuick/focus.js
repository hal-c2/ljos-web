// Which item the keys go to.
//
// Focus is kept per scope, as in Qt: in each FocusScope, and in the window,
// at most one item has `focus`, and the one that has `activeFocus` is found
// by going from the window down through the scopes that have it. A window
// here is one tree of items, whatever it was mounted in.
import { createEffect, onCleanup, runWithOwner } from "solid-js";
import { settle, slot, whenComplete } from "../object.js";
import { untrack } from "#kernel";

const parentOf = (item) => {
  const parent = untrack(() => item.parent);
  return parent?.$node ? parent : null;
};

// The window that had something pressed or focused in it last: where a key
// goes when the page itself does not say.
let current = null;
const windows = new Set();

// What listens for keys starts when there is a window for them to go to.
let opened = null;
export function whenOpened(start) {
  opened = start;
  if (windows.size) start();
}

export function windowOf(item) {
  let top = item;
  for (let parent = parentOf(top); parent; parent = parentOf(top)) top = parent;
  if (top.$focusWindow) return top.$focusWindow;
  // The item of a popup that is not open is in no window: what has focus in
  // it has the keys once it is open, and not before.
  if (top.$popup) return { top, $subFocus: null, active: null, nowhere: true };
  // A scope like the others, that always has active focus.
  const window = { top, $subFocus: null, active: null };
  top.$focusWindow = window;
  windows.add(window);
  opened?.();
  runWithOwner(top.$owner, () =>
    onCleanup(() => {
      windows.delete(window);
      if (current === window) current = null;
    }),
  );
  return window;
}

// The tree `top` was the top of is the same window once `above` is over it,
// as the view is over what is mounted: the keys go where they went.
export function under(top, above) {
  const window = top.$focusWindow;
  if (!window) return;
  top.$focusWindow = undefined;
  above.$focusWindow = window;
  window.top = above;
}

// The scope an item's `focus` is in: the nearest FocusScope around it, else
// its window.
function scopeOf(item, window) {
  for (let parent = parentOf(item); parent; parent = parentOf(parent)) {
    if (parent.$focusScope) return parent;
  }
  return window;
}

// The item with active focus loses it, and so do the scopes it is in, up to
// `scope`: its own state does not change.
function leave(window, scope, changed) {
  for (let item = window.active; item && item !== scope; item = parentOf(item)) {
    if (!item.$active) continue;
    item.$active = false;
    changed.push(item, "activeFocus");
  }
  window.active = null;
}

const enabled = (item) => untrack(() => item.enabled) !== false;

// Qt's `setFocusInScope`. An item that is not enabled has focus without the
// keys: they stay with its scope.
function give(window, scope, item, changed) {
  let active = null;
  if (scope === window ? !window.nowhere : scope.$active) {
    active = enabled(item) ? item : scope;
    while (active.$focusScope && active.$subFocus && enabled(active.$subFocus)) active = active.$subFocus;
    leave(window, scope, changed);
  }
  const old = scope.$subFocus;
  if (old && old !== item) {
    old.$focus = false;
    changed.push(old, "focus");
  }
  scope.$subFocus = item;
  if (!item.$focus) {
    item.$focus = true;
    changed.push(item, "focus");
    forget(item);
  }
  if (!active) return;
  window.active = active === window ? null : active;
  for (let at = window.active; at && at !== scope; at = parentOf(at)) {
    if ((at !== active && !at.$focusScope) || at.$active) continue;
    at.$active = true;
    changed.push(at, "activeFocus");
  }
}

// Qt's `clearFocusInScope`: active focus goes back to the scope.
function take(window, scope, item, changed) {
  const had = scope === window ? !window.nowhere : scope.$active;
  if (had) leave(window, scope, changed);
  if (scope.$subFocus === item) scope.$subFocus = null;
  item.$focus = false;
  changed.push(item, "focus");
  if (had && scope !== window) window.active = scope;
}

// An item that is destroyed with focus leaves its scope without one.
function forget(item) {
  if (item.$forgets) return;
  item.$forgets = true;
  runWithOwner(item.$owner, () =>
    onCleanup(() => {
      // One that was taken out of its parent first is in no scope by now.
      if (!item.$focus || (!parentOf(item) && !item.$focusWindow)) return;
      const window = windowOf(item);
      const changed = [];
      take(window, scopeOf(item, window), item, changed);
      tell(window, changed);
    }),
  );
}

const PROPERTIES = ["focus", "activeFocus"];

// Why focus moved, Qt's `Qt.FocusReason`: a control shows that it has focus
// only when a key brought it there.
export const MouseFocusReason = 0;
export const TabFocusReason = 1;
export const BacktabFocusReason = 2;
export const OtherFocusReason = 7;

// What changed is told as Qt tells it: item by item in the order they were
// touched, an item's focus before its active focus. One that keeps the
// reason (`$reason`) is told it first, whether it gained focus or lost it.
function tell(window, changed, reason = OtherFocusReason) {
  for (let index = 0; index < changed.length; index += 2) {
    const item = changed[index];
    if (changed.indexOf(item) < index) continue;
    item.$reason?.(reason);
    for (const property of PROPERTIES) {
      for (let at = index; at < changed.length; at += 2) {
        if (changed[at] !== item || changed[at + 1] !== property) continue;
        slot(item, property).changed();
        break;
      }
    }
  }
  // A Window says which of its items the keys go to: `activeFocusItem`.
  const shown = window.top.$window;
  if (shown?.$slots) slot(shown, "activeFocusItem")?.provide(window.active);
}

// `item.focus = value`, without settling what depends on it.
export function setFocus(item, value, reason) {
  if ((item.$focus === true) === Boolean(value)) return;
  const window = windowOf(item);
  const scope = scopeOf(item, window);
  const changed = [];
  if (value) give(window, scope, item, changed);
  else take(window, scope, item, changed);
  tell(window, changed, reason);
}

// What Qt's `setParentItem` does about focus. Before an item with focus
// leaves its parent its scope lets go of it: the scope has no focus item
// then, and the item's own `focus` is as it was.
export function departing(item) {
  if (!item.$focus) return;
  const window = windowOf(item);
  const scope = scopeOf(item, window);
  if (scope.$subFocus !== item) return;
  const had = scope === window ? !window.nowhere : scope.$active;
  const changed = [];
  if (had) leave(window, scope, changed);
  scope.$subFocus = null;
  if (had && scope !== window) window.active = scope;
  tell(window, changed);
}

// And with its new parent it is the focus item of the scope it is in now,
// unless that has one: then it has focus no more.
export function arrived(item) {
  if (!item.$focus) return;
  const window = windowOf(item);
  const scope = scopeOf(item, window);
  if (scope.$subFocus === item) return;
  const changed = [];
  if (scope.$subFocus) {
    item.$focus = false;
    changed.push(item, "focus");
  } else {
    give(window, scope, item, changed);
  }
  tell(window, changed);
}

// Focus for the item and for every scope around it, so that it is the one
// the keys go to.
export function forceActiveFocus(item, reason) {
  setFocus(item, true, reason);
  for (let parent = parentOf(item); parent; parent = parentOf(parent)) {
    if (parent.$focusScope) setFocus(parent, true, reason);
  }
  const window = windowOf(item);
  if (!window.nowhere) current = window;
  settle();
}

// What `focus: true` in an item's declaration does. Of several in a scope
// the first has it; one that is bound takes it when it becomes true, as an
// assignment would.
export function declared(self, props) {
  const bound = Object.getOwnPropertyDescriptor(props, "focus").get;
  whenComplete(() => {
    if (!bound) {
      if (!props.focus) return;
      const window = windowOf(self);
      const scope = scopeOf(self, window);
      if (scope.$subFocus) return;
      const changed = [];
      give(window, scope, self, changed);
      tell(window, changed);
      return;
    }
    let last = Boolean(untrack(() => slot(self, "focus").own()));
    if (last) setFocus(self, true);
    createEffect(
      () => Boolean(slot(self, "focus").own()),
      (value) => {
        if (value === last) return;
        last = value;
        untrack(() => setFocus(self, value));
      },
    );
  });
}

// An item that can be tabbed to makes its window known, so that Tab finds
// it when nothing has focus yet.
export const reachable = (self) => whenComplete(() => void windowOf(self));

// A press in a window makes it the one the keys go to.
export function activate(item) {
  current = windowOf(item);
}

// The window a key event is for: the one the page's focus is in, else the
// one used last, else the only one.
export function keyWindow(target) {
  for (const window of windows) if (window.top.$node.contains(target)) return window;
  if (current) return current;
  return windows.size === 1 ? windows.values().next().value : null;
}

// The item the keys go to, or nothing: then they are the window's.
export function activeItem(window) {
  let item = window.active;
  // What cannot be seen or is disabled is passed over for what it is in.
  while (item && !(item.visible && item.enabled)) item = parentOf(item);
  return item;
}

export const activeFocusItem = (item) => activeItem(windowOf(item));

function walk(item, all) {
  all.push(item);
  for (const child of untrack(() => item.children)) walk(child, all);
}

const stop = (item) => item.activeFocusOnTab && item.visible && item.enabled;

function around(scope, item) {
  for (let parent = item && parentOf(item); parent; parent = parentOf(parent)) if (parent === scope) return true;
  return false;
}

// What Tab does not leave: the popup the item is in (`$tabFence`), else the
// window.
function fenceOf(window, item) {
  for (let at = item; at; at = parentOf(at)) if (at.$tabFence) return at;
  return window.top;
}

// The next tab stop after `item` (before it, backwards) in the order the
// items were declared in, around the whole window; `item` itself if there
// is no other. From no item it is the first, or the last.
export function nextInChain(window, item, forward = true) {
  const all = [];
  walk(fenceOf(window, item), all);
  const count = all.length;
  const from = item ? all.indexOf(item) : forward ? -1 : count;
  for (let step = 1; step <= count; step++) {
    const candidate = all[(((from + (forward ? step : -step)) % count) + count) % count];
    if (candidate === item) break;
    // Backwards, a scope that has active focus around the item is passed
    // over, as Qt does: Tab stops at what is in it.
    if (!forward && candidate.$focusScope && candidate.$active && around(candidate, item)) continue;
    if (stop(candidate)) return candidate;
  }
  return item;
}

export const nextItemInFocusChain = (item, forward) => nextInChain(windowOf(item), item, forward);

// Tab and Shift+Tab: whether focus moved.
export function tab(window, item, forward) {
  const next = nextInChain(window, item, forward);
  if (!next || next === item) return false;
  forceActiveFocus(next, forward ? TabFocusReason : BacktabFocusReason);
  return true;
}
