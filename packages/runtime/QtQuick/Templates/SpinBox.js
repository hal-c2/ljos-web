// SpinBox and DoubleSpinBox: a number between `from` and `to`, stepped by
// two indicators, the arrow keys and the wheel, and typed where the box is
// editable. A style gives it the indicators (`up.indicator`) and the text,
// which shows `displayText`; the box takes its value from what the text says
// when Return is let go and when the keys go elsewhere.
import { onCleanup } from "solid-js";
import { defineType, derived, effect, onChange, QtObject, settle, slot } from "../../object.js";
import { PauseJob } from "../animation/jobs.js";
import { forceActiveFocus, MouseFocusReason, windowOf } from "../focus.js";
import { Key, LeftButton } from "../keycodes.js";
import { after, cancel } from "../pointer.js";
import { TextInput } from "../TextInput.js";
import { Control, keeps, loose, put } from "./Control.js";
import { clamp, close, keep, nothing, now } from "./Slider.js";
import { untrack } from "#kernel";
import { speaks } from "../Accessible.js";

// Qt's `QQuickIndicatorButton`: what `up` and `down` are.
const IndicatorButton = defineType("IndicatorButton", QtObject, {
  properties: {
    pressed: false,
    indicator: null,
    hovered: false,
    implicitIndicatorWidth: derived((self) => self.indicator?.implicitWidth ?? 0),
    implicitIndicatorHeight: derived((self) => self.indicator?.implicitHeight ?? 0),
  },
});

// What the box is given for one (`up.indicator`, `up.onPressedChanged`) is
// what the button's object is given.
function button(props, name) {
  const prefix = `${name}$`;
  const given = {};
  for (const key of Object.keys(props)) {
    if (key.startsWith(prefix)) Object.defineProperty(given, key.slice(prefix.length), Object.getOwnPropertyDescriptor(props, key));
  }
  return IndicatorButton(given);
}

// Qt's `boundValue`: between the ends, whichever is the greater, or round
// from one to the other.
function bound(from, to, value, wrap) {
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  if (!wrap) return clamp(value, low, high);
  return value < low ? high : value > high ? low : value;
}

// The text of the value, as the box's function writes it.
function show(self) {
  const mine = self.$spin;
  display(self, String(mine.kind.text(self, now(self, "textFromValue"), mine.value)));
}

function display(self, text) {
  if (!put(self, "displayText", text)) return;
  // A text that shows what the box does shows it again, whatever was typed
  // into it since: in Qt typing leaves its binding as it was.
  const content = now(self, "contentItem");
  const held = content && slot(content, "text");
  if (held?.bound && held.assigned) held.reset();
}

// What a text is the value of: nothing, when it is no number.
function valueOf(self, text) {
  const kind = self.$spin.kind;
  try {
    return kind.entered(now(self, "valueFromText")(text, now(self, "locale")));
  } catch {
    return 0;
  }
}

// Qt's `setValue`: whether it did anything. `modified` is for what the user
// did, and is said with `valueModified`.
function setValue(self, value, wrap, modified) {
  const mine = self.$spin;
  const same = mine.kind.same;
  const corrected = bound(now(self, "from"), now(self, "to"), value, wrap);
  if (!modified && same(value, corrected) && same(value, mine.value)) return false;
  const changed = mine.value !== corrected;
  mine.value = corrected;
  keep(self, "value", corrected);
  show(self);
  if (changed && modified) {
    settle();
    self.valueModified();
  }
  return true;
}

// Qt's `updateValue`: the value is what the text says.
function updateValue(self) {
  const text = now(self, "contentItem")?.text;
  if (text !== undefined) setValue(self, valueOf(self, String(text)), false, true);
}

// Qt's `contentItemTextChanged`: what is typed is what the box shows, and
// its value too when it is live and the text is one within the ends.
function typed(self, text) {
  const mine = self.$spin;
  if (mine.kind.live && now(self, "live")) {
    const entered = valueOf(self, text);
    if (bound(now(self, "from"), now(self, "to"), entered, false) === entered && entered !== mine.value) {
      return void setValue(self, entered, false, false);
    }
  }
  display(self, text);
}

// A step up is one down where the ends are the wrong way round.
const stepOf = (self) => (now(self, "from") > now(self, "to") ? -now(self, "stepSize") : now(self, "stepSize"));

function step(self, by, modified) {
  return setValue(self, self.$spin.value + by * stepOf(self), now(self, "wrap"), modified);
}

// Whether a point of the box is on an indicator that can be pressed.
function contains(self, indicator, x, y) {
  return Boolean(indicator) && untrack(() => indicator.contains(self.mapToItem(indicator, x, y)));
}

function on(self, which, x, y) {
  const indicator = now(which, "indicator");
  return contains(self, indicator, x, y) && now(indicator, "enabled");
}

// Qt's `updateHover`. Whether anything changed.
function hover(self, x, y) {
  const { up, down } = self.$spin;
  const changed = put(up, "hovered", on(self, up, x, y));
  return put(down, "hovered", on(self, down, x, y)) || changed;
}

// An indicator that is held steps the value again and again, after a while.
function repeated() {
  const self = this.box;
  const { up, down } = self.$spin;
  if (now(up, "pressed")) step(self, 1, true);
  else if (now(down, "pressed")) step(self, -1, true);
  settle();
  after(REPEAT, repeated, this);
}

function delayed() {
  this.box.$spin.repeating = true;
  after(REPEAT, repeated, this);
}

// Qt's `AUTO_REPEAT_DELAY` and `AUTO_REPEAT_INTERVAL`.
const DELAY = 300;
const REPEAT = 100;

function stop(self) {
  const mine = self.$spin;
  mine.repeating = false;
  cancel(mine.job);
}

function released(self) {
  const { up, down } = self.$spin;
  const changed = put(up, "pressed", false);
  return put(down, "pressed", false) || changed;
}

// The two boxes differ in what a number is. Qt's SpinBox holds `int`s:
// what it is given is cut to one, and so is a part of a step of the wheel.
const whole = {
  to: 99,
  live: true,
  number: (self, value) => value | 0,
  entered: (value) => value | 0,
  same: (a, b) => a === b,
  steps: Math.trunc,
  places: () => 0,
  text: (self, write, value) => write(value, now(self, "locale")),
  textFromValue: (value, locale) => Number(value).toLocaleString(locale, "f", 0),
};

// A DoubleSpinBox's numbers have `decimals` places when they are assigned;
// a step is added as it is.
const real = {
  to: 99.99,
  live: false,
  // `toFixed` writes no more than a hundred places.
  number: (self, value) => Number(Number(value).toFixed(Math.min(self.decimals, 100))),
  entered: (value) => Number(value) || 0,
  same: close,
  steps: (count) => count,
  places: (self) => self.decimals,
  text: (self, write, value) => write(value, now(self, "decimals"), now(self, "locale")),
  textFromValue: (value, decimals, locale) => Number(value).toLocaleString(locale, "f", decimals),
};

function box(name, kind, more) {
  const number = (self, own) => kind.number(self, own());
  return defineType(name, Control, {
    properties: {
      from: 0,
      to: kind.to,
      value: 0,
      stepSize: 1,
      editable: false,
      wrap: false,
      validator: null,
      textFromValue: kind.textFromValue,
      valueFromText: (text, locale) => Number.fromLocaleString(locale, text),
      up: null,
      down: null,
      // `Qt.ImhDigitsOnly`.
      inputMethodHints: 0x10000,
      inputMethodComposing: derived((self) => Boolean(self.contentItem?.inputMethodComposing)),
      displayText: "",
      ...more,
    },
    signals: ["valueModified"],
    resolve: {
      from: number,
      to: number,
      stepSize: kind === whole ? number : undefined,
      decimals: kind === real ? (self, own) => clamp(own() | 0, 0, 323) : undefined,
      // Kept between the ends as it is read, once they are known, so that
      // one assigned out of range is never seen. What the box wrote is what
      // it is.
      value(self, own) {
        const mine = self.$spin;
        const asked = own();
        if (mine?.from === undefined) return kind.number(self, asked);
        if (Object.is(asked, mine.value)) return asked;
        return bound(self.from, self.to, kind.number(self, asked), false);
      },
    },
    methods: {
      $accepts: LeftButton,
      // The box and its text settle between them which has the keys.
      $focusScope: true,
      increase() {
        step(this, 1, false);
        settle();
      },
      decrease() {
        step(this, -1, false);
        settle();
      },
      $handlePress(x, y) {
        const mine = this.$spin;
        const more = on(this, mine.up, x, y);
        const less = on(this, mine.down, x, y);
        put(mine.up, "pressed", more);
        put(mine.down, "pressed", less);
        if (!more && !less) return;
        stop(this);
        after(DELAY, delayed, mine.job);
      },
      // One held and taken off its indicator steps no more, and does not
      // start again when it is brought back.
      $handleMove(x, y, point) {
        const { up, down } = this.$spin;
        const mouse = point?.type !== "touch";
        const more = on(this, up, x, y);
        const less = on(this, down, x, y);
        put(up, "hovered", mouse && more);
        put(up, "pressed", more);
        put(down, "hovered", mouse && less);
        put(down, "pressed", less);
        if (!more && !less) stop(this);
      },
      // A click is a step, unless holding it stepped already. The indicator
      // is pressed until the step is made: a style may step further for one
      // that is.
      $handleRelease(x, y) {
        const mine = this.$spin;
        const { up, down } = mine;
        const before = mine.value;
        const held = now(up, "pressed") ? up : now(down, "pressed") ? down : null;
        if (held) {
          if (!mine.repeating && contains(this, now(held, "indicator"), x, y)) step(this, held === up ? 1 : -1, false);
          settle();
          put(held, "pressed", false);
        }
        stop(this);
        if (mine.value === before) return;
        settle();
        this.valueModified();
      },
      $handleUngrab() {
        released(this);
        stop(this);
      },
      $hover(point, inside) {
        Control.proto.$hover.call(this, point, inside);
        const mine = this.$spin;
        mine.over = inside;
        if (inside) {
          const { x, y } = point.in(this);
          mine.x = x;
          mine.y = y;
          if (hover(this, x, y)) settle();
          return;
        }
        const changed = put(mine.up, "hovered", false);
        if (put(mine.down, "hovered", false) || changed) settle();
      },
      // The keys given to a box that is editable are its text's, and when
      // they go elsewhere what was typed is its value.
      $reason(reason) {
        Control.proto.$reason.call(this, reason);
        const mine = this.$spin;
        const had = mine.active;
        mine.active = this.$active === true;
        if (!now(this, "editable")) return;
        if (!mine.active) {
          if (had) updateValue(this);
          return;
        }
        if (windowOf(this).active !== this) return;
        const content = now(this, "contentItem");
        if (content) forceActiveFocus(content, reason);
      },
      // An arrow steps it, and its indicator is pressed while the key is.
      $keyPressed(event) {
        const { up, down } = this.$spin;
        const which = event.key === Key.Key_Up ? up : event.key === Key.Key_Down ? down : null;
        if (!which || !now(now(which, "indicator"), "enabled")) return;
        if (put(which, "pressed", true)) settle();
        step(this, which === up ? 1 : -1, true);
        event.accepted = true;
        settle();
      },
      $keyReleased(event) {
        if (now(this, "editable") && (event.key === Key.Key_Return || event.key === Key.Key_Enter)) updateValue(this);
        released(this);
        settle();
      },
      $wheel(turn) {
        if (!now(this, "wheelEnabled")) return false;
        const notches = (nothing(turn.angleY) ? turn.angleX : turn.angleY) / 120;
        setValue(this, this.$spin.value + kind.steps(stepOf(this) * notches), now(this, "wrap"), true);
        settle();
        return true;
      },
    },
    setup(self, props) {
      const up = button(props, "up");
      const down = button(props, "down");
      const mine = (self.$spin = {
        kind,
        up,
        down,
        value: 0,
        from: undefined,
        to: undefined,
        places: 0,
        active: false,
        over: false,
        x: 0,
        y: 0,
        repeating: false,
        job: Object.assign(new PauseJob(0), { box: self }),
      });
      slot(self, "up").provide(up);
      slot(self, "down").provide(down);
      loose(self, "value");
      keeps(self, () => [up.indicator, down.indicator]);
      onCleanup(() => stop(self));

      // `value` assigned or bound from outside, and the ends it is kept
      // between: what it was given at first is fitted once they are known.
      // What the box wrote itself is not assigned to it again.
      effect(
        () => [slot(self, "value").asked(), self.from, self.to, kind.places(self)],
        ([asked, from, to, places]) => {
          const start = mine.from === undefined;
          const ends = from !== mine.from || to !== mine.to;
          const rounds = !start && places !== mine.places;
          mine.from = from;
          mine.to = to;
          mine.places = places;
          if (!start && !ends && !rounds && Object.is(asked, mine.value)) return;
          untrack(() => {
            if (!setValue(self, kind.number(self, asked), false, false) && start) show(self);
            // Qt reads the text again when the places change.
            if (rounds) updateValue(self);
          });
        },
      );
      onChange(self, "locale", () => show(self));
      if (kind.live) {
        onChange(self, "live", () => {
          const text = self.contentItem?.text;
          if (self.live && text !== undefined) typed(self, String(text));
        });
      }

      // An indicator can be pressed while there is somewhere for the value
      // to go. Qt looks again at what the mouse is over when it next draws:
      // nothing is over one that cannot be pressed.
      effect(
        () => {
          const { from, to, value, wrap } = self;
          const raise = wrap || (from < to ? value < to : value > to);
          const lower = wrap || (from < to ? value > from : value < from);
          return [up.indicator, raise, down.indicator, lower];
        },
        ([more, raise, less, lower]) => {
          if (more) slot(more, "enabled").write(raise);
          if (less) slot(less, "enabled").write(lower);
          if (mine.over && !self.$point) untrack(() => hover(self, mine.x, mine.y));
        },
      );

      // The text is where Tab stops, and a press of it gives it the keys.
      // The page gives its field focus for a press: the mouse is why, and
      // the box that had them till then is told so. An arrow is the box's,
      // and takes the cursor nowhere.
      let field = null;
      const pressed = () => {
        const content = now(self, "contentItem");
        if (content.$active) return;
        forceActiveFocus(content, MouseFocusReason);
        if (put(self, "focusReason", MouseFocusReason)) settle();
      };
      const keyed = (event) => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") event.preventDefault();
      };
      const unheard = () => {
        field?.removeEventListener("pointerdown", pressed);
        field?.removeEventListener("keydown", keyed);
      };
      onCleanup(unheard);
      let heard = null;
      let last;
      effect(
        () => {
          const content = self.contentItem;
          return [content, content?.$type.chain.includes(TextInput) ? content.text : undefined];
        },
        ([content, text]) => {
          if (content === heard) {
            if (text === last || text === undefined) return;
            last = text;
            return untrack(() => typed(self, text));
          }
          heard = content;
          last = text;
          unheard();
          field = content?.$input ?? null;
          if (!content) return;
          slot(content, "activeFocusOnTab").write(true);
          field?.addEventListener("pointerdown", pressed);
          field?.addEventListener("keydown", keyed);
          if (self.$active) untrack(() => forceActiveFocus(content, self.focusReason));
        },
      );
    },
  });
}

export const SpinBox = box("SpinBox", whole, { live: false });
export const DoubleSpinBox = box("DoubleSpinBox", real, { decimals: 2 });

speaks(SpinBox, "SpinBox");
speaks(DoubleSpinBox, "SpinBox");
