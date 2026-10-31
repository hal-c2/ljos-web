// DelayButton: checked by being held for long enough. `progress` goes from
// 0 to 1 while it is held, as the `transition` a style gives it says.
import { onCleanup } from "solid-js";
import { defineType, settle } from "../../object.js";
import { Property } from "../animation/property.js";
import { AbstractButton } from "./AbstractButton.js";
import { put } from "./Control.js";
import { untrack } from "#kernel";

const full = (self) => Math.abs(untrack(() => self.progress) - 1) < 1e-12;

function cancelTransition(self) {
  const mine = self.$button;
  const job = mine.job;
  if (!job) return;
  mine.job = null;
  job.listener = null;
  job.stop();
  mine.transition.$ran(false);
}

// `progress` is taken to 1 or back to 0. Held to the end, it is activated.
function beginTransition(self, to) {
  const mine = self.$button;
  const transition = untrack(() => self.transition);
  cancelTransition(self);
  if (!transition) {
    put(self, "progress", to);
    settle();
    if (full(self)) self.activated();
    return;
  }
  const action = (mine.change ??= { property: new Property(self, "progress"), from: 0, to: 0, shown: false });
  action.from = untrack(() => self.progress);
  action.to = to;
  const modified = [];
  const job = transition.$prepare([action], modified, false);
  job.listener = {
    finished() {
      if (mine.job !== job) return;
      mine.job = null;
      transition.$ran(false);
      settle();
      if (full(self)) self.activated();
    },
  };
  mine.job = job;
  mine.transition = transition;
  transition.$ran(true);
  job.start();
  // What no animation of the transition took is there at once.
  if (mine.job === job && !modified.includes(action)) put(self, "progress", to);
}

export const DelayButton = defineType("DelayButton", AbstractButton, {
  properties: {
    checkable: true,
    delay: 300,
    progress: 0,
    transition: null,
  },
  signals: ["activated"],
  methods: {
    $buttonChange(checked) {
      cancelTransition(this);
      put(this, "progress", checked ? 1 : 0);
    },
    $pressedChange(pressed) {
      if (untrack(() => this.checked)) return;
      // The transition asks how long it takes, and that depends on whether
      // the button is pressed.
      settle();
      beginTransition(this, pressed ? 1 : 0);
    },
    // A click checks it only when it was held to the end, and unchecks it
    // otherwise.
    $nextCheckState() {
      this.$setChecked(!untrack(() => this.checked) && full(this));
    },
  },
  setup(self) {
    const mine = self.$button;
    mine.job = null;
    mine.transition = null;
    mine.change = null;
    onCleanup(() => cancelTransition(self));
  },
});
