// Dialog: a popup with a title, a header over what it has and a footer
// under it, which is accepted or rejected.
//
// A DialogButtonBox that is its header or its footer is the dialog's: it
// has the dialog's standard buttons, and a click on one of them accepts the
// dialog, rejects it, or says what else is wanted of it.
import { defineType, effect, last, onChange, settle, slot, whenComplete } from "../../object.js";
import { OtherFocusReason, setFocus } from "../focus.js";
import { DialogButtonBox, roleOf, standardButtons } from "./DialogButtonBox.js";
import { forward, forwarded, Popup } from "./Popup.js";
import { untrack } from "#kernel";

const Rejected = 0;
const Accepted = 1;

// What of a dialog is its item's, a page.
const PAGE = ["title", "header", "footer", "implicitHeaderWidth", "implicitHeaderHeight", "implicitFooterWidth", "implicitFooterHeight"];
const BANDS = ["header", "footer"];

const isBox = (item) => item?.$type?.chain.includes(DialogButtonBox) === true;

// What a click on a button that neither accepts nor rejects asks for.
function clicked(self, button) {
  const role = roleOf(button);
  if (role === DialogButtonBox.ApplyRole) self.applied();
  else if (role === DialogButtonBox.ResetRole) self.reset();
  else if (role === DialogButtonBox.HelpRole) self.helpRequested();
  else if (role === DialogButtonBox.DestructiveRole) {
    self.discarded();
    self.close();
  }
}

// The header or the footer is another item. A box that was it is the
// dialog's no more, and one that is it now is: the box set last is the one
// that has the dialog's buttons. A box says which buttons it has itself
// only as the dialog is made (`made`).
function band(self, name, item, made) {
  const bands = self.$bands;
  const before = bands[name];
  if (before === item) return;
  bands[name] = item;
  // Each is as wide as the dialog whenever it is asked: a dialog may be as
  // wide as its footer would like to be, and the two agree.
  if (before) slot(before, "width").place(undefined);
  if (item) slot(item, "width").place(() => self.$item.width);
  if (isBox(before)) {
    for (const [signal, handler] of bands.heard) before[signal].disconnect(handler);
    if (bands.box === before) bands.box = null;
  }
  if (!isBox(item)) return;
  for (const [signal, handler] of bands.heard) item[signal].connect(handler);
  bands.box = item;
  if (!made || !slot(item, "standardButtons").explicit()) item.standardButtons = self.standardButtons;
  if (!made || !slot(item, "position").explicit()) item.position = name === "header" ? DialogButtonBox.Header : DialogButtonBox.Footer;
}

export const Dialog = defineType("Dialog", Popup, {
  properties: {
    ...forwarded(PAGE),
    standardButtons: 0,
    result: Rejected,
    // A dialog has the keys once it is open, so that Escape closes it.
    focus: true,
  },
  signals: ["accepted", "rejected", "applied", "reset", "discarded", "helpRequested"],
  enums: { Rejected, Accepted, ...standardButtons },
  methods: {
    $relax: false,
    accept() {
      this.done(Accepted);
    },
    reject() {
      this.done(Rejected);
    },
    done(result) {
      this.result = result;
      settle();
      if (result === Accepted) this.accepted();
      else if (result === Rejected) this.rejected();
      this.close();
    },
    standardButton(button) {
      return this.$bands.box?.standardButton(button) ?? null;
    },
    // Escape and a press outside reject it.
    $dismiss() {
      this.reject();
    },
    // The box has the keys as the dialog comes, unless something in the
    // dialog had them: its first button takes Space.
    $appeared(shown) {
      const box = this.$bands.box;
      if (!shown || !box || this.$item.$subFocus) return;
      if (untrack(() => box.contentChildren.some((item) => item.enabled))) setFocus(box, true, OtherFocusReason);
    },
  },
  setup(self, props) {
    const bands = (self.$bands = {
      header: null,
      footer: null,
      box: null,
      heard: [
        ["accepted", () => self.accept()],
        ["rejected", () => self.reject()],
        ["clicked", (button) => clicked(self, button)],
      ],
    });
    // Qt sets what was declared last first: of two boxes, the first one
    // declared is the dialog's.
    whenComplete(() =>
      untrack(() => {
        const names = Object.keys(props).filter((name) => BANDS.includes(name));
        for (const name of names.reverse()) band(self, name, self[name] ?? null, true);
      }),
    );
    effect(
      () => [self.header ?? null, self.footer ?? null],
      (items) => {
        if (items[0] === bands.header && items[1] === bands.footer) return;
        last(() => untrack(() => BANDS.forEach((name, index) => band(self, name, items[index], false))));
      },
    );
    onChange(self, "standardButtons", () =>
      untrack(() => {
        if (bands.box) bands.box.standardButtons = self.standardButtons;
      }),
    );
  },
});

forward(Dialog, PAGE);

// What is assigned is done at once: the box has its buttons when the
// assignment returns, and the dialog tells of its own after the box has.
for (const name of BANDS) {
  const { get } = Object.getOwnPropertyDescriptor(Dialog.proto, name);
  Object.defineProperty(Dialog.proto, name, {
    get,
    set(value) {
      this.$item[name] = value;
      untrack(() => band(this, name, this.$item[name] ?? null, false));
    },
    enumerable: true,
    configurable: true,
  });
}

const buttons = Object.getOwnPropertyDescriptor(Dialog.proto, "standardButtons");
Object.defineProperty(Dialog.proto, "standardButtons", {
  ...buttons,
  set(value) {
    const box = this.$bands.box;
    if (box && untrack(() => this.standardButtons) !== value) box.standardButtons = value;
    buttons.set.call(this, value);
  },
});
