// Which item the keys go to.
//
// Focus is kept per scope, as in Qt: in each FocusScope, and in the window,
// at most one item has `focus`, and the one that has `activeFocus` is found
// by going from the window down through the scopes that have it. A window
// here is one tree of items, whatever it was mounted in.
import { createEffect, onCleanup, runWithOwner } from "solid-js";
import { settle, slot, whenComplete } from "../object.ts";
import { untrack } from "#kernel";
import { rules } from "./compute.ts";
import type { Props, QObject } from "../object.ts";

// What focus reads of an item and keeps on it.
export interface Focusable extends QObject {
  readonly parent?: unknown;
  readonly enabled?: unknown;
  readonly visible?: unknown;
  readonly children?: unknown;
  readonly activeFocusOnTab?: unknown;
  $focusWindow?: FocusWindow | undefined;
  readonly $popup?: unknown;
  readonly $tabFence?: unknown;
  readonly $window?: QObject | null;
  readonly $reason?: (reason: number) => void;
  readonly $focusScope?: boolean;
  $subFocus?: Focusable | null;
  $active?: boolean;
  $focus?: boolean;
  $forgets?: boolean;
}

// A window: a scope like an item's, that always has active focus. It is
// no item, and has none of an item's own state.
export interface FocusWindow {
  top: Focusable;
  $subFocus: Focusable | null;
  active: Focusable | null;
  nowhere?: boolean;
  readonly $focusScope?: undefined;
  readonly $active?: undefined;
}

type Scope = Focusable | FocusWindow;
// Each item that changed, and which of its properties: `[item, name, ...]`.
type Changed = (Focusable | string)[];

const parentOf = (item: Focusable): Focusable | null => {
  const parent = untrack(() => item.parent) as Focusable | null | undefined;
  return parent?.$node ? parent : null;
};

// The window that had something pressed or focused in it last: where a key
// goes when the page itself does not say.
let current: FocusWindow | null = null;
const windows = new Set<FocusWindow>();

// What listens for keys starts when there is a window for them to go to.
let opened: (() => void) | null = null;
export function whenOpened(start: () => void): void {
  opened = start;
  if (windows.size) start();
}

export function windowOf(item: Focusable): FocusWindow {
  let top = item;
  for (let parent = parentOf(top); parent; parent = parentOf(top)) top = parent;
  if (top.$focusWindow) return top.$focusWindow;
  // The item of a popup that is not open is in no window: what has focus in
  // it has the keys once it is open, and not before.
  if (top.$popup) return { top, $subFocus: null, active: null, nowhere: true };
  // A scope like the others, that always has active focus.
  const window: FocusWindow = { top, $subFocus: null, active: null };
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
export function under(top: Focusable, above: Focusable): void {
  const window = top.$focusWindow;
  if (!window) return;
  top.$focusWindow = undefined;
  above.$focusWindow = window;
  window.top = above;
}

// The scope an item's `focus` is in: the nearest FocusScope around it, else
// its window.
function scopeOf(item: Focusable, window: FocusWindow): Scope {
  for (let parent = parentOf(item); parent; parent = parentOf(parent)) {
    if (parent.$focusScope) return parent;
  }
  return window;
}

// The item with active focus loses it, and so do the scopes it is in, up to
// `scope`: its own state does not change.
function leave(window: FocusWindow, scope: Scope, changed: Changed): void {
  for (let item = window.active; item && item !== scope; item = parentOf(item)) {
    if (!item.$active) continue;
    item.$active = false;
    changed.push(item, "activeFocus");
  }
  window.active = null;
}

const enabled = (item: Focusable): boolean => untrack(() => item.enabled) !== false;

// Qt's `setFocusInScope`. An item that is not enabled has focus without the
// keys: they stay with its scope.
function give(window: FocusWindow, scope: Scope, item: Focusable, changed: Changed): void {
  let active: Scope | null = null;
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
  window.active = active === window ? null : (active as Focusable);
  for (let at = window.active; at && at !== scope; at = parentOf(at)) {
    if ((at !== active && !at.$focusScope) || at.$active) continue;
    at.$active = true;
    changed.push(at, "activeFocus");
  }
}

// Qt's `clearFocusInScope`: active focus goes back to the scope.
function take(window: FocusWindow, scope: Scope, item: Focusable, changed: Changed): void {
  const had = scope === window ? !window.nowhere : scope.$active;
  if (had) leave(window, scope, changed);
  if (scope.$subFocus === item) scope.$subFocus = null;
  item.$focus = false;
  changed.push(item, "focus");
  if (had && scope !== window) window.active = scope as Focusable;
}

// An item that is destroyed with focus leaves its scope without one.
function forget(item: Focusable): void {
  if (item.$forgets) return;
  item.$forgets = true;
  runWithOwner(item.$owner, () =>
    onCleanup(() => {
      // One that was taken out of its parent first is in no scope by now.
      if (!item.$focus || (!parentOf(item) && !item.$focusWindow)) return;
      const window = windowOf(item);
      const changed: Changed = [];
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
function tell(window: FocusWindow, changed: Changed, reason: number = OtherFocusReason): void {
  for (let index = 0; index < changed.length; index += 2) {
    const item = changed[index] as Focusable;
    if (changed.indexOf(item) < index) continue;
    item.$reason?.(reason);
    for (const property of PROPERTIES) {
      for (let at = index; at < changed.length; at += 2) {
        if (changed[at] !== item || changed[at + 1] !== property) continue;
        slot(item, property)!.changed();
        break;
      }
    }
  }
  // A Window says which of its items the keys go to: `activeFocusItem`.
  const shown = window.top.$window;
  if (shown?.$slots) slot(shown, "activeFocusItem")?.provide(window.active);
  for (let index = 1; index < changed.length; index += 2) {
    if (changed[index] === "activeFocus") return follow(window, reason);
  }
}

// The page's focus follows the keys. A screen reader says what the page's
// focus is on, not what a style draws a ring around: a stop reached with
// Tab is the page's focused element too, with the role and name its
// `Accessible` gave it. Focus moved any other way (by code, by a press)
// takes the page's focus only from inside this window: a reader who is
// somewhere else on the page is not pulled away. One change can move
// focus through several scopes, so where it ends is what is focused.
// Where the page's focus was is read as focus moves: a field that loses
// the keys lets go of the page's focus before this looks again.
let following: { window: FocusWindow; keyed: boolean; within: boolean } | null = null;
let ringless = false;

function follow(window: FocusWindow, reason: number): void {
  if (typeof document === "undefined" || window.nowhere) return;
  const keyed = reason === TabFocusReason || reason === BacktabFocusReason;
  const had = document.activeElement;
  const within = Boolean(had && had !== document.body && window.top.$node?.contains(had));
  if (following) {
    following.window = window;
    following.keyed ||= keyed;
    following.within ||= within;
    return;
  }
  following = { window, keyed, within };
  queueMicrotask(() => {
    const { window, keyed, within } = following!;
    following = null;
    const item = activeItem(window);
    const node = item?.$node as HTMLElement | undefined;
    if (!node?.isConnected) return;
    const has = document.activeElement;
    if (has && has !== document.body && node.contains(has)) return;
    if (!keyed && !within) return;
    // A text box's own field is what a reader types in: it takes the
    // page's focus itself as its item gains the keys.
    if ((item as { $input?: unknown }).$input || node.querySelector("input.qq-edit, textarea.qq-edit")) return;
    // A control's style draws focus as it wants to (`visualFocus`): the
    // browser's outline would be a second ring. Any other item draws
    // nothing of its own, and the browser's ring is all a reader who can
    // see has of where they are.
    if (!ringless) {
      ringless = true;
      rules('[data-qq-focus="styled"]:focus { outline: none; }');
    }
    if (!node.hasAttribute("tabindex")) node.tabIndex = -1;
    node.dataset.qqFocus = "visualFocus" in (item as object) ? "styled" : "";
    node.focus({ preventScroll: true });
  });
}

// `item.focus = value`, without settling what depends on it.
export function setFocus(item: Focusable, value: unknown, reason?: number): void {
  if ((item.$focus === true) === Boolean(value)) return;
  const window = windowOf(item);
  const scope = scopeOf(item, window);
  const changed: Changed = [];
  if (value) give(window, scope, item, changed);
  else take(window, scope, item, changed);
  tell(window, changed, reason);
}

// What Qt's `setParentItem` does about focus. Before an item with focus
// leaves its parent its scope lets go of it: the scope has no focus item
// then, and the item's own `focus` is as it was.
export function departing(item: Focusable): void {
  if (!item.$focus) return;
  const window = windowOf(item);
  const scope = scopeOf(item, window);
  if (scope.$subFocus !== item) return;
  const had = scope === window ? !window.nowhere : scope.$active;
  const changed: Changed = [];
  if (had) leave(window, scope, changed);
  scope.$subFocus = null;
  if (had && scope !== window) window.active = scope as Focusable;
  tell(window, changed);
}

// And with its new parent it is the focus item of the scope it is in now,
// unless that has one: then it has focus no more.
export function arrived(item: Focusable): void {
  if (!item.$focus) return;
  const window = windowOf(item);
  const scope = scopeOf(item, window);
  if (scope.$subFocus === item) return;
  const changed: Changed = [];
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
export function forceActiveFocus(item: Focusable, reason?: number): void {
  setFocus(item, true, reason);
  // One that kept its `focus` when it left the scope it was in, as a block
  // does between shells, is no scope's focus item here until it is given.
  const held = windowOf(item);
  const inScope = scopeOf(item, held);
  if (inScope.$subFocus !== item) {
    const changed: Changed = [];
    give(held, inScope, item, changed);
    tell(held, changed, reason);
  }
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
export function declared(self: Focusable, props: Props): void {
  const bound = Object.getOwnPropertyDescriptor(props, "focus")!.get;
  whenComplete(() => {
    if (!bound) {
      if (!props.focus) return;
      const window = windowOf(self);
      const scope = scopeOf(self, window);
      if (scope.$subFocus) return;
      const changed: Changed = [];
      give(window, scope, self, changed);
      tell(window, changed);
      return;
    }
    let last = Boolean(untrack(() => slot(self, "focus")!.own()));
    if (last) setFocus(self, true);
    createEffect(
      () => Boolean(slot(self, "focus")!.own()),
      (value: boolean) => {
        if (value === last) return;
        last = value;
        untrack(() => setFocus(self, value));
      },
    );
  });
}

// An item that can be tabbed to makes its window known, so that Tab finds
// it when nothing has focus yet.
export const reachable = (self: Focusable) => whenComplete(() => void windowOf(self));

// A press in a window makes it the one the keys go to.
export function activate(item: Focusable): void {
  current = windowOf(item);
}

// The window a key event is for: the one the page's focus is in, else the
// one used last, else the only one. A window an item holds is drawn inside
// the window holding it, so of the windows around the focus the innermost
// is the one it is in.
export function keyWindow(target: Node): FocusWindow | null {
  let found: FocusWindow | null = null;
  let only: FocusWindow | null = null;
  let tops = 0;
  for (const window of windows) {
    // An item that was a window's top before it was given a parent, as a
    // button box's buttons are, is in its parent's window now: keys that
    // reach it while the page's focus is on it are that window's. Nor is a
    // window whose top is not on the page (made and not yet shown) one
    // keys can reach, so the first Tab of a page that shows one window is
    // that window's.
    if (parentOf(window.top) || !window.top.$node?.isConnected) continue;
    tops++;
    only = window;
    const top = window.top.$node!;
    if (top.contains(target) && (!found || found.top.$node!.contains(top))) found = window;
  }
  if (found) return found;
  if (current) return current;
  return tops === 1 ? only : null;
}

// The item the keys go to, or nothing: then they are the window's.
export function activeItem(window: FocusWindow): Focusable | null {
  let item = window.active;
  // What cannot be seen or is disabled is passed over for what it is in.
  while (item && !(item.visible && item.enabled)) item = parentOf(item);
  return item;
}

export const activeFocusItem = (item: Focusable): Focusable | null => activeItem(windowOf(item));

function walk(item: Focusable, all: Focusable[]): void {
  all.push(item);
  for (const child of untrack(() => item.children) as Iterable<Focusable>) walk(child, all);
}

const stop = (item: Focusable): unknown => item.activeFocusOnTab && item.visible && item.enabled;

function around(scope: Focusable, item: Focusable | null): boolean {
  for (let parent = item && parentOf(item); parent; parent = parentOf(parent)) if (parent === scope) return true;
  return false;
}

// What Tab does not leave: the popup the item is in (`$tabFence`), else the
// window.
function fenceOf(window: FocusWindow, item: Focusable | null): Focusable {
  for (let at: Focusable | null = item; at; at = parentOf(at)) if (at.$tabFence) return at;
  return window.top;
}

// The next tab stop after `item` (before it, backwards) in the order the
// items were declared in, around the whole window; `item` itself if there
// is no other. From no item it is the first, or the last.
export function nextInChain(window: FocusWindow, item: Focusable | null, forward = true): Focusable | null {
  const all: Focusable[] = [];
  walk(fenceOf(window, item), all);
  const count = all.length;
  const from = item ? all.indexOf(item) : forward ? -1 : count;
  for (let step = 1; step <= count; step++) {
    const candidate = all[(((from + (forward ? step : -step)) % count) + count) % count]!;
    if (candidate === item) break;
    // Backwards, a scope that has active focus around the item is passed
    // over, as Qt does: Tab stops at what is in it.
    if (!forward && candidate.$focusScope && candidate.$active && around(candidate, item)) continue;
    if (stop(candidate)) return candidate;
  }
  return item;
}

export const nextItemInFocusChain = (item: Focusable, forward?: boolean): Focusable | null => nextInChain(windowOf(item), item, forward);

// Tab and Shift+Tab: whether focus moved.
export function tab(window: FocusWindow, item: Focusable | null, forward: boolean): boolean {
  const next = nextInChain(window, item, forward);
  if (!next || next === item) return false;
  forceActiveFocus(next, forward ? TabFocusReason : BacktabFocusReason);
  return true;
}
