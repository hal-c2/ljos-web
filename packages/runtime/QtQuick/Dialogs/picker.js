// The browser's own pickers, for the dialogs that are one.
//
// A browser opens a picker only while the user is doing something with the
// page. A dialog opened at any other time stays open, as QML sees it, and
// its picker comes up at the user's next press or key.
import { onCleanup } from "solid-js";
import { atNextGesture } from "../activation.ts";

// How a browser says that it will not open a picker now: no gesture, or
// another picker is open.
const REFUSED = new Set(["SecurityError", "NotAllowedError"]);

// Opens the picker of an `<input>`, and throws where the browser refuses.
export function reveal(input) {
  if (typeof input.showPicker === "function") return input.showPicker();
  // Before `showPicker` there was the click, which says nothing of a refusal.
  input.click();
}

// An input that is on the page for its picker only.
export function field(type) {
  const input = document.createElement("input");
  input.type = type;
  input.tabIndex = -1;
  input.setAttribute("aria-hidden", "true");
  input.style.cssText =
    "position: fixed; left: 50%; top: 50%; width: 0; height: 0; margin: 0; padding: 0; border: 0; opacity: 0; pointer-events: none;";
  document.body.append(input);
  return input;
}

// The file picker of a dialog. `spec` says what is particular to it:
// - `ask()`: the File System Access picker, as a promise of what was
//   picked, or nothing where there is none;
// - `prepare(input)`: the same wishes put to an `<input type="file">`, and
//   `read(files)`: what that picked;
// - `took(picked)`: what the dialog does with it.
// Nothing picked, by either, is the dialog rejected.
export function picker(self, spec) {
  let open = false;
  let wait = null;
  let input = null;
  const shown = () => self.$dialog.shown;

  // The picker cannot be taken back once it is open: what it answers after
  // the dialog was closed is dropped.
  function answer(picked) {
    if (!shown()) return;
    if (!picked || picked.length === 0) self.reject();
    else spec.took(picked);
  }

  function later() {
    wait = atNextGesture(() => {
      wait = null;
      if (shown()) present();
    });
  }

  function present() {
    dismiss();
    if (open) return;
    const asked = spec.ask();
    if (asked) {
      open = true;
      asked.then(
        (picked) => {
          open = false;
          answer(picked);
        },
        (error) => {
          open = false;
          if (!shown()) return;
          if (REFUSED.has(error?.name)) later();
          // The user closed it, or it cannot be shown at all.
          else self.reject();
        },
      );
      return;
    }
    if (!input) {
      input = field("file");
      input.addEventListener("change", () => answer(spec.read([...input.files])));
      input.addEventListener("cancel", () => answer(null));
    }
    spec.prepare(input);
    // The same file again is a choice too.
    input.value = "";
    try {
      reveal(input);
    } catch {
      later();
    }
  }

  function dismiss() {
    wait?.();
    wait = null;
  }

  onCleanup(() => {
    dismiss();
    input?.remove();
  });
  return { present, dismiss };
}
