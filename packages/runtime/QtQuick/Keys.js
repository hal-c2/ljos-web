// Keys: what a key press does, and to whom.
//
// A key goes to the item with active focus, then to each item it is in until
// one accepts it, as in Qt. What an item does with it is its `Keys` handlers,
// its `KeyNavigation`, then Tab. A `Shortcut` is asked before any of them.
import { onCleanup } from "solid-js";
import { defineType, derived, effect, QtObject, slot, whenComplete } from "../object.js";
import { activeItem, forceActiveFocus, keyWindow, tab, whenOpened, windowOf } from "./focus.js";
import { AltModifier, chord, chordMatches, chordText, ControlModifier, Key, keyOf, modifiersOf, ShiftModifier, textOf } from "./keycodes.js";
import { untrack } from "#kernel";

// The one event there is at a time: Qt's `KeyEvent`.
const event = {
  key: 0,
  text: "",
  modifiers: 0,
  isAutoRepeat: false,
  count: 1,
  nativeScanCode: 0,
  accepted: false,
  matches(standardKey) {
    const wanted = chord(standardKey);
    return wanted !== null && wanted.key === this.key && wanted.modifiers === this.modifiers;
  },
};

// The keys that have a signal of their own: `Keys.onReturnPressed`.
const SPECIFIC = {
  [Key.Key_Left]: "leftPressed",
  [Key.Key_Right]: "rightPressed",
  [Key.Key_Up]: "upPressed",
  [Key.Key_Down]: "downPressed",
  [Key.Key_Tab]: "tabPressed",
  [Key.Key_Backtab]: "backtabPressed",
  [Key.Key_Asterisk]: "asteriskPressed",
  [Key.Key_NumberSign]: "numberSignPressed",
  [Key.Key_Escape]: "escapePressed",
  [Key.Key_Return]: "returnPressed",
  [Key.Key_Enter]: "enterPressed",
  [Key.Key_Delete]: "deletePressed",
  [Key.Key_Space]: "spacePressed",
  [Key.Key_Back]: "backPressed",
  [Key.Key_Cancel]: "cancelPressed",
  [Key.Key_Select]: "selectPressed",
  [Key.Key_Yes]: "yesPressed",
  [Key.Key_No]: "noPressed",
  [Key.Key_Context1]: "context1Pressed",
  [Key.Key_Context2]: "context2Pressed",
  [Key.Key_Context3]: "context3Pressed",
  [Key.Key_Context4]: "context4Pressed",
  [Key.Key_Call]: "callPressed",
  [Key.Key_Hangup]: "hangupPressed",
  [Key.Key_Flip]: "flipPressed",
  [Key.Key_Menu]: "menuPressed",
  [Key.Key_VolumeUp]: "volumeUpPressed",
  [Key.Key_VolumeDown]: "volumeDownPressed",
};
for (let digit = 0; digit <= 9; digit++) SPECIFIC[0x30 + digit] = `digit${digit}Pressed`;

const handlerOf = (name) => `on${name[0].toUpperCase()}${name.slice(1)}`;

const KeysAttached = defineType("Keys", QtObject, {
  properties: {
    enabled: true,
    forwardTo: undefined,
    priority: 0,
  },
  signals: ["pressed", "released", "shortcutOverride", ...new Set(Object.values(SPECIFIC))],
});

export const Keys = defineType("Keys", QtObject, {
  enums: { BeforeItem: 0, AfterItem: 1 },
  attached: KeysAttached,
});

// An item's `Keys`, if it was given any: looked for once.
function keysOf(item) {
  if (item.$keys !== undefined) return item.$keys;
  let has = Boolean(item.$attached?.Keys);
  if (!has) for (const name in item.$props) if ((has = name.startsWith("Keys$"))) break;
  return (item.$keys = has ? Keys.attached(item) : null);
}

// What an item's `Keys` do with the event: the items it forwards to first,
// then the key's own handler, then `onPressed`.
function handle(keys, press) {
  const forwardTo = keys.forwardTo;
  if (forwardTo) {
    // An item that forwards to one that forwards back is asked once.
    keys.$busy = true;
    try {
      for (const target of Array.isArray(forwardTo) ? forwardTo : [forwardTo]) {
        if (!target?.visible) continue;
        deliver(target, press);
        if (event.accepted) return;
      }
    } finally {
      keys.$busy = false;
    }
  }
  if (!press) return keys.released(event);
  const specific = SPECIFIC[event.key];
  // A handler for the very key has dealt with it unless it says otherwise.
  if (specific && handlerOf(specific) in keys.$props) {
    event.accepted = true;
    keys[specific](event);
  }
  if (!event.accepted) keys.pressed(event);
}

const DIRECTIONS = {
  [Key.Key_Left]: "left",
  [Key.Key_Right]: "right",
  [Key.Key_Up]: "up",
  [Key.Key_Down]: "down",
  [Key.Key_Tab]: "tab",
  [Key.Key_Backtab]: "backtab",
};
const REVERSE = { left: "right", right: "left", up: "down", down: "up", tab: "backtab", backtab: "tab" };

// `KeyNavigation.right: other` is `KeyNavigation.left: this` on the other,
// unless it says where its own left is.
function link(self, target, reverse) {
  if (!target?.$props) return;
  const other = KeyNavigation.attached(target);
  const back = slot(other, reverse);
  const implicit = (other.$implicit ??= {});
  if (back.explicit() && !implicit[reverse]) return;
  implicit[reverse] = true;
  back.provide(self.$item);
}

const KeyNavigationAttached = defineType("KeyNavigation", QtObject, {
  properties: {
    left: null,
    right: null,
    up: null,
    down: null,
    tab: null,
    backtab: null,
    priority: 0,
  },
  setup(self, props) {
    self.$item = props.$attachee;
    for (const direction in REVERSE) {
      if (!(direction in props)) continue;
      effect(
        () => self[direction],
        (target) => void untrack(() => link(self, target, REVERSE[direction])),
      );
    }
  },
});

export const KeyNavigation = defineType("KeyNavigation", QtObject, {
  enums: { BeforeItem: 0, AfterItem: 1 },
  attached: KeyNavigationAttached,
});

// An item that says where the arrows lead has its `KeyNavigation` made with
// it, for the item it leads to to lead back.
export function navigable(self, props) {
  for (const direction in REVERSE) {
    if (`KeyNavigation$${direction}` in props) return whenComplete(() => void KeyNavigation.attached(self));
  }
}

// Focus goes where the arrow leads; past what cannot have it, to where that
// leads in turn.
function navigate(navigation, press) {
  const direction = DIRECTIONS[event.key];
  let target = direction && navigation[direction];
  if (!target) return;
  event.accepted = true;
  if (!press) return;
  const visited = [];
  while (target && !visited.includes(target)) {
    if (target.visible && target.enabled) return forceActiveFocus(target);
    visited.push(target);
    target = target.$attached?.KeyNavigation?.[direction];
  }
}

// An item's `Keys` and `KeyNavigation`, those that come before what the item
// does itself or those that come after.
function filter(item, press, after) {
  const keys = keysOf(item);
  if (keys && !keys.$busy && keys.enabled && (keys.priority === 1) === after) {
    handle(keys, press);
    if (event.accepted) return;
  }
  const navigation = item.$attached?.KeyNavigation;
  if (navigation && (navigation.priority === 1) === after) navigate(navigation, press);
}

// The window the event is being delivered in, and whether what accepted it
// was the item itself: then what the browser does with the key is its doing.
let delivering = null;
let own = false;

// Qt's `deliverKeyEvent`. An item may take keys itself, with `$keyPressed`
// and `$keyReleased`: a text input does.
function deliver(item, press) {
  event.accepted = false;
  filter(item, press, false);
  if (event.accepted) return;
  const used = item[press ? "$keyPressed" : "$keyReleased"]?.(event);
  // One that says it used the key leaves the browser nothing to do with it.
  if (event.accepted) return void (own = used !== true);
  filter(item, press, true);
  if (event.accepted || !press || !item.activeFocusOnTab) return;
  tabbed(item);
}

function tabbed(item) {
  if (event.modifiers & (ControlModifier | AltModifier)) return;
  const back = event.key === Key.Key_Backtab || (event.key === Key.Key_Tab && event.modifiers & ShiftModifier);
  if (back || event.key === Key.Key_Tab) event.accepted = tab(delivering, item, !back);
}

const shortcuts = new Set();
// Of several shortcuts for one key, the one whose turn it is.
let turn = 0;

function chordsOf(shortcut) {
  const sequence = shortcut.sequence;
  const sequences = shortcut.sequences;
  const cached = shortcut.$chords;
  if (cached && cached.sequence === sequence && cached.sequences === sequences) return cached.chords;
  const chords = [];
  for (const one of [sequence, ...(sequences ?? [])]) {
    const parsed = chord(one);
    if (parsed) chords.push(parsed);
  }
  shortcut.$chords = { sequence, sequences, chords };
  return chords;
}

// A shortcut is its window's, unless its context is the application.
function within(shortcut, window) {
  if (shortcut.context === 2) return true;
  let parent = shortcut.$parent;
  while (parent && !parent.$node) parent = parent.$parent;
  return !parent || windowOf(parent) === window;
}

// Whether a shortcut took the key.
function shortcut(window) {
  const matches = [];
  for (const candidate of shortcuts) {
    if (!candidate.enabled || !within(candidate, window)) continue;
    if (chordsOf(candidate).some((wanted) => chordMatches(wanted, event.key, event.modifiers))) matches.push(candidate);
  }
  if (!matches.length) return false;
  if (matches.length > 1) {
    turn = (turn + 1) % matches.length;
    const chosen = matches[turn];
    if (!event.isAutoRepeat || chosen.autoRepeat) chosen.activatedAmbiguously();
  } else if (!event.isAutoRepeat || matches[0].autoRepeat) matches[0].activated();
  return true;
}

const text = (self) => {
  const parsed = chord(self.sequence);
  return parsed ? chordText(parsed) : "";
};

// A key, or several, that does something wherever focus is. One chord per
// sequence: `"Ctrl+K, Ctrl+C"` is not one.
export const Shortcut = defineType("Shortcut", QtObject, {
  properties: {
    sequence: undefined,
    sequences: undefined,
    enabled: true,
    autoRepeat: true,
    context: 1,
    nativeText: derived(text),
    portableText: derived(text),
  },
  signals: ["activated", "activatedAmbiguously"],
  setup(self) {
    shortcuts.add(self);
    onCleanup(() => shortcuts.delete(self));
    // Its window is one keys can go to, focus or not.
    whenComplete(() => {
      let parent = self.$parent;
      while (parent && !parent.$node) parent = parent.$parent;
      if (parent) windowOf(parent);
    });
  },
});

const editable = (target) => target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);

function dispatch(dom, press) {
  if (dom.isComposing) return;
  const target = dom.target;
  const window = keyWindow(target);
  if (!window) return;
  const top = window.top.$node;
  const inside = top.contains(target);
  // A key typed into something else on the page is not this window's.
  if (!inside && target !== document.body && target !== document.documentElement) return;
  const focused = activeItem(window);
  // Nor is one typed into an element here that focus knows nothing about.
  if (inside && editable(target) && !focused?.$node.contains(target)) return;
  event.key = keyOf(dom);
  event.text = textOf(dom);
  event.modifiers = modifiersOf(dom);
  event.isAutoRepeat = dom.repeat;
  event.accepted = false;
  delivering = window;
  own = false;
  let taken = false;
  if (press) {
    // What has focus may want the key a shortcut would take.
    for (let item = focused; item && !event.accepted; item = item.parent) {
      const keys = keysOf(item);
      if (keys?.enabled) keys.shortcutOverride(event);
    }
    taken = !event.accepted && shortcut(window);
  }
  if (!taken) {
    event.accepted = false;
    for (let item = focused; item?.$node; item = item.parent) {
      deliver(item, press);
      if (event.accepted) break;
    }
    // What no item wanted is the window's: Tab is, to its first tab stop.
    if (!event.accepted && press) tabbed(null);
  }
  delivering = null;
  if (taken || (event.accepted && !own)) dom.preventDefault();
}

let listening = false;
whenOpened(() => {
  if (listening) return;
  listening = true;
  document.addEventListener("keydown", (dom) => dispatch(dom, true));
  document.addEventListener("keyup", (dom) => dispatch(dom, false));
});
