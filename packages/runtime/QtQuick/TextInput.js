// TextInput, TextEdit: text the user edits. The editing is the browser's: an
// `<input>` and a `<textarea>` bring the caret, the selection, the clipboard,
// undo and the input methods. What QML reads of them (the text, where the
// cursor is, how large the text is) is kept as properties.
import { $string, defineType, derived, effect, flush, kinds, onChange, settle as settleAll, slot, typed } from "../object.js";
import { color, css } from "./color.js";
import { lazy, rules, sized } from "./compute.js";
import { forceActiveFocus, setFocus } from "./focus.js";
import { advance, capitalized, describe, dress, font, fonts, metrics, overhang } from "./font.js";
import { Item } from "./Item.js";
import { alignment } from "./LayoutMirroring.js";
import { AltModifier, ControlModifier, Key, MetaModifier } from "./keycodes.js";
import { arrange } from "./Text.js";
import { untrack } from "#kernel";

rules(`
.qq-edit {
  position: absolute; box-sizing: border-box; margin: 0; padding: 0; border: 0; border-radius: 0; outline: 0;
  background: none; appearance: none; resize: none; overflow: hidden;
}
.qq-edit::selection { background: var(--qq-selection); color: var(--qq-selected); }
`);

const MANY = 2147483647;
const ALIGNS = { 1: "left", 2: "right", 4: "center", 8: "justify" };
const CAPITALS = ["", "uppercase", "lowercase", "", "capitalize"];

// `Qt.ImhDigitsOnly` and the like, as the keyboard a touch screen shows.
const KEYBOARDS = [
  [0x10000, "numeric"],
  [0x20000, "decimal"],
  [0x100000, "tel"],
  [0x200000, "email"],
  [0x400000, "url"],
];

const string = (self) => String(self.text ?? "");

// The properties and the listeners the two share. `changed` is called when
// the user has changed the text; `home` says where the cursor goes when the
// program does: to the end in a TextInput, to the start in a TextEdit.
function editor(self, field, { changed, home, finished }) {
  field.className = "qq-edit";
  self.$node.append(field);
  // The field itself, for whoever moves the focus about.
  self.$input = field;
  const state = (self.$edit = { field, font: lazy(self, () => describe(self.font)) });

  // What the field says of its selection, as the properties.
  const sync = () => {
    const start = field.selectionStart ?? 0;
    const end = field.selectionEnd ?? 0;
    const first = slot(self, "selectionStart").write(start);
    const last = slot(self, "selectionEnd").write(end);
    const cursor = slot(self, "cursorPosition").write(field.selectionDirection === "backward" ? start : end);
    return first || last || cursor;
  };
  const settle = () => void (sync() && flush());
  state.sync = sync;
  // A change the program makes to the text and to the selection at once.
  state.put = (text, start, end, backward) => {
    field.value = text;
    field.setSelectionRange(start, end, backward ? "backward" : "forward");
    slot(self, "text").write(field.value);
    sync();
    flush();
  };

  // A validator turns down what the user types, not what the program sets,
  // so the field is put back as it was before the keystroke.
  let before = null;
  field.addEventListener("beforeinput", () => {
    before = { text: field.value, start: field.selectionStart, end: field.selectionEnd, direction: field.selectionDirection };
  });
  field.addEventListener("input", () => {
    if (before && self.validator?.$validate(field.value) === 0) {
      field.value = before.text;
      field.setSelectionRange(before.start, before.end, before.direction);
      return;
    }
    slot(self, "text").write(field.value);
    sync();
    flush();
    changed?.();
  });
  for (const name of ["select", "selectionchange", "keyup", "mouseup"]) field.addEventListener(name, settle);

  // `selectByMouse: false`: a drag moves the cursor and selects nothing.
  let pressed = false;
  field.addEventListener("mousedown", () => void (pressed = true));
  field.addEventListener("mouseup", () => void (pressed = false));
  field.addEventListener("mousemove", (event) => {
    if (!pressed || event.buttons === 0 || self.selectByMouse) return;
    const cursor = field.selectionDirection === "backward" ? field.selectionStart : field.selectionEnd;
    if (field.selectionStart !== field.selectionEnd) field.setSelectionRange(cursor, cursor);
  });
  field.addEventListener("dblclick", () => {
    if (self.selectByMouse) return;
    field.setSelectionRange(field.selectionEnd, field.selectionEnd);
    settle();
  });

  // Which item has focus is decided as for any item (focus.js). The field
  // has the browser's while its item has active focus, and when the user
  // puts the browser's in the field, the item is given it.
  field.addEventListener("focus", () => {
    if (!self.$active) forceActiveFocus(self);
    sync();
    settleAll();
  });
  field.addEventListener("blur", () => {
    // A page that is left altogether gives the field its focus back when it
    // is returned to: the item keeps its own meanwhile.
    if (self.$active && document.hasFocus()) setFocus(self, false);
    sync();
    settleAll();
    finished();
  });
  // A press beside the text, inside the item, is a press on the item.
  self.$node.addEventListener("mousedown", (event) => {
    if (event.target !== self.$node || !self.activeFocusOnPress || !self.enabled) return;
    event.preventDefault();
    field.focus();
  });
  effect(
    () => Boolean(self.activeFocus),
    (wanted) => {
      if (wanted === (document.activeElement === field)) return;
      // `focus: true` on a field that is not in the page yet.
      if (!field.isConnected) return void (wanted && queueMicrotask(() => self.$active && field.focus()));
      // The listeners read what they like: they are run, not kept up to date.
      untrack(() => (wanted ? field.focus() : field.blur()));
    },
  );

  onChange(self, "cursorPosition", () => {
    const wanted = self.cursorPosition;
    // What the field said is not something to tell it.
    if (wanted === (field.selectionDirection === "backward" ? field.selectionStart : field.selectionEnd)) return;
    // Qt ignores a position outside the text.
    if (Number.isInteger(wanted) && wanted >= 0 && wanted <= field.value.length) field.setSelectionRange(wanted, wanted);
    sync();
  });

  effect(
    () => string(self),
    (text) => {
      if (field.value === text) return;
      field.value = text;
      const cursor = home(text);
      field.setSelectionRange(cursor, cursor);
      sync();
    },
  );

  effect(
    () => ({
      font: state.font(),
      color: css(self.color),
      selection: css(self.selectionColor),
      selected: css(self.selectedTextColor),
      align: ALIGNS[self.effectiveHorizontalAlignment] ?? "left",
      capitals: CAPITALS[self.font.capitalization] ?? "",
      readOnly: Boolean(self.readOnly),
      enabled: Boolean(self.enabled),
      hints: self.inputMethodHints,
    }),
    (next) => {
      const style = field.style;
      dress(style, next.font);
      style.lineHeight = `${metrics(next.font).height}px`;
      style.color = next.color;
      style.caretColor = next.color;
      style.setProperty("--qq-selection", next.selection);
      style.setProperty("--qq-selected", next.selected);
      style.textAlign = next.align;
      style.textTransform = next.capitals;
      field.readOnly = next.readOnly;
      // A field that is not enabled is not there for the mouse: a press on
      // it is for what is under it, as the text of a combo box is.
      style.pointerEvents = next.enabled ? "" : "none";
      field.inputMode = KEYBOARDS.find(([hint]) => next.hints & hint)?.[1] ?? "";
      field.autocapitalize = next.hints & 0x4 ? "off" : "";
      field.spellcheck = !(next.hints & 0x40);
    },
  );
}

// Where the selection is after `count` characters went in (or, negative,
// came out) at `position`.
const moved = (index, position, count) =>
  count >= 0 ? (index >= position ? index + count : index) : index <= position ? index : Math.max(index + count, position);

const methods = {
  selectAll() {
    this.select(0, this.$edit.field.value.length);
  },
  // From `start` to `end`: the cursor is at `end`, which may come first.
  select(start, end) {
    const { field, sync } = this.$edit;
    const length = field.value.length;
    if (!(start >= 0 && end >= 0 && start <= length && end <= length)) return;
    field.setSelectionRange(Math.min(start, end), Math.max(start, end), end < start ? "backward" : "forward");
    if (sync()) flush();
  },
  deselect() {
    const cursor = this.cursorPosition;
    this.select(cursor, cursor);
  },
  clear() {
    this.$edit.put("", 0, 0);
  },
  insert(position, text) {
    const { field, put } = this.$edit;
    const whole = field.value;
    if (!(position >= 0 && position <= whole.length)) return;
    const added = String(text);
    const at = (index) => moved(index, position, added.length);
    put(
      whole.slice(0, position) + added + whole.slice(position),
      at(field.selectionStart),
      at(field.selectionEnd),
      field.selectionDirection === "backward",
    );
  },
  remove(start, end) {
    const { field, put } = this.$edit;
    const whole = field.value;
    const from = Math.max(Math.min(start, end), 0);
    const to = Math.min(Math.max(start, end), whole.length);
    if (!(from < to)) return;
    const at = (index) => moved(index, from, from - to);
    put(
      whole.slice(0, from) + whole.slice(to),
      at(field.selectionStart),
      at(field.selectionEnd),
      field.selectionDirection === "backward",
    );
  },
  getText(start, end) {
    return string(this).slice(Math.min(start, end), Math.max(start, end));
  },
};

const MOVES = [Key.Key_Left, Key.Key_Right, Key.Key_Home, Key.Key_End];
const LINES = [Key.Key_Up, Key.Key_Down, Key.Key_PageUp, Key.Key_PageDown];
const ERASES = [Key.Key_Backspace, Key.Key_Delete];
// Select all, copy, paste, cut, undo, redo.
const COMMANDS = [..."ACVXZY"].map((letter) => letter.charCodeAt(0));

// Whether a key is one the field itself does something with, as Qt's does:
// it is accepted, and what the browser does with it is what was done. Any
// other is offered to the items the field is in. `Keys` handlers of the
// field come before this, and one that accepts the key keeps it from the
// field.
function edits(self, event, lines) {
  const { key, modifiers } = event;
  if (modifiers & (ControlModifier | MetaModifier)) {
    if (MOVES.includes(key) || ERASES.includes(key)) return true;
    return !(modifiers & AltModifier) && COMMANDS.includes(key);
  }
  if (MOVES.includes(key) || (lines && LINES.includes(key))) return true;
  if (self.readOnly) return false;
  if (ERASES.includes(key)) return true;
  // What types a character.
  return event.text !== "" && event.text >= " " && event.text !== "\x7f";
}

const padding = derived((self) => self.padding);

// What the two have in common.
const shared = {
  text: $string,
  font,
  color: typed(kinds.color, color("black")),
  selectionColor: "#000080",
  selectedTextColor: "white",
  horizontalAlignment: 1,
  effectiveHorizontalAlignment: derived(alignment),
  verticalAlignment: 32,
  readOnly: false,
  selectByMouse: true,
  activeFocusOnPress: true,
  inputMethodHints: 0,
  cursorPosition: 0,
  selectionStart: 0,
  selectionEnd: 0,
  selectedText: derived((self) => string(self).slice(self.selectionStart, self.selectionEnd)),
  length: derived((self) => string(self).length),
  padding: 0,
  leftPadding: padding,
  topPadding: padding,
  rightPadding: padding,
  bottomPadding: padding,
};

const ALIGNMENTS = {
  AlignLeft: 1,
  AlignRight: 2,
  AlignHCenter: 4,
  AlignJustify: 8,
  AlignTop: 32,
  AlignBottom: 64,
  AlignVCenter: 128,
};

// How far down the room the text starts: `verticalAlignment`.
const dropped = (align, room) => (align === 64 ? room : align === 128 ? room / 2 : 0);

// What an echo mode shows of the text.
function displayed(self) {
  const text = string(self);
  const mode = self.echoMode;
  if (mode === 1) return "";
  if (mode === 2 || (mode === 3 && !self.activeFocus)) return String(self.passwordCharacter).repeat(text.length);
  return text;
}

function line(self) {
  fonts();
  return metrics(self.$edit.font());
}

export const TextInput = defineType("TextInput", Item, {
  properties: {
    ...shared,
    echoMode: 0,
    passwordCharacter: "●",
    maximumLength: 32767,
    validator: null,
    displayText: derived(displayed),
    acceptableInput: derived((self) => (self.validator ? self.validator.$validate(string(self)) === 2 : true)),
    contentWidth: derived((self) => {
      fonts();
      const shown = capitalized(self.displayText, self.font.capitalization);
      const spec = self.$edit.font();
      return advance(spec, shown) + overhang(spec, shown);
    }),
    contentHeight: derived((self) => line(self).height),
    // Qt leaves room for the cursor after the last character.
    implicitWidth: derived((self) => Math.ceil(self.contentWidth) + self.leftPadding + self.rightPadding),
    implicitHeight: derived((self) => self.contentHeight + self.topPadding + self.bottomPadding),
    baselineOffset: derived((self) => {
      const face = line(self);
      const room = self.height - self.topPadding - self.bottomPadding - face.height;
      return self.topPadding + dropped(self.verticalAlignment, room) + face.ascent;
    }),
  },
  resolve: {
    // The text is never longer than `maximumLength`, whoever sets it.
    text: (self, own) => String(own() ?? "").slice(0, Math.max(self.maximumLength, 0)),
  },
  signals: ["accepted", "editingFinished", "textEdited"],
  enums: { ...ALIGNMENTS, Normal: 0, NoEcho: 1, Password: 2, PasswordEchoOnEdit: 3 },
  methods: {
    ...methods,
    $keyPressed(event) {
      const key = event.key;
      if (key === Key.Key_Return || key === Key.Key_Enter) {
        // Said, and left for whatever is around the field, as in Qt.
        if (!this.acceptableInput) return;
        this.accepted();
        this.editingFinished();
        return;
      }
      // An arrow that would leave the text moves nothing: it is for whoever
      // navigates with the arrows, unless it takes a selection away.
      if (key === Key.Key_Left || key === Key.Key_Right) {
        const { selectionStart, selectionEnd, value } = this.$edit.field;
        if (selectionStart === selectionEnd && selectionEnd === (key === Key.Key_Left ? 0 : value.length)) return;
      }
      event.accepted = edits(this, event, false);
    },
  },
  setup(self) {
    const field = document.createElement("input");
    const finished = () => {
      if (self.acceptableInput) self.editingFinished();
    };
    editor(self, field, { changed: () => self.textEdited(), home: (text) => text.length, finished });
    effect(
      () => {
        const face = line(self);
        const room = self.height - self.topPadding - self.bottomPadding - face.height;
        const mode = self.echoMode;
        return {
          left: self.leftPadding,
          top: self.topPadding + dropped(self.verticalAlignment, room),
          width: Math.max(self.width - self.leftPadding - self.rightPadding, 0),
          height: face.height,
          // The browser has no field that shows nothing: one that hides
          // what is typed is the nearest.
          hidden: mode === 1 || mode === 2 || (mode === 3 && !self.activeFocus),
          most: Math.max(self.maximumLength, 0),
        };
      },
      (next) => {
        const style = field.style;
        style.left = `${next.left}px`;
        style.top = `${next.top}px`;
        style.width = `${next.width}px`;
        style.height = `${next.height}px`;
        field.type = next.hidden ? "password" : "text";
        field.maxLength = next.most;
      },
    );
  },
});

// The font of a TextEdit, with how far apart its tab stops are.
function tabbing(self) {
  return { ...self.$edit.font(), tab: self.tabStopDistance };
}

// The lines of a TextEdit: the browser breaks them in the field, and they
// are broken here too, as Text breaks them, for what the size is.
function laid(self) {
  fonts();
  const spec = tabbing(self);
  const face = metrics(spec);
  const wide = sized(self, "width");
  const limit = wide ? Math.max(self.width - self.leftPadding - self.rightPadding, 0) : Infinity;
  const text = capitalized(string(self), self.font.capitalization);
  const made = arrange(text, spec, limit, wide ? self.wrapMode : 0, 3, MANY, Infinity, face.height, self.effectiveHorizontalAlignment, true);
  made.height = made.count * face.height;
  return made;
}

const WRAPS = {
  0: ["pre", "normal", "normal"],
  1: ["pre-wrap", "normal", "normal"],
  3: ["pre-wrap", "normal", "break-all"],
  4: ["pre-wrap", "anywhere", "normal"],
};

export const TextEdit = defineType("TextEdit", Item, {
  properties: {
    ...shared,
    wrapMode: 0,
    tabStopDistance: 80,
    textFormat: 0,
    lineCount: derived((self) => self.$edit.layout().count),
    contentWidth: derived((self) => self.$edit.layout().width),
    contentHeight: derived((self) => self.$edit.layout().height),
    paintedWidth: derived((self) => self.$edit.layout().width),
    paintedHeight: derived((self) => self.$edit.layout().height),
    implicitWidth: derived((self) => self.$edit.natural() + self.leftPadding + self.rightPadding),
    implicitHeight: derived((self) => self.contentHeight + self.topPadding + self.bottomPadding),
    baselineOffset: derived((self) => {
      const room = self.height - self.topPadding - self.bottomPadding - self.contentHeight;
      return self.topPadding + dropped(self.verticalAlignment, room) + line(self).ascent;
    }),
  },
  signals: ["editingFinished"],
  enums: {
    ...ALIGNMENTS,
    NoWrap: 0,
    WordWrap: 1,
    WrapAnywhere: 3,
    WrapAtWordBoundaryOrAnywhere: 4,
    Wrap: 4,
    PlainText: 0,
    RichText: 1,
    AutoText: 2,
    MarkdownText: 3,
  },
  methods: {
    ...methods,
    $keyPressed(event) {
      const enter = event.key === Key.Key_Return || event.key === Key.Key_Enter;
      event.accepted = enter ? !this.readOnly : edits(this, event, true);
    },
    // A new paragraph at the end.
    append(text) {
      const { field, put } = this.$edit;
      const whole = field.value;
      put(
        whole === "" ? String(text) : `${whole}\n${text}`,
        field.selectionStart,
        field.selectionEnd,
        field.selectionDirection === "backward",
      );
    },
  },
  setup(self) {
    const field = document.createElement("textarea");
    editor(self, field, { home: () => 0, finished: () => self.editingFinished() });
    const state = self.$edit;
    state.layout = lazy(self, () => laid(self));
    // Apart from the layout, which depends on the width: a binding of
    // `width` may read this one.
    state.natural = lazy(self, () => {
      fonts();
      const spec = tabbing(self);
      let width = 0;
      for (const paragraph of capitalized(string(self), self.font.capitalization).split("\n")) {
        width = Math.max(width, advance(spec, paragraph) + overhang(spec, paragraph));
      }
      return width;
    });
    effect(
      () => {
        const height = Math.max(self.height - self.topPadding - self.bottomPadding, 0);
        return {
          left: self.leftPadding,
          top: self.topPadding,
          width: Math.max(self.width - self.leftPadding - self.rightPadding, 0),
          height,
          // The field fills the item, so that a press anywhere in it puts
          // the cursor in the text: the alignment is room above the text.
          above: Math.max(dropped(self.verticalAlignment, height - self.contentHeight), 0),
          wrap: WRAPS[sized(self, "width") ? self.wrapMode : 0] ?? WRAPS[0],
          tab: self.tabStopDistance,
        };
      },
      (next) => {
        const style = field.style;
        style.left = `${next.left}px`;
        style.top = `${next.top}px`;
        style.width = `${next.width}px`;
        style.height = `${next.height}px`;
        style.paddingTop = `${next.above}px`;
        [style.whiteSpace, style.overflowWrap, style.wordBreak] = next.wrap;
        style.tabSize = `${next.tab}px`;
      },
    );
  },
});
