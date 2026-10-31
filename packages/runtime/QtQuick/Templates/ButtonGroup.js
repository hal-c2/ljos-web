// ButtonGroup: buttons of which one is checked at a time, wherever they
// are. With `exclusive: false` it only says how many of them are checked.
import { onCleanup } from "solid-js";
import { defineType, effect, QtObject, settle, slot } from "../../object.js";
import { loose, put } from "./Control.js";
import { untrack } from "#kernel";

const ButtonGroupAttached = defineType("ButtonGroupAttached", QtObject, {
  properties: { group: null },
  setup(self, props) {
    const button = props.$attachee;
    let last = null;
    let declared = true;
    effect(
      () => self.group,
      (chosen) => {
        const first = declared;
        declared = false;
        if (chosen === last) return;
        untrack(() => {
          last?.removeButton(button);
          last = chosen;
          // Of the buttons declared checked in a group the first stays so:
          // Qt hears of them last first, and the one it hears of last wins.
          if (first && chosen?.exclusive && chosen.$buttons.current && button.checked) button.$setChecked(false);
          chosen?.addButton(button);
        });
      },
    );
    onCleanup(() => last?.removeButton(button));
  },
});

// Qt's `setCheckedButton`.
function choose(self, button) {
  const mine = self.$buttons;
  if (mine.current === button) return;
  // The old one is unchecked while it is still the group's: it tells the
  // group, which then has nothing to do.
  mine.current?.$setChecked(false);
  mine.current = button;
  button?.$setChecked(true);
  slot(self, "checkedButton").write(button);
}

// None, some or all of them checked.
function updateCheckState(self) {
  const mine = self.$buttons;
  if (mine.setting) return;
  let any = false;
  let all = mine.list.length > 0;
  for (const button of mine.list) {
    const checked = untrack(() => button.checked);
    any ||= checked;
    all &&= checked;
  }
  mine.state = any + all;
  put(self, "checkState", mine.state);
}

// `checkState` assigned: every button of the group is checked, or none.
function setCheckState(self, state) {
  const mine = self.$buttons;
  if (state === 1) return;
  mine.setting = true;
  if (self.exclusive) {
    if (mine.current && state === 0) choose(self, null);
  } else {
    for (const button of mine.list) button.$setChecked(state === 2);
  }
  mine.setting = false;
  mine.state = state;
}

export const ButtonGroup = defineType("ButtonGroup", QtObject, {
  properties: {
    checkedButton: null,
    buttons: undefined,
    exclusive: true,
    checkState: 0,
  },
  resolve: { buttons: (self) => self.$buttons.list },
  signals: ["clicked"],
  attached: ButtonGroupAttached,
  methods: {
    addButton(button) {
      const mine = this.$buttons;
      if (!button?.$button || mine.list.includes(button)) return;
      button.$buttonGroup?.removeButton(button);
      button.$buttonGroup = this;
      const clicked = () => this.clicked(button);
      mine.told.set(button, clicked);
      button.clicked.connect(clicked);
      if (untrack(() => this.exclusive && button.checked)) choose(this, button);
      mine.list = [...mine.list, button];
      updateCheckState(this);
      slot(this, "buttons").changed();
      settle();
    },
    removeButton(button) {
      const mine = this.$buttons;
      if (!button || !mine.list.includes(button)) return;
      button.$buttonGroup = null;
      button.clicked.disconnect(mine.told.get(button));
      mine.told.delete(button);
      if (mine.current === button) choose(this, null);
      mine.list = mine.list.filter((one) => one !== button);
      updateCheckState(this);
      slot(this, "buttons").changed();
      settle();
    },
    // A button of the group was checked or unchecked.
    $updateCurrent(button) {
      const mine = this.$buttons;
      if (untrack(() => this.exclusive)) {
        if (untrack(() => button.checked)) choose(this, button);
        else if (!mine.list.includes(mine.current)) choose(this, null);
      }
      updateCheckState(this);
    },
  },
  setup(self) {
    const mine = (self.$buttons = { list: [], current: null, told: new Map(), given: undefined, setting: false, state: 0 });
    loose(self, "checkState");
    // `buttons: column.children`: the list as a whole. What is no button is
    // left out.
    effect(
      () => (self.buttons, slot(self, "buttons").own()),
      (given) => {
        if (given === mine.given) return;
        const before = mine.given ?? [];
        mine.given = given;
        const now = given ?? [];
        // The same list is read again whenever anything of what it is of
        // changes: only what left it leaves the group.
        untrack(() => {
          for (const button of before) if (!now.includes(button)) self.removeButton(button);
          for (const button of now) self.addButton(button);
        });
      },
    );
    effect(
      () => self.checkedButton,
      (button) => void untrack(() => choose(self, button ?? null)),
    );
    effect(
      () => self.checkState,
      (state) => {
        if (state !== mine.state) untrack(() => setCheckState(self, state));
      },
    );
    onCleanup(() => {
      for (const button of mine.list) button.$buttonGroup = null;
    });
  },
});
