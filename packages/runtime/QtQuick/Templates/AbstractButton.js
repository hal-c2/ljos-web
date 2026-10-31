// AbstractButton: what every button is. It is pressed with the mouse, a
// finger or a key, and says so: `pressed`, `released`, `clicked`. One that
// is checkable is toggled by a click, and of those that exclude each other
// one is checked at a time. A style gives it what it looks like.
import { onCleanup } from "solid-js";
import { defineType, derived, effect, group, settle, signal, slot } from "../../object.js";
import { styleHints } from "../../QtQml/application.js";
import { PauseJob } from "../animation/jobs.js";
import { colorValue } from "../color.js";
import { forceActiveFocus, MouseFocusReason } from "../focus.js";
import { Key, LeftButton } from "../keycodes.js";
import { after, cancel } from "../pointer.js";
import { check, ICON, trigger, uses } from "./Action.js";
import { Control, keeps, loose, put, within } from "./Control.js";
import { untrack } from "#kernel";
import { speaks, unmarked } from "../Accessible.js";

// The keys that click the button with focus. Qt asks the platform: Space and
// Select everywhere, Return and Enter too on the desktops, as in a browser.
const CLICKS = [Key.Key_Space, Key.Key_Select, Key.Key_Return, Key.Key_Enter];

// How long `animateClick` keeps the button down.
const ANIMATE = 100;

// A button with an action shows the action's icon, where it has none itself.
const icon = Object.fromEntries(
  Object.entries(ICON).map(([name, initial]) => [name, derived((self) => self.action?.icon[name] ?? initial)]),
);

const now = (self, name) => untrack(() => self[name]);

// Whether anything listens to a signal: Qt waits for a long press, and
// takes two clicks for a double one, only for a button that is asked.
const heard = (self, name, handler) => handler in self.$props || name in self.$signals;

// Where the button is pressed: `pressX` and `pressY` follow the pointer.
function moveTo(self, x, y) {
  put(self, "pressX", x);
  put(self, "pressY", y);
}

// Qt's `setPressed`: a type that does something when it is pressed is told
// at once.
function press(self, pressed) {
  if (put(self, "pressed", pressed)) self.$pressedChange(pressed);
}

function pressAt(self, x, y) {
  self.$button.x = x;
  self.$button.y = y;
  moveTo(self, x, y);
}

// One timer of the button, on the clock everything runs on: made when first
// needed and kept.
function wait(self, name, ms, work) {
  const mine = self.$button;
  mine[name] ??= Object.assign(new PauseJob(0), { button: self });
  after(ms, work, mine[name]);
}

function held() {
  const self = this.button;
  const mine = self.$button;
  mine.holding = false;
  mine.held = true;
  self.pressAndHold();
}

function delayed() {
  const self = this.button;
  wait(self, "repeat", now(self, "autoRepeatInterval"), repeated);
}

// A button that repeats is clicked again and again while it is held.
function repeated() {
  const self = this.button;
  self.released();
  self.$trigger();
  self.$pressed();
  if (self.$button.repeating) wait(self, "repeat", now(self, "autoRepeatInterval"), repeated);
}

function animated() {
  const self = this.button;
  self.$button.animating = false;
  self.$handleRelease(now(self, "width") / 2, now(self, "height") / 2, null);
  settle();
}

function startPressAndHold(self) {
  const mine = self.$button;
  mine.held = false;
  stopPressAndHold(self);
  if (!heard(self, "pressAndHold", "onPressAndHold")) return;
  mine.holding = true;
  wait(self, "hold", styleHints().mousePressAndHoldInterval, held);
}

function stopPressAndHold(self) {
  const mine = self.$button;
  if (!mine.holding) return;
  mine.holding = false;
  cancel(mine.hold);
}

function startRepeatDelay(self) {
  stopPressRepeat(self);
  self.$button.repeating = true;
  wait(self, "delay", now(self, "autoRepeatDelay"), delayed);
}

function stopPressRepeat(self) {
  const mine = self.$button;
  if (!mine.repeating) return;
  mine.repeating = false;
  cancel(mine.delay);
  cancel(mine.repeat);
}

// What a row that is swiped does to the button it is.
export { press as setPressed, stopPressAndHold, stopPressRepeat };

export const AbstractButton = defineType("AbstractButton", Control, {
  properties: {
    text: derived((self) => self.action?.text ?? ""),
    icon: group(icon),
    display: 2,
    pressed: false,
    // A style shows a button as pressed by `down`, which a program may set.
    down: derived((self) => self.pressed),
    checked: false,
    checkable: false,
    autoExclusive: false,
    autoRepeat: false,
    autoRepeatDelay: 300,
    autoRepeatInterval: 100,
    action: null,
    indicator: null,
    implicitIndicatorWidth: derived((self) => self.indicator?.implicitWidth ?? 0),
    implicitIndicatorHeight: derived((self) => self.indicator?.implicitHeight ?? 0),
    pressX: 0,
    pressY: 0,
    focusPolicy: 11,
  },
  resolve: { icon$color: colorValue },
  enums: { IconOnly: 0, TextOnly: 1, TextBesideIcon: 2, TextUnderIcon: 3 },
  // `pressed` is a property too, so the signal of that name is kept apart.
  signals: ["released", "canceled", "clicked", "toggled", "doubleClicked", "pressAndHold"],
  methods: {
    $accepts: LeftButton,
    // A button stays pressed when the pointer leaves it only if it is
    // dragged: a switch.
    $keepPressed: false,
    toggle() {
      this.$setChecked(!now(this, "checked"));
      settle();
    },
    click() {
      if (!now(this, "enabled")) return;
      if (now(this, "focusPolicy") & 2) forceActiveFocus(this, MouseFocusReason);
      const x = now(this, "width") / 2;
      const y = now(this, "height") / 2;
      this.$handlePress(x, y, null);
      this.$handleRelease(x, y, null);
      settle();
    },
    // A click that is seen: the button is down for a moment.
    animateClick() {
      if (!now(this, "enabled")) return;
      if (now(this, "focusPolicy") & 2) forceActiveFocus(this, MouseFocusReason);
      const mine = this.$button;
      if (!mine.animating) this.$handlePress(now(this, "width") / 2, now(this, "height") / 2, null);
      mine.animating = true;
      wait(this, "animate", ANIMATE, animated);
      settle();
    },
    // Qt's `setChecked`, for the button itself and for its group: what
    // follows from the change has happened when it returns. Whether it
    // changed.
    $setChecked(checked) {
      if (!put(this, "checked", checked)) return false;
      this.$button.checked = checked;
      this.$checkedChange(checked);
      return true;
    },
    // What a change of `checked` does, whoever made it. One that is
    // `declared` checked excludes nothing: in Qt it has no siblings yet.
    $checkedChange(checked, declared) {
      const mine = this.$button;
      const action = now(this, "action");
      if (action) {
        mine.followed = checked;
        check(action, checked);
      }
      this.$buttonChange(checked, declared);
      this.$buttonGroup?.$updateCurrent(this);
    },
    // What the type does about it: a button unchecks the one it excludes.
    $buttonChange(checked, declared) {
      if (!checked || declared) return;
      const other = this.$findChecked();
      if (other && other !== this) other.$setChecked(false);
    },
    $pressedChange() {},
    // The button that is checked among those this one excludes: those of
    // its group, else its siblings that exclude each other too.
    $findChecked() {
      const mine = this.$button;
      if (this.$buttonGroup) return this.$buttonGroup.$buttons.current;
      if (!now(this, "autoExclusive")) return null;
      const siblings = now(this, "parent")?.$node ? untrack(() => this.parent.children) : [];
      for (const other of siblings) {
        // What a sibling was last known to be: one whose binding says it is
        // checked has not been heard yet, and wins when it is.
        if (other === this || !other.$button?.checked || other.$buttonGroup) continue;
        if (now(other, "autoExclusive")) return other;
      }
      return mine.checked ? this : null;
    },
    // Qt's private `toggle`: a change the user made is told.
    $toggle(checked) {
      if (!this.$setChecked(checked)) return;
      settle();
      this.toggled();
    },
    // What a click does to `checked`. The one checked among those that
    // exclude each other stays so.
    $nextCheckState() {
      if (!now(this, "checkable")) return;
      const checked = now(this, "checked");
      if (checked) {
        if (this.$findChecked() === this) return;
        const action = now(this, "action");
        if (action?.$actionGroup && action.$actionGroup.$actions.current === action) return;
      }
      this.$toggle(!checked);
    },
    // A click: the action's, when there is one that can be triggered, and
    // then `clicked` comes from the action.
    $trigger() {
      const mine = this.$button;
      const before = mine.triggering;
      const enabled = now(this, "enabled");
      mine.triggering = enabled;
      const action = now(this, "action");
      const triggered = action && now(action, "enabled") ? trigger(action, this, false) : false;
      mine.triggering = before;
      if (enabled && !triggered) this.clicked();
    },
    $handlePress(x, y, point) {
      if (now(this, "pressed")) return;
      const mine = this.$button;
      pressAt(this, x, y);
      press(this, true);
      settle();
      this.$pressed();
      if (now(this, "autoRepeat")) startRepeatDelay(this);
      else if (point && (point.type === "touch" || point.buttons & LeftButton)) startPressAndHold(this);
      else stopPressAndHold(this);
      // The second press of two close together.
      if (!point?.double || !heard(this, "doubleClicked", "onDoubleClicked")) return;
      this.doubleClicked();
      mine.double = true;
    },
    $handleMove(x, y) {
      const mine = this.$button;
      moveTo(this, x, y);
      const pressed = this.$keepPressed || within(this, x, y);
      press(this, pressed);
      if (!pressed && now(this, "autoRepeat")) stopPressRepeat(this);
      else if (mine.holding && (!pressed || Math.hypot(x - mine.x, y - mine.y) > styleHints().startDragDistance)) {
        stopPressAndHold(this);
      }
    },
    $handleRelease(x, y) {
      const mine = this.$button;
      const pressed = now(this, "pressed");
      pressAt(this, x, y);
      press(this, false);
      if (!mine.held && (this.$keepPressed || within(this, x, y))) this.$nextCheckState();
      settle();
      if (pressed) {
        this.released();
        if (!mine.held && !mine.double) this.$trigger();
      } else {
        this.canceled();
      }
      stopPressRepeat(this);
      stopPressAndHold(this);
      mine.double = false;
    },
    $handleUngrab() {
      if (!now(this, "pressed")) return;
      press(this, false);
      stopPressRepeat(this);
      stopPressAndHold(this);
      this.$button.double = false;
      settle();
      this.canceled();
    },
    // A button that loses the keys is pressed no longer. One that is given
    // focus in a scope that has not the keys loses nothing.
    $reason(reason) {
      Control.proto.$reason.call(this, reason);
      const mine = this.$button;
      const had = mine.active;
      mine.active = this.$active === true;
      if (had && !mine.active) this.$handleUngrab();
    },
    $keyPressed(event) {
      if (!CLICKS.includes(event.key)) return;
      event.accepted = true;
      // A key that is held is one press here: a browser repeats the press
      // without a release between.
      if (event.isAutoRepeat) return;
      pressAt(this, Math.round(now(this, "width") / 2), Math.round(now(this, "height") / 2));
      press(this, true);
      if (now(this, "autoRepeat")) startRepeatDelay(this);
      settle();
      this.$pressed();
    },
    $keyReleased(event) {
      if (!CLICKS.includes(event.key) || !now(this, "pressed")) return;
      event.accepted = true;
      press(this, false);
      this.$nextCheckState();
      settle();
      this.released();
      this.$trigger();
      stopPressRepeat(this);
    },
  },
  setup(self, props) {
    const mine = (self.$button = {
      // `checked` and the action's, as last heard.
      checked: false,
      followed: undefined,
      able: undefined,
      action: null,
      // Where the press was.
      x: 0,
      y: 0,
      held: false,
      double: false,
      holding: false,
      repeating: false,
      animating: false,
      triggering: false,
      // Whether it had the keys when focus last moved.
      active: false,
      hold: null,
      delay: null,
      repeat: null,
      animate: null,
    });
    self.$buttonGroup = null;
    self.$pressed = signal(() => untrack(() => props.onPressed));
    loose(self, "checked");
    loose(self, "enabled");
    keeps(self, () => [self.indicator]);
    // The action clicks the button: by its key, or from a menu.
    const clicked = () => {
      if (now(self, "enabled") || mine.triggering) self.clicked();
    };
    effect(
      () => [self.action, self.action?.enabled, self.action?.checked, self.action?.checkable],
      ([action, enabled, checked, checkable]) => {
        if (action !== mine.action) {
          if (mine.action) {
            uses(mine.action, self, false);
            mine.action.triggered.disconnect(clicked);
          }
          mine.action = action;
          mine.followed = mine.able = undefined;
          if (action) {
            uses(action, self, true);
            action.triggered.connect(clicked);
          }
        }
        // What the action gave the button stays when the action is gone.
        if (!action) return;
        slot(self, "checkable").provide(checkable);
        // The button is as able as its action says at first, unless it says
        // itself; when the action changes its mind, the button does.
        if (mine.able === undefined) slot(self, "enabled").provide(enabled);
        else if (enabled !== mine.able) slot(self, "enabled").write(enabled);
        mine.able = enabled;
        if (checked === mine.followed) return;
        mine.followed = checked;
        untrack(() => self.$setChecked(checked));
      },
    );
    // `checked` assigned or bound from outside is a change like its own.
    let declared = !slot(self, "checked").bound;
    effect(
      () => self.checked,
      () => {
        const first = declared;
        declared = false;
        const checked = now(self, "checked");
        if (checked === mine.checked) return;
        mine.checked = checked;
        untrack(() => self.$checkedChange(checked, first));
      },
    );
    // A button that stops repeating stops at once.
    effect(
      () => self.autoRepeat,
      (repeat) => {
        if (!repeat) stopPressRepeat(self);
      },
    );
    onCleanup(() => {
      cancel(mine.hold);
      cancel(mine.delay);
      cancel(mine.repeat);
      cancel(mine.animate);
      self.$buttonGroup?.removeButton(self);
      if (!mine.action) return;
      uses(mine.action, self, false);
      mine.action.triggered.disconnect(clicked);
    });
  },
});

// A button is named by its text, without the marker of its mnemonic. A bare
// one is whatever its author builds of it; a button is the closest to say.
const buttonText = (self) => unmarked(self.text);
speaks(AbstractButton, "Button", buttonText);
