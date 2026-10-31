// What the dialogs of QtQuick.Dialogs have in common: being open, and how
// they end. A dialog is no item: what shows it is the browser's own picker
// or `<dialog>`, which the types say how to present and dismiss.
//
// `visible` and `result` are told, not kept in slots: Qt says in a fixed
// order that a dialog closed and how it ended, and a handler finds the
// dialog as it is at that point.
import { onCleanup } from "solid-js";
import { contents, defineType, effect, QtObject, settle } from "../../object.js";
import { signal, untrack } from "#kernel";

const REJECTED = 0;
const ACCEPTED = 1;
const WINDOW_MODAL = 1;

function shows(self) {
  const dialog = self.$dialog;
  if (!dialog.shown) {
    dialog.shown = true;
    // How it ended the last time is forgotten, and nobody told.
    dialog.setResult(REJECTED);
    dialog.setVisible(true);
    settle();
    untrack(() => self.visibleChanged());
  }
  // Also when it was open already: a picker the browser refused, or closed
  // without saying so, is asked for again.
  if (dialog.shown) untrack(() => self.$present());
}

function hides(self) {
  const dialog = self.$dialog;
  if (!dialog.shown) return;
  dialog.shown = false;
  dialog.setVisible(false);
  untrack(() => self.$dismiss());
  settle();
  // Closing says how it ended, whoever closed it.
  untrack(() => {
    self.visibleChanged();
    const code = self.$code();
    if (code === ACCEPTED) self.accepted();
    else if (code === REJECTED) self.rejected();
  });
}

function conclude(self, result) {
  const dialog = self.$dialog;
  if (untrack(dialog.result) === result) return;
  dialog.setResult(result);
  settle();
  untrack(() => self.resultChanged());
}

export const Dialog = defineType("Dialog", QtObject, {
  properties: {
    title: "",
    modality: WINDOW_MODAL,
  },
  signals: ["accepted", "rejected", "visibleChanged", "resultChanged"],
  enums: { Rejected: REJECTED, Accepted: ACCEPTED },
  methods: {
    get visible() {
      return this.$dialog.visible();
    },
    set visible(value) {
      if (value) this.open();
      else this.close();
    },
    get result() {
      return this.$dialog.result();
    },
    set result(value) {
      conclude(this, value);
    },
    open() {
      shows(this);
    },
    close() {
      hides(this);
    },
    accept() {
      this.done(ACCEPTED);
    },
    reject() {
      this.done(REJECTED);
    },
    // Ends the dialog with a result of the caller's. One that is not open
    // keeps the result and says nothing of an ending.
    done(result) {
      conclude(this, result);
      this.close();
    },
    // Whether a result is an acceptance, a rejection, or neither.
    $code() {
      return this.result;
    },
    $present() {},
    $dismiss() {},
  },
  // The objects declared inside a dialog are its data: made, shown nowhere.
  adopt(self, props) {
    self.$dialog.data = contents(props);
  },
  setup(self, props) {
    const [visible, setVisible] = signal(false, self.$owner);
    const [result, setResult] = signal(REJECTED, self.$owner);
    self.$dialog = { shown: false, visible, setVisible, result, setResult, data: [] };
    // `visible: true`, or bound: the same as `open()` and `close()`.
    effect(
      () => props.visible,
      (given) => {
        if (given === undefined) return;
        if (!given) hides(self);
        else if (!self.$dialog.shown) shows(self);
      },
    );
    onCleanup(() => {
      if (!self.$dialog.shown) return;
      self.$dialog.shown = false;
      self.$dismiss();
    });
  },
});
