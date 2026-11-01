// CheckBox: checked, unchecked or, with `tristate`, partially checked.
// RadioButton: one of its siblings is checked.
import { defineType, effect } from "../../object.js";
import { AbstractButton } from "./AbstractButton.js";
import { loose, put } from "./Control.js";
import { untrack } from "#kernel";
import { speaks } from "../Accessible.js";

// Qt's `setCheckState`: `checked` is whether the state is Checked.
function setCheckState(self, state) {
  const mine = self.$button;
  if (!put(self, "checkState", state)) return;
  mine.state = state;
  follow(self, state);
}

function follow(self, state) {
  const mine = self.$button;
  const checked = state === 2;
  if (!put(self, "checked", checked)) return;
  mine.checked = checked;
  self.$buttonGroup?.$updateCurrent(self);
}

// What a check box and a check delegate have in common.
export const checking = {
  properties: {
    checkable: true,
    tristate: false,
    checkState: 0,
    // A function that says which state a click leads to.
    nextCheckState: undefined,
  },
  methods: {
    // Check boxes do not exclude each other.
    $buttonChange(checked) {
      setCheckState(this, checked ? 2 : 0);
    },
    $nextCheckState() {
      const next = untrack(() => this.nextCheckState);
      if (typeof next === "function") setCheckState(this, Math.trunc(Number(untrack(() => next.call(this)))) || 0);
      else if (untrack(() => this.tristate)) setCheckState(this, (untrack(() => this.checkState) + 1) % 3);
      else AbstractButton.proto.$nextCheckState.call(this);
    },
  },
  setup(self) {
    const mine = self.$button;
    mine.state = 0;
    loose(self, "checkState");
    // `checkState` assigned or bound from outside.
    effect(
      () => self.checkState,
      () => {
        const state = untrack(() => self.checkState);
        if (state === mine.state) return;
        mine.state = state;
        untrack(() => follow(self, state));
      },
    );
  },
};

export const CheckBox = defineType("CheckBox", AbstractButton, checking);

export const RadioButton = defineType("RadioButton", AbstractButton, {
  properties: { checkable: true, autoExclusive: true },
});

speaks(CheckBox, "CheckBox", undefined, "checked");
speaks(RadioButton, "RadioButton", undefined, "checked");
