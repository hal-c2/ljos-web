// MessageDialog: a `<dialog>` of the browser's, with the buttons QML asks
// for. It looks as the browser draws a dialog and its buttons, and is modal
// as the browser makes one: the page behind it takes no press, Escape
// rejects it.
import { onCleanup } from "solid-js";
import { defineType, effect } from "../../object.js";
import { rules } from "../compute.js";
import { Dialog } from "./Dialog.js";
import { untrack } from "#kernel";

rules(`
.qq-message { box-sizing: border-box; min-width: 18em; max-width: min(32em, calc(100vw - 2em)); padding: 1.25em; border: 1px solid ButtonBorder; border-radius: 8px; font: 14px/1.4 system-ui, sans-serif; }
.qq-message:not(:modal) { position: fixed; inset-block: 0; z-index: 2147483647; }
.qq-message h2, .qq-message p { margin: 0 0 0.6em; font: inherit; white-space: pre-wrap; overflow-wrap: anywhere; }
.qq-message h2 { font-weight: 600; }
.qq-message details { margin: 0 0 0.6em; }
.qq-message pre { margin: 0.4em 0 0; max-height: 12em; overflow: auto; font: inherit; white-space: pre-wrap; }
.qq-message menu { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.5em; margin: 1em 0 0; padding: 0; }
.qq-message button { min-width: 5.5em; padding: 0.3em 0.9em; font: inherit; }
`);

const REJECTED = 0;
const ACCEPTED = 1;
const NON_MODAL = 0;

const INVALID = -1;
const ACCEPT = 0;
const REJECT = 1;
const DESTRUCTIVE = 2;
const ACTION = 3;
const HELP = 4;
const YES = 5;
const NO = 6;
const RESET = 7;
const APPLY = 8;

const OK = 0x400;

// Qt's standard buttons: the flag, the name QML knows it by, what it says
// and the role it plays.
const BUTTONS = [
  [OK, "Ok", "OK", ACCEPT],
  [0x800, "Save", "Save", ACCEPT],
  [0x1000, "SaveAll", "Save All", ACCEPT],
  [0x2000, "Open", "Open", ACCEPT],
  [0x4000, "Yes", "Yes", YES],
  [0x8000, "YesToAll", "Yes to All", YES],
  [0x10000, "No", "No", NO],
  [0x20000, "NoToAll", "No to All", NO],
  [0x40000, "Abort", "Abort", REJECT],
  [0x80000, "Retry", "Retry", ACCEPT],
  [0x100000, "Ignore", "Ignore", ACCEPT],
  [0x200000, "Close", "Close", REJECT],
  [0x400000, "Cancel", "Cancel", REJECT],
  [0x800000, "Discard", "Discard", DESTRUCTIVE],
  [0x1000000, "Help", "Help", HELP],
  [0x2000000, "Apply", "Apply", APPLY],
  [0x4000000, "Reset", "Reset", RESET],
  [0x8000000, "RestoreDefaults", "Restore Defaults", RESET],
];

// The order the roles stand in, left to right: Qt's for Windows.
const ORDER = [RESET, YES, ACCEPT, DESTRUCTIVE, NO, ACTION, REJECT, APPLY, HELP];

const roleOf = (button) => BUTTONS.find(([flag]) => flag === button)?.[3] ?? INVALID;
const accepts = (role) => role === ACCEPT || role === YES;

const element = (tag, parent) => parent.appendChild(document.createElement(tag));
const written = (value) => (value == null ? "" : String(value));

// The text of a part, which is not there when it has none.
function say(part, text) {
  part.textContent = text;
  part.hidden = text === "";
}

function fill(self, buttons) {
  const message = self.$message;
  const { dialog, menu } = message;
  // The same buttons are left alone: one of them has the focus.
  if (buttons === message.buttons) return;
  message.buttons = buttons;
  // A dialog without a button could not be closed: Qt gives it OK.
  const shown = BUTTONS.filter(([flag]) => buttons & flag);
  if (!shown.length) shown.push(BUTTONS[0]);
  shown.sort((a, b) => ORDER.indexOf(a[3]) - ORDER.indexOf(b[3]));
  menu.replaceChildren();
  let chosen = null;
  for (const [flag, , label, role] of shown) {
    const button = element("button", menu);
    button.type = "button";
    button.textContent = label;
    // Enter presses the first button that accepts.
    if (!chosen && accepts(role)) {
      chosen = button;
      button.autofocus = true;
    }
    button.addEventListener("click", () => {
      self.done(flag);
      untrack(() => self.buttonClicked(flag, role));
    });
  }
  // The focus was on a button that is gone.
  if (dialog.open) (chosen ?? menu.firstChild).focus();
}

export const MessageDialog = defineType("MessageDialog", Dialog, {
  properties: {
    text: "",
    informativeText: "",
    detailedText: "",
    buttons: OK,
  },
  signals: ["buttonClicked"],
  enums: {
    NoButton: 0,
    ...Object.fromEntries(BUTTONS.map(([flag, name]) => [name, flag])),
    InvalidRole: INVALID,
    AcceptRole: ACCEPT,
    RejectRole: REJECT,
    DestructiveRole: DESTRUCTIVE,
    ActionRole: ACTION,
    HelpRole: HELP,
    YesRole: YES,
    NoRole: NO,
    ResetRole: RESET,
    ApplyRole: APPLY,
  },
  methods: {
    // The result is the button pressed: its role says how the dialog ended.
    $code() {
      return accepts(roleOf(this.result)) ? ACCEPTED : REJECTED;
    },
    $present() {
      const { dialog } = this.$message;
      if (dialog.open) return;
      document.body.append(dialog);
      if (this.modality === NON_MODAL) dialog.show();
      else dialog.showModal();
    },
    $dismiss() {
      const { dialog } = this.$message;
      if (dialog.open) dialog.close();
      dialog.remove();
    },
  },
  setup(self) {
    const dialog = document.createElement("dialog");
    dialog.className = "qq-message";
    const title = element("h2", dialog);
    const text = element("p", dialog);
    const more = element("p", dialog);
    const details = element("details", dialog);
    element("summary", details).textContent = "Details";
    const detail = element("pre", details);
    const menu = element("menu", dialog);
    self.$message = { dialog, menu, buttons: null };
    // Escape. The dialog is closed by what the rejection does.
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      self.reject();
    });
    // Closed by the browser all the same.
    dialog.addEventListener("close", () => {
      if (self.$dialog.shown && !dialog.open) self.reject();
    });
    effect(
      () => [self.title, self.text, self.informativeText, self.detailedText].map(written),
      (texts) => {
        say(title, texts[0]);
        say(text, texts[1]);
        say(more, texts[2]);
        detail.textContent = texts[3];
        details.hidden = texts[3] === "";
        dialog.setAttribute("aria-label", texts[0] || texts[1]);
      },
    );
    effect(
      () => Number(self.buttons) || 0,
      (buttons) => fill(self, buttons),
    );
    onCleanup(() => dialog.remove());
  },
});
