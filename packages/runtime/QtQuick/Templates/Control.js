// Control: what every control of Qt Quick Controls is. An item with a
// `background` behind it and a `contentItem` inside its padding, which a
// style gives it in QML, and the font and colours it inherits.
//
// The control says how big its two items are, and they say how big it would
// like to be (`implicitContentWidth`, `implicitBackgroundWidth`): a style
// computes `implicitWidth` from those.
import { onCleanup } from "solid-js";
import { defineType, derived, effect, settle, slot } from "../../object.js";
import { locale } from "../../QtQml/locale.js";
import { styleHints } from "../../QtQml/application.js";
import { sized } from "../compute.js";
import { departing, forceActiveFocus, MouseFocusReason, OtherFocusReason, windowOf } from "../focus.js";
import { Item } from "../Item.js";
import { mirrored } from "../LayoutMirroring.js";
import { CancelGrabExclusive, drop, gone, hoverable, receive, UngrabExclusive, wheels } from "../pointer.js";
import { font } from "./font.js";
import { palette } from "./theme.js";
import { untrack } from "#kernel";
import { described } from "../Accessible.js";

// Makes the items a control is given its children: `background`, `label`,
// `header`. `read` is run with what is tracked and returns them; one that
// is replaced is the control's no longer.
export function keeps(self, read) {
  let before = [];
  effect(read, (items) => {
    for (const item of before) if (item && !items.includes(item)) self.$keep(item, false);
    for (const item of items) if (item && !before.includes(item)) self.$keep(item, true);
    before = items;
  });
}

// A background is as big as what it is behind, less the insets, unless it
// says how big it is or where it is itself. Qt leaves one that does alone
// until the control is given an inset. What it said is asked once: what is
// given here would count as said. `around` is what it is as big as: the
// Flickable a text area is scrolled by, where its background is put.
function behind(self, item, around) {
  if (!item) return null;
  item.$own ??= untrack(() => ({
    across: !sized(item, "width") && item.x === 0,
    down: !sized(item, "height") && item.y === 0,
    z: slot(item, "z").explicit(),
  }));
  const inset = (name) => slot(self, name).explicit();
  return [
    item,
    item.$own.across || inset("leftInset") || inset("rightInset"),
    item.$own.down || inset("topInset") || inset("bottomInset"),
    self.leftInset,
    self.topInset,
    around.width - self.leftInset - self.rightInset,
    around.height - self.topInset - self.bottomInset,
  ];
}

function spread(box) {
  if (!box) return;
  const [item, across, down, x, y, width, height] = box;
  if (!item.$own.z) slot(item, "z").provide(-1);
  if (across) {
    slot(item, "x").provide(x);
    slot(item, "width").provide(width);
  }
  if (down) {
    slot(item, "y").provide(y);
    slot(item, "height").provide(height);
  }
}

// What a type with a `background` does about it: Control, and Label, which
// is no control.
export function backed(self, around) {
  keeps(self, () => [self.background]);
  effect(() => behind(self, self.background, around?.() ?? self), spread);
}

// Where what is inside the padding is put.
export function fitted(item, x, y, width, height) {
  slot(item, "x").place(x);
  slot(item, "y").place(y);
  slot(item, "width").place(width);
  slot(item, "height").place(height);
}

// What a control, a label and an application's window have in common.
export const methods = {
  // A style's colours are what the palette answers with.
  $colours: palette,
  // The font is that of what is inside, where that has none of its own.
  $fonted: true,
  // An item made by a binding of this object is its child already; one
  // made elsewhere becomes it. A window's are its content item's.
  $keep(item, keep) {
    const into = this.$contentItem ?? this;
    if (!keep) {
      // Qt's `hideOldItem`: one that is replaced is hidden, and is in
      // nothing. The keys are no more its own, or anything's in it.
      departing(item);
      into.$remove(item);
      slot(item, "visible").write(false);
      slot(item, "parent").write(null);
      return;
    }
    if (item.$parent !== into) slot(item, "parent").write(into);
    into.$add(item);
  },
};

export const insets = { topInset: 0, leftInset: 0, rightInset: 0, bottomInset: 0 };

// What a control decides of itself (`pressed`, `hovered`, `position`):
// written when it changes and not otherwise, since a write is one whatever
// the value. Whether it did change.
export function put(self, name, value) {
  if (Object.is(untrack(() => self[name]), value)) return false;
  slot(self, name).write(value);
  return true;
}

// A property that the control writes and its user may bind (`checked`,
// `value`). As in Qt, the property holds a value and the binding assigns to
// it when what it computes changes: what the control wrote holds until
// then. The property is never read through its binding, so two bound to
// each other, a check box and the group it checks, do not go round: it
// starts as what the type starts with, and the binding is heard after.
export function loose(self, name) {
  const held = slot(self, name);
  if (!held.bound) return;
  let last = held.initial;
  held.write(last);
  effect(
    () => held.bound(),
    (value = held.initial) => {
      // An effect is run again for any write of its object: what the
      // control wrote since is not undone by what the binding said before.
      if (Object.is(value, last)) return;
      last = value;
      held.write(value);
    },
  );
}

// Whether a point of the control is in it.
export const within = (self, x, y) =>
  untrack(() => x >= 0 && y >= 0 && x < self.width && y < self.height);

// A control hovers when the control it is in does, and at the top when the
// device has something to hover with. Qt asks any item around it that has a
// `hoverEnabled`.
export function hovering(self) {
  for (let parent = self.parent; parent; parent = parent.parent) {
    const enabled = parent.hoverEnabled;
    if (typeof enabled === "boolean") return enabled;
  }
  return styleHints().useHoverEffects;
}

// The focus a key brought: the reasons Qt shows it for.
const VISUAL = [1, 2, 5];

// What makes a control live: the mouse over it, a press of it, focus and
// the wheel. A type says which buttons it takes (`$accepts`) and what a
// press, a move, a release and the loss of the press do: `$handlePress`,
// `$handleMove`, `$handleRelease` and `$handleUngrab`, Qt's names.
const live = {
  $accepts: 0,
  forceActiveFocus(reason = OtherFocusReason) {
    forceActiveFocus(this, reason);
  },
  $reason(reason) {
    put(this, "focusReason", reason);
  },
  $hovers() {
    return this.hoverEnabled;
  },
  $hover(point, inside) {
    if (put(this, "hovered", inside)) settle();
  },
  $wheel() {
    return this.wheelEnabled;
  },
  $press(point) {
    if (!point.primary || !(point.button & this.$accepts)) return false;
    // A click gives focus before it presses.
    if (this.focusPolicy & 2) forceActiveFocus(this, MouseFocusReason);
    const { x, y } = point.in(this);
    this.$point = point;
    this.$handlePress(x, y, point);
    settle();
    return true;
  },
  $move(point) {
    const { x, y } = point.in(this);
    // Nothing hovers while a button is held but what holds it.
    put(this, "hovered", this.hoverEnabled && within(this, x, y));
    this.$handleMove(x, y, point);
    settle();
  },
  $release(point) {
    const { x, y } = point.in(this);
    this.$handleRelease(x, y, point);
    this.$point = null;
    settle();
  },
  $grab(transition) {
    if (transition !== CancelGrabExclusive && transition !== UngrabExclusive) return;
    this.$point = null;
    this.$handleUngrab();
  },
  $handlePress() {},
  $handleMove() {},
  $handleRelease() {},
  $handleUngrab() {},
};

export const Control = defineType("Control", Item, {
  properties: {
    font,
    padding: 0,
    horizontalPadding: derived((self) => self.padding),
    verticalPadding: derived((self) => self.padding),
    topPadding: derived((self) => self.verticalPadding),
    leftPadding: derived((self) => self.horizontalPadding),
    rightPadding: derived((self) => self.horizontalPadding),
    bottomPadding: derived((self) => self.verticalPadding),
    ...insets,
    spacing: 0,
    availableWidth: derived((self) => Math.max(0, self.width - self.leftPadding - self.rightPadding)),
    availableHeight: derived((self) => Math.max(0, self.height - self.topPadding - self.bottomPadding)),
    locale: derived(() => locale()),
    mirrored: derived(mirrored),
    focusPolicy: 0,
    focusReason: OtherFocusReason,
    visualFocus: derived((self) => self.activeFocus && VISUAL.includes(self.focusReason)),
    // Tab stops at a control whose policy says so.
    activeFocusOnTab: derived((self) => (self.focusPolicy & 1) !== 0),
    hovered: false,
    hoverEnabled: derived(hovering),
    wheelEnabled: false,
    background: null,
    contentItem: null,
    implicitContentWidth: derived((self) => self.contentItem?.implicitWidth ?? 0),
    implicitContentHeight: derived((self) => self.contentItem?.implicitHeight ?? 0),
    implicitBackgroundWidth: derived((self) => self.background?.implicitWidth ?? 0),
    implicitBackgroundHeight: derived((self) => self.background?.implicitHeight ?? 0),
    baselineOffset: derived((self) => self.topPadding + (self.contentItem?.baselineOffset ?? 0)),
  },
  methods: { ...methods, ...live },
  setup(self) {
    backed(self);
    described(self);
    keeps(self, () => [self.contentItem]);
    effect(
      () => [self.contentItem, ...self.$inside()],
      ([item, x, y, width, height]) => {
        if (item) fitted(item, x, y, width, height);
      },
    );
    self.$point = null;
    if (self.$accepts) receive(self);
    let hovers = false;
    effect(
      () => [self.hoverEnabled, self.wheelEnabled, self.activeFocusOnTab, self.visible && self.enabled],
      ([hover, wheel, tab, able]) => {
        if (hover !== hovers) {
          hovers = hover;
          hoverable(hover ? 1 : -1);
        }
        if (wheel) wheels();
        if (hover || wheel) receive(self);
        // Tab finds it when nothing has focus yet.
        if (tab) windowOf(self);
        if (able) return;
        // One that is hidden or disabled has nothing over it and holds
        // nothing.
        put(self, "hovered", false);
        if (self.$point) drop(self.$point, self);
      },
    );
    onCleanup(() => {
      if (hovers) hoverable(-1);
      gone(self);
    });
  },
});

// Where the content item goes: inside the padding. A page puts a header
// over it and a footer under it.
Control.proto.$inside = function () {
  return [this.leftPadding, this.topPadding, this.availableWidth, this.availableHeight];
};
