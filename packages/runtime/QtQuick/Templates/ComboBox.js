// ComboBox: a button that shows one row of a model and, pressed, a popup
// with all of them to pick another from. A style gives it the popup, whose
// view shows `delegateModel`, the indicator and the text, which shows
// `displayText`; the box keeps which row is current and which the popup
// highlights, and what the mouse, the keys and the wheel do about both.
//
// What is current is said by an index or by a value, whichever was given
// last: the other follows it.
import { onCleanup, runWithOwner } from "solid-js";
import { $component, defineType, derived, effect, settle, slot } from "../../object.js";
import { DelegateModel } from "../DelegateModel.js";
import { BacktabFocusReason, forceActiveFocus, MouseFocusReason, setFocus, TabFocusReason, windowOf } from "../focus.js";
import { Key, LeftButton } from "../keycodes.js";
import { modelOf } from "../model.js";
import { TextInput } from "../TextInput.js";
import { AbstractButton } from "./AbstractButton.js";
import { Control, keeps, loose, put, within } from "./Control.js";
import { now } from "./Slider.js";
import { signal, untrack } from "#kernel";

const next = (version) => version + 1;

// What says which row is current: nothing yet, an index, or a value.
const NONE = 0;
const INDEX = 1;
const VALUE = 2;

// `Popup.CloseOnEscape | Popup.CloseOnPressOutsideParent`.
const POLICY = 16 | 2;
// `ItemView.Beginning` and `ItemView.Contain`.
const Beginning = 0;
const Contain = 4;
// `Qt.ShortcutFocusReason`, and the reasons that take the keys to the text
// of a box that is editable.
const ShortcutFocusReason = 5;
const KEYED = [TabFocusReason, BacktabFocusReason, ShortcutFocusReason];
// The keys that press a button, by Qt's default theme.
const PRESSES = [Key.Key_Space, Key.Key_Select];

// `Qt.MatchFlags`.
const MatchExactly = 0;
const MatchStartsWith = 2;
const MatchEndsWith = 3;
const MatchRegularExpression = 4;
const MatchWildcard = 5;
const MatchFixedString = 8;
const MatchCaseSensitive = 16;
const MatchWrap = 32;

const isa = (item, Type) => item?.$type?.chain.includes(Type) === true;
const plain = (value) => value !== null && typeof value === "object" && !value.$props;

// A role of one value of a list. The value itself is its `modelData`, but
// an object with one member is that member: `[{ text: "a" }]` shows `a`.
function part(value, role) {
  if (value === null || typeof value !== "object") return role === "modelData" ? value : undefined;
  if (role !== "modelData") return value[role];
  if (!plain(value) || Array.isArray(value)) return value;
  const keys = Object.keys(value);
  return keys.length === 1 ? value[keys[0]] : value;
}

// What a row of the model has for a role.
function read(self, index, role) {
  const model = modelOf(self.model);
  if (typeof model === "number") return role === "modelData" ? index : undefined;
  if (Array.isArray(model)) return part(model[index], role);
  if (!model || typeof model !== "object") return undefined;
  if (model.$elements) {
    const element = model.$elements[index];
    const roles = model.$roles;
    if (role !== "modelData" || roles.includes(role)) return element?.[role];
    return roles.length === 1 ? element?.[roles[0]] : element;
  }
  if (model.$objects) return part(model.$objects[index], role);
  return typeof model.get === "function" ? part(model.get(index), role) : undefined;
}

// What Qt makes a string of: a number, a string and a boolean.
const written = (value) => (value === null || value === undefined || typeof value === "object" ? "" : String(value));

const numbered = (value) => {
  if (typeof value !== "string") return Number(value);
  return value.trim() === "" ? NaN : Number(value);
};

// Qt's equality of two values: a number is the string that writes it and
// the boolean that counts as it, and `true` is the word too.
function equal(a, b) {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (typeof a === "object" || typeof b === "object") {
    if (!plain(a) || !plain(b) || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => key in b && equal(a[key], b[key]));
  }
  if (typeof a === typeof b) return false;
  const [word, other] = typeof a === "string" ? [a, b] : [b, a];
  if (typeof other === "boolean" && (word === "true" || word === "false")) return (word === "true") === other;
  return numbered(a) === numbered(b);
}

// A model that is the one the box had: a list is, when it has the same
// values.
function alike(model, had) {
  if (model === had) return true;
  return Array.isArray(model) && Array.isArray(had) && model.length === had.length && model.every((value, index) => equal(value, had[index]));
}

const popupVisible = (self) => untrack(() => Boolean(self.popup?.visible));

// The view of the popup, which is what a style gives it for a content item,
// or something in that.
function viewOf(popup) {
  const find = (item, depth) => {
    if (!item) return null;
    if (typeof item.positionViewAtIndex === "function") return item;
    if (depth > 3) return null;
    for (const child of item.children ?? []) {
      const found = find(child, depth + 1);
      if (found) return found;
    }
    return null;
  };
  return untrack(() => find(popup?.contentItem, 0));
}

function updateCurrentText(self) {
  const text = untrack(() => self.textAt(self.currentIndex));
  put(self, "currentText", text);
  if (!self.$combo.accepting) setEditText(self, text);
}

function updateCurrentValue(self) {
  const value = untrack(() => self.valueAt(self.currentIndex));
  if (!equal(now(self, "currentValue"), value)) put(self, "currentValue", value);
}

// Qt's `updateCurrentElements`: what follows from what says which row is
// current.
function updateCurrentElements(self) {
  if (self.$combo.criteria === VALUE) {
    put(self, "currentIndex", untrack(() => self.indexOfValue(self.currentValue)));
    updateCurrentText(self);
  } else {
    updateCurrentText(self);
    updateCurrentValue(self);
  }
}

// The text a style's field shows is what the box says it is, whatever was
// typed into it since: in Qt typing leaves the field's binding as it was.
function setEditText(self, text) {
  if (!put(self, "editText", text)) return;
  const content = now(self, "contentItem");
  const held = isa(content, TextInput) ? slot(content, "text") : null;
  if (held?.bound && held.assigned) held.reset();
}

// Qt's `setCurrentItemAtIndex`: `activate` is for what the user did.
function setCurrentItemAtIndex(self, index, activate) {
  if (!put(self, "currentIndex", index)) return;
  updateCurrentText(self);
  updateCurrentValue(self);
  if (!activate) return;
  settle();
  self.activated(index);
}

function setHighlightedIndex(self, index, highlight) {
  if (!put(self, "highlightedIndex", index) || !highlight) return;
  settle();
  self.highlighted(index);
}

// A step to the next row or to the one before: of what is highlighted while
// the popup shows, and of what is current otherwise.
function stepped(self, by) {
  const mine = self.$combo;
  mine.allowComplete = false;
  const visible = popupVisible(self);
  const at = now(self, visible ? "highlightedIndex" : "currentIndex");
  const to = at + by;
  if (by > 0 ? at < now(self, "count") - 1 : at > 0) {
    if (visible) setHighlightedIndex(self, to, true);
    else setCurrentItemAtIndex(self, to, true);
  }
  mine.allowComplete = true;
}

// The first or the last row, as Home and End have it.
function ended(self, index) {
  if (popupVisible(self)) setHighlightedIndex(self, index, true);
  else setCurrentItemAtIndex(self, index, true);
}

function hidePopup(self, accept) {
  if (accept) {
    const index = now(self, "highlightedIndex");
    setCurrentItemAtIndex(self, index, false);
    // Hiding the popup for what the user did always says so, as Qt does,
    // whether the row changed or not.
    settle();
    self.activated(index);
  }
  const popup = now(self, "popup");
  if (popup && now(popup, "visible")) popup.close();
}

function togglePopup(self, accept) {
  const popup = now(self, "popup");
  if (!popup) return;
  if (now(popup, "visible")) hidePopup(self, accept);
  else popup.open();
}

function wildcard(text) {
  let pattern = "";
  for (const letter of text) {
    if (letter === "*") pattern += "[^/]*";
    else if (letter === "?") pattern += "[^/]";
    else if (letter === "[" || letter === "]") pattern += letter;
    else pattern += letter.replace(/[\\^$.|+(){}-]/, "\\$&");
  }
  return pattern;
}

// Whether a text is what is looked for, by the flags.
function tester(text, flags) {
  const exact = (flags & MatchCaseSensitive) !== 0;
  const fold = exact ? (string) => string : (string) => string.toLowerCase();
  const wanted = fold(text);
  const type = flags & 0x0f;
  switch (type) {
    case MatchExactly:
      return (found) => found === text;
    case MatchRegularExpression:
    case MatchWildcard:
      try {
        const pattern = new RegExp(`^(?:${type === MatchWildcard ? wildcard(text) : text})$`, exact ? "s" : "is");
        return (found) => pattern.test(found);
      } catch {
        return () => false;
      }
    case MatchStartsWith:
      return (found) => fold(found).startsWith(wanted);
    case MatchEndsWith:
      return (found) => fold(found).endsWith(wanted);
    case MatchFixedString:
      return (found) => fold(found) === wanted;
    default:
      return (found) => fold(found).includes(wanted);
  }
}

// Qt's `match`: the first row from `start` whose text is what is looked
// for, round to the rows before it when the flags say so.
function match(self, start, text, flags) {
  const test = tester(String(text), flags);
  return untrack(() => {
    let from = start;
    let to = self.count;
    for (let pass = flags & MatchWrap ? 2 : 1; pass > 0; pass--) {
      for (let index = from; index < to; index++) if (test(self.textAt(index))) return index;
      from = 0;
      to = start;
    }
    return -1;
  });
}

// A letter goes to the next row that starts with it.
function keySearch(self, text) {
  const visible = popupVisible(self);
  const index = match(self, now(self, visible ? "highlightedIndex" : "currentIndex") + 1, text, MatchStartsWith | MatchWrap);
  if (index === -1) return;
  if (visible) setHighlightedIndex(self, index, true);
  else setCurrentItemAtIndex(self, index, true);
}

// What a text that is typed is the start of: the first row that starts
// with it, or the shortest.
function tryComplete(self, input) {
  const start = input.toLowerCase();
  let found = "";
  untrack(() => {
    for (let index = 0, count = self.count; index < count; index++) {
      const text = self.textAt(index);
      if (text.toLowerCase().startsWith(start) && (found === "" || text.length < found.length)) found = text;
    }
  });
  return found === "" ? input : input + found.slice(input.length);
}

// Qt's `updateEditText`: what is typed is the text of the box, finished
// from the model's when there is a row that starts with it. What was not
// typed is selected, so that typing on replaces it.
function typed(self, content, text) {
  const mine = self.$combo;
  if (mine.allowComplete && text !== "") {
    const completed = tryComplete(self, text);
    if (completed.length > text.length) {
      const { field, sync } = content.$edit;
      field.value = completed;
      field.setSelectionRange(text.length, completed.length, "backward");
      slot(content, "text").write(completed);
      sync();
      text = completed;
    }
  }
  put(self, "editText", text);
}

// Return in the text: the row that says what it says is current, and
// `accepted` is said, for one that adds the text to the model.
function acceptInput(self) {
  const mine = self.$combo;
  let index = self.find(now(self, "editText"), MatchFixedString);
  if (index > -1) {
    setCurrentItemAtIndex(self, index, false);
    const content = now(self, "contentItem");
    const length = content.$edit.field.value.length;
    content.select(length, length);
  }
  mine.accepting = true;
  settle();
  self.accepted();
  if (index === -1) {
    index = self.find(now(self, "editText"), MatchFixedString);
    setCurrentItemAtIndex(self, index, false);
  }
  settle();
  mine.accepting = false;
}

// A delegate that is a button is one of the box's: a click of it picks its
// row and the mouse over it highlights it.
function hook(self, row, object) {
  if (!isa(object, AbstractButton)) return;
  slot(object, "focusPolicy").write(0);
  object.clicked.connect(() =>
    untrack(() => {
      if (row.$index < 0) return;
      setHighlightedIndex(self, row.$index, true);
      hidePopup(self, true);
      settle();
    }),
  );
  object.hoveredChanged.connect(() =>
    untrack(() => {
      if (self.$combo.keyNavigating || row.$index < 0 || !object.hovered || !object.enabled) return;
      setHighlightedIndex(self, row.$index, true);
      viewOf(self.popup)?.positionViewAtIndex(row.$index, Contain);
      settle();
    }),
  );
}

// The delegate as the box's model has it: the same one, its objects heard.
function hooked(self, given) {
  const mine = self.$combo;
  if (!given?.$component) return given;
  if (mine.given === given) return mine.delegate;
  mine.given = given;
  return (mine.delegate = $component((row) => {
    const object = given(row);
    hook(self, row, object);
    return object;
  }));
}

// The model a view shows: the one the box was given, when that makes its
// own objects, and otherwise the box's, of its model and its delegate.
function delegateModel(self) {
  const model = self.model;
  if (model?.$delegates || model?.$objects) return model;
  if (model === undefined || model === null) return null;
  const mine = self.$combo;
  mine.own ??= runWithOwner(self.$owner, () =>
    untrack(() =>
      DelegateModel({
        get model() {
          return self.model;
        },
        get delegate() {
          return hooked(self, self.delegate);
        },
      }),
    ),
  );
  return mine.own;
}

export const ComboBox = defineType("ComboBox", Control, {
  properties: {
    model: undefined,
    delegate: null,
    delegateModel: derived(delegateModel),
    // A model with nothing to show its rows with has none.
    count: derived((self) => {
      const model = self.delegateModel;
      if (!model || (model === self.$combo.own && !self.delegate)) return 0;
      return model.count;
    }),
    currentIndex: -1,
    currentText: "",
    currentValue: undefined,
    displayText: undefined,
    highlightedIndex: -1,
    textRole: "",
    valueRole: "",
    pressed: false,
    down: undefined,
    flat: false,
    indicator: null,
    popup: null,
    editable: false,
    editText: "",
    validator: null,
    // `Qt.ImhNoPredictiveText`.
    inputMethodHints: 64,
    inputMethodComposing: derived((self) => Boolean(self.contentItem?.inputMethodComposing)),
    acceptableInput: derived((self) => {
      const content = self.contentItem;
      return isa(content, TextInput) ? content.acceptableInput : true;
    }),
    selectTextByMouse: false,
    implicitContentWidthPolicy: 0,
    implicitIndicatorWidth: derived((self) => self.indicator?.implicitWidth ?? 0),
    implicitIndicatorHeight: derived((self) => self.indicator?.implicitHeight ?? 0),
    // `Qt.StrongFocus`.
    focusPolicy: 11,
  },
  enums: { ContentItemImplicitWidth: 0, WidestText: 1, WidestTextWhenCompleted: 2 },
  signals: ["activated", "highlighted", "accepted"],
  resolve: {
    // What the box shows is the current row's text until it is told what
    // to show, and it is down while it is pressed or its popup shows until
    // it is told whether it is: `undefined` takes either back.
    displayText: (self, own) => own() ?? self.currentText,
    down: (self, own) => own() ?? (self.pressed || Boolean(self.popup?.visible)),
  },
  methods: {
    $accepts: LeftButton,
    // The box and its text settle between them which has the keys.
    $focusScope: true,
    textAt(index) {
      return index >= 0 && index < this.count ? written(read(this, index, this.textRole || "modelData")) : "";
    },
    valueAt(index) {
      return index >= 0 && index < this.count ? read(this, index, this.valueRole || "modelData") : undefined;
    },
    indexOfValue(value) {
      for (let index = 0, count = this.count; index < count; index++) if (equal(value, this.valueAt(index))) return index;
      return -1;
    },
    find(text, flags = MatchExactly) {
      return match(this, 0, text, flags);
    },
    incrementCurrentIndex() {
      stepped(this, 1);
      settle();
    },
    decrementCurrentIndex() {
      stepped(this, -1);
      settle();
    },
    selectAll() {
      const content = now(this, "contentItem");
      if (isa(content, TextInput)) content.selectAll();
    },
    $handlePress() {
      // A press of the box is the box's own: the keys it was given by it
      // are its text's no more, and it has them from the mouse.
      const content = now(this, "contentItem");
      if (content?.$focus && now(this, "focusPolicy") & 2) {
        setFocus(content, false, MouseFocusReason);
        put(this, "focusReason", MouseFocusReason);
      }
      put(this, "pressed", true);
    },
    $handleMove(x, y) {
      put(this, "pressed", within(this, x, y));
    },
    $handleRelease() {
      if (!put(this, "pressed", false)) return;
      settle();
      togglePopup(this, false);
    },
    $handleUngrab() {
      put(this, "pressed", false);
    },
    $wheel(turn) {
      if (!now(this, "wheelEnabled")) return false;
      if (!popupVisible(this)) {
        stepped(this, turn.angleY > 0 ? -1 : 1);
        settle();
      }
      return true;
    },
    // The keys given to a box that is editable are its text's, when a key
    // brought them; and a box they leave shows no popup.
    $reason(reason) {
      Control.proto.$reason.call(this, reason);
      const mine = this.$combo;
      const had = mine.active;
      mine.active = this.$active === true;
      if (mine.active) {
        if (had || !KEYED.includes(reason) || !now(this, "editable")) return;
        if (windowOf(this).active !== this) return;
        const content = now(this, "contentItem");
        if (content) forceActiveFocus(content, reason);
        return;
      }
      if (!had) return;
      const popup = now(this, "popup");
      if (popup && now(popup, "activeFocus")) return;
      hidePopup(this, false);
      put(this, "pressed", false);
      // The row that says what was typed is current, once the keys are gone.
      if (!now(this, "editable")) return;
      const index = this.find(now(this, "editText"), MatchFixedString);
      if (index > -1) setCurrentItemAtIndex(this, index, true);
    },
    $keyPressed(event) {
      const mine = this.$combo;
      const { key } = event;
      const editable = now(this, "editable");
      if (!editable && PRESSES.includes(key)) {
        if (!event.isAutoRepeat) put(this, "pressed", true);
        event.accepted = true;
        return settle();
      }
      switch (key) {
        case Key.Key_Escape:
        case Key.Key_Back:
          mine.escaped = popupVisible(this);
          if (!mine.escaped) return;
          hidePopup(this, false);
          put(this, "pressed", false);
          break;
        case Key.Key_Enter:
        case Key.Key_Return:
          if (popupVisible(this)) put(this, "pressed", true);
          break;
        case Key.Key_Up:
        case Key.Key_Down:
          mine.keyNavigating = true;
          stepped(this, key === Key.Key_Up ? -1 : 1);
          break;
        case Key.Key_Home:
        case Key.Key_End:
          mine.keyNavigating = true;
          ended(this, key === Key.Key_Home ? 0 : now(this, "count") - 1);
          break;
        default:
          // A letter is looked for, and left for whatever else wants it.
          if (!editable && event.text !== "" && event.text >= " " && event.text !== "\x7f") {
            keySearch(this, event.text);
            settle();
          }
          return;
      }
      event.accepted = true;
      settle();
    },
    $keyReleased(event) {
      const mine = this.$combo;
      mine.keyNavigating = false;
      if (event.isAutoRepeat) return;
      const { key } = event;
      const editable = now(this, "editable");
      if (!editable && PRESSES.includes(key)) {
        if (now(this, "pressed")) togglePopup(this, true);
        put(this, "pressed", false);
      } else if (key === Key.Key_Enter || key === Key.Key_Return) {
        const visible = popupVisible(this);
        if (!editable || visible) hidePopup(this, visible);
        put(this, "pressed", false);
      } else if (key === Key.Key_Escape || key === Key.Key_Back) {
        const escaped = mine.escaped;
        mine.escaped = false;
        if (!escaped) return;
      } else {
        return;
      }
      event.accepted = true;
      settle();
    },
  },
  setup(self) {
    const [version, bump] = signal(0, self.$owner);
    const index = slot(self, "currentIndex");
    const value = slot(self, "currentValue");
    const stated = (held) => held.bound !== null || held.given !== undefined;
    const mine = (self.$combo = {
      criteria: stated(value) ? VALUE : stated(index) ? INDEX : NONE,
      complete: false,
      model: undefined,
      count: 0,
      own: null,
      given: null,
      delegate: null,
      active: false,
      keyNavigating: false,
      escaped: false,
      accepting: false,
      allowComplete: false,
    });
    loose(self, "currentIndex");
    keeps(self, () => [self.indicator]);

    // A model that says what changed in it says so to the box.
    let observed = null;
    let unobserve = null;
    const listener = { inserted: () => bump(next), removed: () => bump(next), moved: () => bump(next), role: () => bump(next) };
    onCleanup(() => unobserve?.());

    // What is current, of the model as it is: when the box is made, when it
    // is given another model, when that has no rows left, and whenever the
    // current row says something else.
    let last = null;
    effect(
      () => {
        const model = self.model;
        const at = self.currentIndex;
        version();
        return [model, self.count, at, self.currentValue, self.textRole, self.valueRole, self.textAt(at), self.valueAt(at), version()];
      },
      (seen) =>
        untrack(() => {
          const [model, count] = seen;
          const source = modelOf(model);
          if (source !== observed) {
            unobserve?.();
            observed = source;
            unobserve = typeof source?.$observe === "function" ? source.$observe(listener) : null;
          }
          const before = last;
          last = seen;
          if (!mine.complete) {
            mine.complete = true;
            mine.model = Array.isArray(model) ? model.slice() : model;
            mine.count = count;
            if (count === 0) return;
            if (mine.criteria === NONE && self.currentIndex === -1) put(self, "currentIndex", 0);
            return updateCurrentElements(self);
          }
          const had = mine.count;
          mine.count = count;
          if (!alike(model, mine.model)) {
            mine.model = Array.isArray(model) ? model.slice() : model;
            if (mine.criteria !== VALUE) put(self, "currentIndex", count > 0 ? 0 : -1);
            return updateCurrentElements(self);
          }
          // An effect is run again for any write of its object: only what
          // it saw change is a change.
          if (before.every((one, at) => at === 0 || Object.is(one, seen[at]))) return;
          if (count === 0 && had !== 0 && mine.criteria !== VALUE) put(self, "currentIndex", -1);
          updateCurrentElements(self);
        }),
    );

    // The popup of a box turns over to above it where there is no room
    // below, and closes for a press that is not on the box. One that is
    // replaced is seen no more.
    let popup = null;
    let visible = false;
    effect(
      () => {
        const given = self.popup;
        return [given, Boolean(given?.visible)];
      },
      ([given, shown]) =>
        untrack(() => {
          if (given !== popup) {
            if (popup) {
              popup.close();
              slot(popup, "parent").write(null);
            }
            popup = given;
            visible = false;
            if (given) {
              given.$flipY = true;
              slot(given, "closePolicy").write(POLICY);
            }
          }
          if (shown === visible) return;
          visible = shown;
          // The row that is current is the one highlighted as the popup
          // comes, at the top of what it shows; none is when it has gone.
          const view = viewOf(given);
          if (view) slot(view, "highlightRangeMode").write(0);
          setHighlightedIndex(self, shown ? self.currentIndex : -1, false);
          view?.positionViewAtIndex(self.highlightedIndex, Beginning);
        }),
    );

    // A box that is not seen shows no popup.
    effect(
      () => self.visible,
      (seen) => {
        if (seen) return;
        untrack(() => hidePopup(self, false));
        put(self, "pressed", false);
      },
    );

    // The text of a box that is editable: what is typed into it is the
    // box's text, and Return in it takes that for the row. A press of the
    // field gives it the keys: the page does so for its own, and the box is
    // told the mouse is why.
    let field = null;
    let heard = null;
    let text;
    let unhear = null;
    const pressed = () => {
      const content = now(self, "contentItem");
      if (content.$active) return;
      forceActiveFocus(content, MouseFocusReason);
      if (put(self, "focusReason", MouseFocusReason)) settle();
    };
    const released = () => {
      if (!popupVisible(self)) return;
      hidePopup(self, false);
      settle();
    };
    // What is typed is finished from the model's, but not what is left when
    // something is taken out.
    const keyed = (event) => {
      mine.allowComplete = event.key !== "Backspace" && event.key !== "Delete";
      if (event.key === "ArrowUp" || event.key === "ArrowDown") event.preventDefault();
    };
    const unheard = () => {
      field?.removeEventListener("pointerdown", pressed);
      field?.removeEventListener("pointerup", released);
      field?.removeEventListener("keydown", keyed);
      field = null;
      unhear?.();
      unhear = null;
    };
    onCleanup(unheard);
    effect(
      () => {
        const content = self.editable ? self.contentItem : null;
        return [content, isa(content, TextInput) ? content.text : undefined];
      },
      ([content, said]) => {
        if (content === heard) {
          if (said === text || said === undefined) return;
          text = said;
          return untrack(() => typed(self, content, said));
        }
        heard = content;
        text = said;
        unheard();
        if (!isa(content, TextInput)) return;
        field = content.$input ?? null;
        field?.addEventListener("pointerdown", pressed);
        field?.addEventListener("pointerup", released);
        field?.addEventListener("keydown", keyed);
        const accept = () => untrack(() => acceptInput(self));
        content.accepted.connect(accept);
        unhear = () => content.accepted.disconnect(accept);
      },
    );
  },
});

// The row that is current is said by its index, or by its value: whichever
// is assigned is what says so from then on.
function says(name, criteria) {
  const described = Object.getOwnPropertyDescriptor(ComboBox.proto, name);
  Object.defineProperty(ComboBox.proto, name, {
    ...described,
    set(value) {
      this.$combo.criteria = criteria;
      described.set.call(this, value);
    },
  });
}
says("currentIndex", INDEX);
says("currentValue", VALUE);
