// What TextField and TextArea are besides the text they edit: neither is a
// Control in Qt, and both have a control's font and colours, a background
// behind them, a placeholder for a style to show, the mouse over them and
// the reason they have focus.
import { onCleanup } from "solid-js";
import { derived, effect, settle } from "../../object.js";
import { styleHints } from "../../QtQml/application.js";
import { PauseJob } from "../animation/jobs.js";
import { colorValue } from "../color.js";
import { forceActiveFocus, MouseFocusReason, OtherFocusReason } from "../focus.js";
import { globalToScene, sceneToItem } from "../geometry.js";
import { buttonOf, LeftButton, modifiersOf } from "../keycodes.js";
import { after, cancel, CancelGrabExclusive, gone, hoverable, receive } from "../pointer.js";
import { backed, hovering, insets, methods as control, put } from "./Control.js";
import { font } from "./font.js";
import { signal, untrack } from "#kernel";

export const properties = {
  font,
  // Said again for what it is read as: a colour, whatever it was given as.
  color: "black",
  // A style says how big a field is; the text does not.
  implicitWidth: 0,
  implicitHeight: 0,
  activeFocusOnTab: true,
  background: null,
  ...insets,
  implicitBackgroundWidth: derived((self) => self.background?.implicitWidth ?? 0),
  implicitBackgroundHeight: derived((self) => self.background?.implicitHeight ?? 0),
  placeholderText: "",
  placeholderTextColor: "black",
  focusReason: OtherFocusReason,
  hovered: false,
  hoverEnabled: derived((self) => self.$field.hovers()),
};

export const resolve = { color: colorValue, placeholderTextColor: colorValue };

export const signals = ["pressed", "released", "pressAndHold"];

// Qt's `MouseEvent`, one per field: where it was pressed, whatever it says.
function event(self, button, buttons, modifiers, wasHeld) {
  const mine = self.$field;
  const mouse = mine.mouse;
  mouse.x = mine.x;
  mouse.y = mine.y;
  mouse.button = button;
  mouse.buttons = buttons;
  mouse.modifiers = modifiers;
  mouse.wasHeld = wasHeld;
  mouse.accepted = true;
  return mouse;
}

function held() {
  const self = this.field;
  self.pressAndHold(event(self, LeftButton, LeftButton, self.$field.modifiers, true));
  settle();
}

function press(self, x, y, button, buttons, modifiers) {
  const mine = self.$field;
  mine.x = x;
  mine.y = y;
  mine.modifiers = modifiers;
  // Only the left button is held for long.
  if (buttons & LeftButton) after(styleHints().mousePressAndHoldInterval, held, mine.hold);
  else cancel(mine.hold);
  self.pressed(event(self, button, buttons, modifiers, false));
}

// A press that goes along the text selects some of it, and is no long one.
function move(self, x) {
  if (Math.abs(x - self.$field.x) > styleHints().startDragDistance) cancel(self.$field.hold);
}

function release(self, button, buttons, modifiers) {
  cancel(self.$field.hold);
  self.released(event(self, button, buttons, modifiers, false));
}

const within = (self, pointer) => {
  const { x, y } = globalToScene(self, pointer.clientX, pointer.clientY);
  return sceneToItem(self, x, y);
};

export const methods = {
  ...control,
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
  // A press beside the text, on the padding or the background: one on the
  // text is the page's, and is heard where the page says it (`setup`).
  $press(point) {
    if (!point.primary) return false;
    const { x, y } = point.in(this);
    press(this, x, y, point.button, point.buttons, point.modifiers);
    if (this.activeFocusOnPress) forceActiveFocus(this, MouseFocusReason);
    settle();
    return true;
  },
  $move(point) {
    move(this, point.in(this).x);
  },
  $release(point) {
    release(this, point.button, point.buttons, point.modifiers);
    settle();
  },
  $grab(transition) {
    if (transition === CancelGrabExclusive) cancel(this.$field.hold);
  },
};

// `around` is what a field's background fills when that is not the field.
export function setup(self, around) {
  backed(self, around);
  const [hovers$, hover$] = signal(false, self.$owner);
  self.$field = {
    hovers: hovers$,
    x: 0,
    y: 0,
    modifiers: 0,
    hold: Object.assign(new PauseJob(0), { field: self }),
    mouse: { x: 0, y: 0, button: 0, buttons: 0, modifiers: 0, source: 0, isClick: false, wasHeld: false, accepted: true, flags: 0 },
  };
  receive(self);

  // What the page's own field is told of the mouse, the field is too.
  const input = self.$input;
  const moved = (pointer) => move(self, within(self, pointer).x);
  const over = () => {
    document.removeEventListener("pointermove", moved);
    document.removeEventListener("pointerup", letGo);
    document.removeEventListener("pointercancel", taken);
  };
  const letGo = (pointer) => {
    over();
    release(self, buttonOf(pointer), pointer.buttons, modifiersOf(pointer));
    settle();
  };
  // The page took the press for itself: to drag what is selected.
  const taken = () => {
    over();
    cancel(self.$field.hold);
  };
  input.addEventListener("pointerdown", (pointer) => {
    const { x, y } = within(self, pointer);
    press(self, x, y, buttonOf(pointer), pointer.buttons, modifiersOf(pointer));
    // The page gives its field focus for a press: the mouse is why.
    if (!self.$active) forceActiveFocus(self, MouseFocusReason);
    settle();
    document.addEventListener("pointermove", moved);
    document.addEventListener("pointerup", letGo);
    document.addEventListener("pointercancel", taken);
  });

  // A field hovers if the control around it does when the field is put in
  // it, as Qt asks: it is not told when the control changes its mind.
  effect(
    () => {
      void self.parent;
      return untrack(() => hovering(self));
    },
    (hover) => void hover$(hover),
  );
  let hovers = false;
  effect(
    () => [self.hoverEnabled, self.visible && self.enabled],
    ([hover, able]) => {
      if (hover !== hovers) {
        hovers = hover;
        hoverable(hover ? 1 : -1);
      }
      // What is hidden or disabled has nothing over it.
      if (!able) put(self, "hovered", false);
    },
  );
  onCleanup(() => {
    if (hovers) hoverable(-1);
    taken();
    gone(self);
  });
}
