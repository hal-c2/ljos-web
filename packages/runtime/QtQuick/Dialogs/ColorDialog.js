// ColorDialog: the browser's colour picker, which is that of an
// `<input type="color">`.
//
// The input tells of every colour the user tries and of the one the picker
// was closed on, which is the dialog accepted. It says nothing when the
// picker is closed on the colour it opened with: the dialog learns of that
// from the user's next press on the page, which the picker was over.
import { onCleanup } from "solid-js";
import { defineType, effect, settle, slot } from "../../object.ts";
import { atNextGesture } from "../activation.ts";
import { colorValue } from "../color.ts";
import { Dialog } from "./Dialog.js";
import { field, reveal } from "./picker.js";

const CAPTURE = { capture: true };

// A colour as the input takes it: no alpha.
function hex(value) {
  const text = String(value);
  return text.length === 9 ? `#${text.slice(3)}` : text;
}

function watch(self, on) {
  const picker = self.$picker;
  if (picker.watching === on) return;
  picker.watching = on;
  for (const type of ["pointerdown", "keydown"]) {
    if (on) window.addEventListener(type, picker.closed, CAPTURE);
    else window.removeEventListener(type, picker.closed, CAPTURE);
  }
}

// The input, made when the dialog is first opened.
function made(self) {
  const picker = self.$picker;
  const input = (picker.input = field("color"));
  input.addEventListener("input", () => {
    if (self.$dialog.shown) take(self);
  });
  input.addEventListener("change", () => {
    if (!self.$dialog.shown) return;
    take(self);
    self.accept();
  });
  return input;
}

function take(self) {
  slot(self, "selectedColor").write(self.$picker.input.value);
  settle();
}

export const ColorDialog = defineType("ColorDialog", Dialog, {
  properties: { selectedColor: "#ffffff" },
  resolve: { selectedColor: colorValue },
  methods: {
    $present() {
      const picker = this.$picker;
      this.$dismiss();
      const input = picker.input ?? made(this);
      input.value = hex(this.selectedColor);
      picker.from = input.value;
      try {
        reveal(input);
      } catch {
        // Refused until the user does something.
        picker.wait = atNextGesture(() => {
          picker.wait = null;
          if (this.$dialog.shown) this.$present();
        });
        return;
      }
      watch(this, true);
    },
    $dismiss() {
      const picker = this.$picker;
      picker.wait?.();
      picker.wait = null;
      watch(this, false);
    },
  },
  setup(self) {
    const picker = (self.$picker = {
      input: null,
      wait: null,
      // The colour the picker opened with.
      from: "",
      watching: false,
      // A press or a key that reaches the page: the picker is gone.
      closed(event) {
        if (event.repeat) return;
        if (picker.input.value === picker.from) return self.reject();
        take(self);
        self.accept();
      },
    });
    // A colour assigned while the picker is open is the one it shows.
    effect(
      () => hex(self.selectedColor),
      (value) => {
        if (picker.input && picker.input.value !== value) picker.input.value = value;
      },
    );
    onCleanup(() => {
      self.$dismiss();
      picker.input?.remove();
    });
  },
});
