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

// The attributes of an item's element, from its `Accessible` object when it
// has one and from what its type says when it does not. A state the author
// set is theirs; one they did not is the control's.
function aria(self, item) {
  const own = (name) => (self && slot(self, name).explicit() ? Boolean(self[name]) : ofControl(item, name));
  const role = self ? self.role : roleOf(item);
  return [
    self?.searchEdit ? "searchbox" : (ARIA[role] ?? null),
    self ? self.name : (said(item, "name") ?? ""),
    self?.description ?? "",
    self?.ignored ?? false,
    named(self?.labelledBy),
    ...states.map(([name, , has]) => (has(own) ? (name === "checked" && own("checkStateMixed") ? "mixed" : String(own(name))) : null)),
  ];
}

function show(node, [role, name, description, ignored, labelledBy, ...told]) {
  const set = (name, value) => (value === null || value === "" ? node.removeAttribute(name) : node.setAttribute(name, value));
  set("role", role);
  set("aria-label", name);
  set("aria-description", description);
  set("aria-hidden", ignored ? "true" : null);
  set("aria-labelledby", labelledBy);
  states.forEach(([, attribute], index) => set(attribute, told[index]));
}

// A control whose type says what it is says it on its element, before
// anything asks for its `Accessible` object; once something has, that
// object says it.
export function described(item) {
  const node = item.$node;
  if (!node || !item.$type.chain.some((Type) => spoken.get(Type)?.role !== undefined)) return;
  effect(
    () => (item.$attached?.Accessible ? null : aria(null, item)),
    (attributes) => {
      if (attributes) show(node, attributes);
    },
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
      (attributes) => show(node, attributes),
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
