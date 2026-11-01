// Action: something a program does, whatever is used to do it: a button, a
// menu item, a key. ActionGroup: actions of which one is checked at a time.
import { onCleanup } from "solid-js";
import { contents, defineType, effect, group, inside, QtObject, settle, slot, whenComplete } from "../../object.js";
import { colorValue } from "../color.js";
import { Shortcut } from "../Keys.js";
import { untrack } from "#kernel";

// What an action and a button are drawn with: Qt's `QQuickIcon`.
export const ICON = { name: "", source: "", width: 0, height: 0, color: "transparent", cache: true };

// What an action is given, whatever group it is in: Qt asks this, and not
// `enabled`, before it lets an action do anything.
const able = (self) => untrack(() => Boolean(slot(self, "enabled").own()));

// Qt's `setChecked`: whoever follows the action is told at once. Whether it
// changed.
export function check(self, checked) {
  if (untrack(() => self.checked) === checked) return false;
  slot(self, "checked").write(checked);
  self.$action.checked = checked;
  self.$actionGroup?.$updateCurrent(self);
  return true;
}

// Qt's private `trigger`: a button that toggled itself has the action say
// so without toggling again. Whether it was triggered.
export function trigger(self, source, toggles) {
  if (!able(self)) return false;
  const chosen = self.$actionGroup;
  const kept = untrack(() => self.checked && chosen?.exclusive && chosen.checkedAction === self);
  // The checked action of an exclusive group cannot be unchecked.
  if (untrack(() => self.checkable) && !kept) {
    if (toggles) self.toggle(source);
    else self.toggled(source);
  }
  self.triggered(source);
  return true;
}

// The items that do the action, for its shortcut to say which did.
export function uses(self, item, used) {
  const items = self.$action.items;
  const index = items.indexOf(item);
  if (used && index < 0) items.push(item);
  else if (!used && index >= 0) items.splice(index, 1);
}

export const Action = defineType("Action", QtObject, {
  properties: {
    text: "",
    icon: group(ICON),
    enabled: true,
    checked: false,
    checkable: false,
    shortcut: undefined,
  },
  resolve: {
    icon$color: colorValue,
    enabled: (self, own) => Boolean(own()) && (self.$actionGroup?.enabled ?? true),
  },
  signals: ["toggled", "triggered"],
  methods: {
    toggle(source = null) {
      if (!able(this)) return;
      if (untrack(() => this.checkable)) check(this, !untrack(() => this.checked));
      settle();
      this.toggled(source);
    },
    trigger(source = null) {
      trigger(this, source, true);
    },
  },
  setup(self, props) {
    const mine = (self.$action = { checked: false, items: [] });
    self.$actionGroup = null;
    // `checked` assigned or bound from outside is a change like its own.
    effect(
      () => self.checked,
      (checked) => {
        if (checked === mine.checked) return;
        mine.checked = checked;
        self.$actionGroup?.$updateCurrent(self);
      },
    );
    onCleanup(() => self.$actionGroup?.removeAction(self));
    if (!("shortcut" in props)) return;
    // The key is said to have come from the item that shows the action,
    // when one does.
    const pressed = () => {
      const item = mine.items.find((one) => untrack(() => one.visible));
      self.trigger(item ?? self);
    };
    inside(self, () =>
      Shortcut({
        get sequence() {
          return self.shortcut;
        },
        // What the action was given: its group does not take its key away.
        get enabled() {
          void self.enabled;
          return Boolean(slot(self, "enabled").own());
        },
        onActivated: pressed,
        onActivatedAmbiguously: pressed,
      }),
    );
  },
});

const ActionGroupAttached = defineType("ActionGroupAttached", QtObject, {
  properties: { group: null },
  setup(self, props) {
    const action = props.$attachee;
    let last = null;
    effect(
      () => self.group,
      (chosen) => {
        if (chosen === last) return;
        untrack(() => {
          last?.removeAction(action);
          last = chosen;
          chosen?.addAction(action);
        });
      },
    );
  },
});

// Qt's `setCheckedAction`.
function choose(self, action) {
  const mine = self.$actions;
  if (mine.current === action) return;
  // The old one is unchecked while it is still the group's: it tells the
  // group, which then has nothing to do.
  if (mine.current) check(mine.current, false);
  mine.current = action;
  if (action) check(action, true);
  slot(self, "checkedAction").write(action);
}

export const ActionGroup = defineType("ActionGroup", QtObject, {
  properties: {
    checkedAction: null,
    actions: undefined,
    exclusive: true,
    enabled: true,
  },
  resolve: { actions: (self) => self.$actions.list },
  signals: ["triggered"],
  attached: ActionGroupAttached,
  methods: {
    addAction(action) {
      const mine = this.$actions;
      if (!action?.$action || mine.list.includes(action)) return;
      action.$actionGroup?.removeAction(action);
      action.$actionGroup = this;
      const told = (mine.told ??= new Map());
      const triggered = () => this.triggered(action);
      told.set(action, triggered);
      action.triggered.connect(triggered);
      if (untrack(() => this.exclusive && action.checked)) choose(this, action);
      mine.list = [...mine.list, action];
      // Its `enabled` is the group's too from now on.
      slot(action, "enabled").changed();
      slot(this, "actions").changed();
      settle();
    },
    removeAction(action) {
      const mine = this.$actions;
      if (!action || !mine.list.includes(action)) return;
      action.$actionGroup = null;
      action.triggered.disconnect(mine.told.get(action));
      mine.told.delete(action);
      if (mine.current === action) choose(this, null);
      mine.list = mine.list.filter((one) => one !== action);
      slot(action, "enabled").changed();
      slot(this, "actions").changed();
      settle();
    },
    // An action of the group was checked or unchecked.
    $updateCurrent(action) {
      if (!untrack(() => this.exclusive)) return;
      if (untrack(() => action.checked)) choose(this, action);
      else if (!this.$actions.list.includes(this.$actions.current)) choose(this, null);
    },
  },
  setup(self) {
    const mine = (self.$actions = { list: [], current: null, told: null, given: undefined });
    // `actions: [first, second]`: the list as a whole.
    effect(
      () => (self.actions, slot(self, "actions").own()),
      (given) => {
        if (given === mine.given) return;
        const before = mine.given ?? [];
        mine.given = given;
        const now = given ?? [];
        untrack(() => {
          for (const action of before) if (!now.includes(action)) self.removeAction(action);
          for (const action of now) self.addAction(action);
        });
      },
    );
    // `checkedAction` assigned from outside.
    effect(
      () => self.checkedAction,
      (action) => void untrack(() => choose(self, action ?? null)),
    );
    onCleanup(() => {
      for (const action of mine.list) action.$actionGroup = null;
    });
  },
  // The actions declared in a group are its actions.
  adopt(self, props) {
    const actions = contents(props);
    whenComplete(() => {
      for (const action of actions) self.addAction(action);
    });
  },
});
