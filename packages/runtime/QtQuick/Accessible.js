// Accessible: what an item is to someone who does not see it. A page says
// that with ARIA attributes on the item's element, and so does this: what
// reads the page aloud reads a QML program as it reads any other.
import { defineType, derived, effect, QtObject, slot } from "../object.js";

// prettier-ignore
const Role = {
  NoRole: 0, TitleBar: 1, MenuBar: 2, ScrollBar: 3, Grip: 4, Sound: 5, Cursor: 6, Caret: 7, AlertMessage: 8,
  Window: 9, Client: 10, PopupMenu: 11, MenuItem: 12, ToolTip: 13, Application: 14, Document: 15, Pane: 16,
  Chart: 17, Dialog: 18, Border: 19, Grouping: 20, Separator: 21, ToolBar: 22, StatusBar: 23, Table: 24,
  ColumnHeader: 25, RowHeader: 26, Column: 27, Row: 28, Cell: 29, Link: 30, HelpBalloon: 31, Assistant: 32,
  List: 33, ListItem: 34, Tree: 35, TreeItem: 36, PageTab: 37, PropertyPage: 38, Indicator: 39, Graphic: 40,
  StaticText: 41, EditableText: 42, Button: 43, PushButton: 43, CheckBox: 44, RadioButton: 45, ComboBox: 46,
  ProgressBar: 48, Dial: 49, HotkeyField: 50, Slider: 51, SpinBox: 52, Canvas: 53, Animation: 54, Equation: 55,
  ButtonDropDown: 56, ButtonMenu: 57, ButtonDropGrid: 58, Whitespace: 59, PageTabList: 60, Clock: 61,
  Splitter: 62, LayeredPane: 128, Terminal: 129, Desktop: 130, Paragraph: 131, WebDocument: 132, Section: 133,
  Notification: 134, Switch: 135, ColorChooser: 1028, Footer: 1038, Form: 1040, Heading: 1044, Note: 1051,
  ComplementaryContent: 1068, BlockQuote: 1073, UserRole: 65535,
};

// The roles ARIA has a word for. One it has none for is left unsaid: what
// the element holds is read as it is.
// prettier-ignore
const ARIA = {
  [Role.MenuBar]: "menubar", [Role.ScrollBar]: "scrollbar", [Role.AlertMessage]: "alert", [Role.PopupMenu]: "menu",
  [Role.MenuItem]: "menuitem", [Role.ToolTip]: "tooltip", [Role.Application]: "application",
  [Role.Document]: "document", [Role.Dialog]: "dialog", [Role.Grouping]: "group", [Role.Separator]: "separator",
  [Role.ToolBar]: "toolbar", [Role.StatusBar]: "status", [Role.Table]: "table", [Role.ColumnHeader]: "columnheader",
  [Role.RowHeader]: "rowheader", [Role.Row]: "row", [Role.Cell]: "cell", [Role.Link]: "link", [Role.List]: "list",
  [Role.ListItem]: "listitem", [Role.Tree]: "tree", [Role.TreeItem]: "treeitem", [Role.PageTab]: "tab",
  [Role.PropertyPage]: "tabpanel", [Role.Graphic]: "img", [Role.EditableText]: "textbox", [Role.Button]: "button",
  [Role.CheckBox]: "checkbox", [Role.RadioButton]: "radio", [Role.ComboBox]: "combobox",
  [Role.ProgressBar]: "progressbar", [Role.Dial]: "slider", [Role.Slider]: "slider", [Role.SpinBox]: "spinbutton",
  [Role.Equation]: "math", [Role.ButtonDropDown]: "button", [Role.ButtonMenu]: "button", [Role.PageTabList]: "tablist",
  [Role.Paragraph]: "paragraph", [Role.WebDocument]: "document", [Role.Notification]: "status", [Role.Switch]: "switch",
  [Role.Footer]: "contentinfo", [Role.Form]: "form", [Role.Heading]: "heading", [Role.Note]: "note",
  [Role.ComplementaryContent]: "complementary", [Role.BlockQuote]: "blockquote",
  // A section is a part of the page, as ARIA's region is: a named one is a
  // landmark a reader can go to, as Core-AAM maps it.
  [Role.Section]: "region",
};

const Polite = 0;
const Assertive = 1;

// What is announced is put where a reader listens: one place for all.
let live;
function announce(message, politeness) {
  if (!live) {
    live = document.createElement("div");
    live.style.cssText = "position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%);";
    document.body.append(live);
  }
  live.setAttribute("aria-live", politeness === Assertive ? "assertive" : "polite");
  live.textContent = String(message);
}

// The item's element says where it is found by another's `labelledBy`.
let count = 0;
const named = (item) => (item?.$node ? (item.$node.id ||= `qq-accessible-${++count}`) : null);

// What a control is to a reader when its author says nothing: a role by
// its type and a name from its text or title, as native Ljós has them. A
// derived type says its own role over its base's, and keeps the base's
// name unless it says one: a `TabButton` is a tab named as any button is.
// `role` is a role's name, or what gives the number for an item; `name`
// what gives the name; `state` how the control's own `checked` is said:
// "checked" for one that checks, "selected" for a tab, which ARIA has
// selected rather than checked.
const spoken = new Map();
export function speaks(Type, role, name, state) {
  spoken.set(Type, { role: typeof role === "string" ? Role[role] : role, name, state });
}

function said(item, what) {
  const chain = item?.$type?.chain;
  for (let i = (chain?.length ?? 0) - 1; i >= 0; i--) {
    const value = spoken.get(chain[i])?.[what];
    if (value !== undefined) return typeof value === "function" ? value(item) : value;
  }
  return undefined;
}

// The role an object is given by its type, for a popup's item by its popup.
export const roleOf = (object) => said(object, "role") ?? Role.NoRole;

// A button's text, as it is said: `&` marks the next character as its
// mnemonic and goes, `&&` is one `&`, and a last `&` stays.
export const unmarked = (text) => String(text ?? "").replace(/&(.)/gs, "$1");

// What a control that checks or is selected says when its author does
// not: whether it can be, whether it is and, checked, whether it is partly.
const OWN = {
  checked: { checkable: "checkable", checked: "checked", checkStateMixed: "checkState" },
  selected: { selectable: true, selected: "checked" },
};
function ofControl(item, name) {
  const from = OWN[said(item, "state")]?.[name];
  if (from === undefined) return false;
  if (from === true) return true;
  if (from === "checkState") return item.checkState === 1;
  return Boolean(item[from]);
}

// An attribute a state has only when the item says it has that state.
const states = [
  ["checked", "aria-checked", (own) => own("checkable") || own("checked")],
  ["pressed", "aria-pressed", (own) => own("pressed")],
  ["selected", "aria-selected", (own) => own("selectable") || own("selected")],
  ["readOnly", "aria-readonly", (own) => own("readOnly")],
  ["multiLine", "aria-multiline", (own) => own("multiLine")],
];

// Where Qt's words and ARIA's part. ARIA allows `aria-checked` on few
// roles: a button that checks is a toggle, said with `aria-pressed`, and
// a menu item that checks is a role of its own. A heading has a level,
// which Qt's roles do not carry: one no author gives is ARIA's own
// default. A name on an element with no role is no name to ARIA, so a
// named item whose role says nothing is a named group, as native Ljós
// tells it. A control of a value says it and where it lies, as Qt's
// value interface does; a slider or scroll bar with none to say is no
// slider to ARIA, which asks one of it, and is a group too. ARIA has no
// selected list item: the one chosen is its list's current.
const HEADING_LEVEL = "2";
const VALUED = new Set(["slider", "spinbutton", "progressbar", "scrollbar"]);
const OWES_VALUE = new Set(["slider", "scrollbar"]);
function valueOf(item, role) {
  if (!VALUED.has(role) || !item) return null;
  const [now, min, max] = [item.value, item.from, item.to].map(Number);
  if ([now, min, max].every(Number.isFinite)) return [now, Math.min(min, max), Math.max(min, max)].map(String);
  // A scroll bar's value is how far along it is, of all it can go.
  const [position, size] = [item.position, item.size].map(Number);
  if (role === "scrollbar" && Number.isFinite(position) && Number.isFinite(size))
    return [String(size >= 1 ? 0 : Math.round((100 * position) / (1 - size))), "0", "100"];
  return null;
}
function worded(role, name, told, value) {
  const at = (state) => states.findIndex(([own]) => own === state);
  const checked = told[at("checked")];
  if (role === "button" && checked !== null) {
    told[at("pressed")] = checked;
    told[at("checked")] = null;
  }
  if (role === "menuitem" && checked !== null) role = "menuitemcheckbox";
  let current = null;
  if (role === "listitem") {
    current = told[at("selected")] === "true" ? "true" : null;
    told[at("selected")] = null;
  }
  if (OWES_VALUE.has(role) && !value) role = null;
  if (!role && name) role = "group";
  return [role, role === "heading" ? HEADING_LEVEL : null, current];
}

// The attributes of an item's element, from its `Accessible` object when it
// has one and from what its type says when it does not. A state the author
// set is theirs; one they did not is the control's.
function aria(self, item) {
  const own = (name) => (self && slot(self, name).explicit() ? Boolean(self[name]) : ofControl(item, name));
  const name = self ? self.name : (said(item, "name") ?? "");
  const told = states.map(([state, , has]) => (has(own) ? (state === "checked" && own("checkStateMixed") ? "mixed" : String(own(state))) : null));
  const asked = self?.searchEdit ? "searchbox" : (ARIA[self ? self.role : roleOf(item)] ?? null);
  const value = valueOf(item, asked);
  const [role, level, current] = worded(asked, name, told, value);
  const [now, min, max] = value ?? [null, null, null];
  return [role, name, self?.description ?? "", self?.ignored ?? false, named(self?.labelledBy), level, current, now, min, max, ...told];
}

function show(node, [role, name, description, ignored, labelledBy, level, current, now, min, max, ...told]) {
  const set = (name, value) => (value === null || value === "" ? node.removeAttribute(name) : node.setAttribute(name, value));
  set("role", role);
  set("aria-label", name);
  set("aria-description", description);
  set("aria-hidden", ignored ? "true" : null);
  set("aria-labelledby", labelledBy);
  set("aria-level", level);
  set("aria-current", current);
  set("aria-valuenow", now);
  set("aria-valuemin", min);
  set("aria-valuemax", max);
  states.forEach(([, attribute], index) => set(attribute, told[index]));
}

// What `show` wrote, taken off again: an attribute of no value is
// none of them.
const UNSPOKEN = [null, "", "", false, null, null, null, null, null, null, ...states.map(() => null)];

// Where an item's saying goes: on its element, but a text box's is
// its field — the form element inside it is what a reader edits,
// and a name on the box around it names that, not this. The field
// may be made after the item is (a control's content), so where
// the saying goes is asked for as it is shown, and a saying shown
// on the box moves to the field when the field stands.
function shower(item) {
  let shown = null;
  return (attributes) => {
    if (!attributes) return;
    const field =
      attributes[0] === "textbox" || attributes[0] === "searchbox"
        ? (item.$input ?? item.$node?.querySelector?.("input.qq-edit, textarea.qq-edit") ?? null)
        : null;
    const node = field ?? item.$node;
    if (!node) return;
    if (shown && shown !== node) show(shown, UNSPOKEN);
    shown = node;
    show(node, attributes);
  };
}

// A control whose type says what it is says it on its element, before
// anything asks for its `Accessible` object; once something has, that
// object says it.
export function described(item) {
  const node = item.$node;
  if (!node || !item.$type.chain.some((Type) => spoken.get(Type)?.role !== undefined)) return;
  effect(
    () => (item.$attached?.Accessible ? null : aria(null, item)),
    shower(item),
  );
}

const AccessibleAttached = defineType("AccessibleAttached", QtObject, {
  properties: {
    // Derived: what the author gives is the first assignment.
    role: derived((self) => roleOf(self.$props.$attachee)),
    name: derived((self) => said(self.$props.$attachee, "name") ?? ""),
    description: "",
    id: "",
    ignored: false,
    labelledBy: null,
    labelFor: null,
    checkable: false,
    checked: false,
    editable: false,
    focusable: false,
    focused: false,
    multiLine: false,
    readOnly: false,
    selected: false,
    selectable: false,
    pressed: false,
    checkStateMixed: false,
    defaultButton: false,
    passwordEdit: false,
    selectableText: false,
    searchEdit: false,
  },
  // The actions are asked for by what reads the page; a browser asks for
  // them by clicking, which the item hears as it hears any click.
  signals: [
    "pressAction",
    "toggleAction",
    "increaseAction",
    "decreaseAction",
    "scrollUpAction",
    "scrollDownAction",
    "scrollLeftAction",
    "scrollRightAction",
    "previousPageAction",
    "nextPageAction",
  ],
  enums: { ...Role, Polite, Assertive },
  methods: {
    announce,
    setIgnored(ignored) {
      slot(this, "ignored").write(Boolean(ignored));
    },
    // The text of what is marked up, as it is read.
    stripHtml(html) {
      return new DOMParser().parseFromString(String(html), "text/html").body.textContent ?? "";
    },
    // The browser tells of an element's changes itself.
    valueChanged() {},
    cursorPositionChanged() {},
  },
  setup(self, props) {
    const node = props.$attachee?.$node;
    if (!node) return;
    effect(
      () => aria(self, props.$attachee),
      shower(props.$attachee),
    );
    // What an item is the label for is labelled by it.
    effect(
      () => self.labelFor?.$node ?? null,
      (labelled) => labelled?.setAttribute("aria-labelledby", named(props.$attachee)),
    );
  },
});

export const Accessible = defineType("Accessible", QtObject, {
  enums: { ...Role, Polite, Assertive },
  attached: AccessibleAttached,
});
// `Accessible.announce(...)` is said of the type as well as of an item.
Accessible.announce = announce;
