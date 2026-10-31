// DialogButtonBox: the buttons of a dialog, in the order the platform has
// them. It makes one from its `delegate` for each of its `standardButtons`,
// shares its width among them, and says what a click on one means by the
// role of the button: `accepted`, `rejected`, `applied` and so on.
import { defineType, derived, effect, instantiate, last, onChange, QtObject, settle, slot, whenComplete } from "../../object.js";
import { setFocus } from "../focus.js";
import { AbstractButton } from "./AbstractButton.js";
import { Button } from "./Button.js";
import { containerOf, Container } from "./Container.js";
import { untrack } from "#kernel";

const InvalidRole = -1;
const AcceptRole = 0;
const RejectRole = 1;
const DestructiveRole = 2;
const ActionRole = 3;
const HelpRole = 4;
const YesRole = 5;
const NoRole = 6;
const ResetRole = 7;
const ApplyRole = 8;

// The standard buttons in the order a box makes them: what each is called,
// what it says, and what it is for. The texts are Qt's own, which a platform
// may change.
const STANDARD = [
  [0x400, "Ok", "OK", AcceptRole],
  [0x800, "Save", "Save", AcceptRole],
  [0x1000, "SaveAll", "Save All", AcceptRole],
  [0x2000, "Open", "Open", AcceptRole],
  [0x4000, "Yes", "Yes", YesRole],
  [0x8000, "YesToAll", "Yes to All", YesRole],
  [0x10000, "No", "No", NoRole],
  [0x20000, "NoToAll", "No to All", NoRole],
  [0x40000, "Abort", "Abort", RejectRole],
  [0x80000, "Retry", "Retry", AcceptRole],
  [0x100000, "Ignore", "Ignore", AcceptRole],
  [0x200000, "Close", "Close", RejectRole],
  [0x400000, "Cancel", "Cancel", RejectRole],
  [0x800000, "Discard", "Discard", DestructiveRole],
  [0x1000000, "Help", "Help", HelpRole],
  [0x2000000, "Apply", "Apply", ApplyRole],
  [0x4000000, "Reset", "Reset", ResetRole],
  [0x8000000, "RestoreDefaults", "Restore Defaults", ResetRole],
];

// `Dialog.Ok` and the like, which a dialog has too.
export const standardButtons = { NoButton: 0, ...Object.fromEntries(STANDARD.map(([flag, name]) => [name, flag])) };

// The order of the roles, by `buttonLayout`: Windows', macOS', KDE's,
// GNOME's and Android's.
const LAYOUTS = [
  [ResetRole, YesRole, AcceptRole, DestructiveRole, NoRole, ActionRole, RejectRole, ApplyRole, HelpRole],
  [HelpRole, ResetRole, ApplyRole, ActionRole, DestructiveRole, RejectRole, AcceptRole, NoRole, YesRole],
  [HelpRole, ResetRole, YesRole, NoRole, ActionRole, AcceptRole, ApplyRole, DestructiveRole, RejectRole],
  [HelpRole, ResetRole, ActionRole, ApplyRole, DestructiveRole, RejectRole, AcceptRole, NoRole, YesRole],
  [HelpRole, ResetRole, ApplyRole, ActionRole, RejectRole, NoRole, DestructiveRole, AcceptRole, YesRole],
];

const AlignRight = 2;
const AlignHCenter = 4;
const AlignAbsolute = 16;
const AlignHorizontal = 31;
const AlignBottom = 64;
const AlignVCenter = 128;
const AlignVertical = 480;

const nothing = () => {};
const isa = (item, Type) => item?.$type?.chain.includes(Type) === true;

// What is attached to a button: made when first asked for, so that what
// asks before anything else has is told of the role the button was given.
const attachedTo = (button) => DialogButtonBox.attached(button);

// The role of a button, which says what a click on it means; a dialog asks
// too.
export const roleOf = (button) => attachedTo(button)?.buttonRole ?? InvalidRole;

// The standard button it was made for.
const flagOf = (button) => attachedTo(button)?.$standard ?? 0;

const DialogButtonBoxAttached = defineType("DialogButtonBoxAttached", QtObject, {
  properties: {
    buttonBox: derived((self) => {
      const box = containerOf(self.$of);
      return isa(box, DialogButtonBox) ? box : null;
    }),
    buttonRole: InvalidRole,
  },
  setup(self, props) {
    self.$of = props.$attachee;
    self.$standard = 0;
    // A button declared in a box is put in it once it is made, and Qt tells
    // of that.
    whenComplete(() => {
      if (untrack(() => self.buttonBox)) self.buttonBoxChanged();
    });
  },
});

// Whether the role `first` comes before `second`: one with no role is after
// all the others, and those of one role stay as they were.
function before(layout, first, second) {
  if (first === second) return false;
  if (first !== InvalidRole && second !== InvalidRole) {
    for (const role of layout) {
      if (role === first) return true;
      if (role === second) return false;
    }
  }
  return first !== InvalidRole;
}

function ordered(self, buttons) {
  const layout = LAYOUTS[self.buttonLayout] ?? LAYOUTS[0];
  const roles = new Map(buttons.map((button) => [button, roleOf(button)]));
  return buttons.slice().sort((a, b) => {
    const first = roles.get(a);
    const second = roles.get(b);
    return before(layout, first, second) ? -1 : before(layout, second, first) ? 1 : 0;
  });
}

// Qt's `setStandardButtons`: the ones it made go, and one is made for each
// of the new ones, before anything hears that they changed.
function remake(self, buttons) {
  const state = self.$box;
  const objects = self.$model.$objects;
  for (let index = objects.length - 1; index >= 0; index--) {
    const button = objects[index];
    const dispose = state.made.get(button);
    if (!dispose) continue;
    self.removeItem(button);
    state.made.delete(button);
    dispose();
  }
  const delegate = self.delegate;
  if (typeof delegate === "function") {
    for (const [flag, , text, role] of STANDARD) {
      if (!(buttons & flag)) continue;
      const made = instantiate(delegate, {}, null, self.$owner);
      const button = made.object;
      if (!isa(button, AbstractButton)) {
        made.dispose();
        continue;
      }
      const attached = DialogButtonBox.attached(button);
      attached.$standard = flag;
      attached.buttonRole = role;
      button.text = text;
      state.made.set(button, made.dispose);
      self.addItem(button);
    }
  }
  state.standard = buttons;
  slot(self, "standardButtons").changed();
}

function standard(self, wanted) {
  const state = self.$box;
  const buttons = Number(wanted) || 0;
  if (state.wanted === buttons) return;
  state.wanted = buttons;
  // What hears of a button may ask for others: the one making them goes on
  // to those.
  if (state.making) return;
  state.making = true;
  try {
    while (state.standard !== state.wanted) remake(self, state.wanted);
  } finally {
    state.making = false;
  }
  settle();
}

// Qt's `setDefaultButton`: the default button is one of the box's, and the
// one before it is no more.
function defaulted(self, wanted) {
  const state = self.$box;
  const button = isa(wanted, AbstractButton) ? wanted : null;
  if (state.defaultButton === button) return;
  if (state.defaultButton) self.removeItem(state.defaultButton);
  state.defaultButton = button;
  if (button) self.addItem(button);
  slot(self, "defaultButton").changed();
  settle();
}

// The properties whose setter does its work at once, as Qt's does.
const WORKED = { standardButtons: standard, defaultButton: defaulted };

function click(self, button) {
  // The role it had when it was clicked: what hears of the click may change
  // it.
  const role = roleOf(button);
  self.clicked(button);
  if (role === AcceptRole || role === YesRole) self.accepted();
  else if (role === RejectRole || role === NoRole) self.rejected();
  else if (role === ApplyRole) self.applied();
  else if (role === ResetRole) self.reset();
  else if (role === DestructiveRole) self.discarded();
  else if (role === HelpRole) self.helpRequested();
}

export const DialogButtonBox = defineType("DialogButtonBox", Container, {
  properties: {
    position: 1,
    alignment: 0,
    standardButtons: 0,
    defaultStandardButton: 0,
    defaultButton: null,
    delegate: null,
    buttonLayout: 0,
    // What its buttons would like, whatever `contentWidth` is said to be: a
    // box as wide as the view its buttons are in grows with its buttons.
    implicitContentWidth: derived((self) => self.$contentWidth()),
    implicitContentHeight: derived((self) => self.$contentHeight()),
  },
  resolve: {
    // `undefined` is no alignment, and the platform's layout.
    alignment: (self, own) => own() ?? 0,
    buttonLayout: (self, own) => own() ?? 0,
    standardButtons: (self) => self.$box.standard,
    defaultButton: (self) => self.$box.defaultButton,
  },
  signals: ["accepted", "rejected", "helpRequested", "clicked", "applied", "reset", "discarded"],
  enums: {
    ...standardButtons,
    InvalidRole,
    AcceptRole,
    RejectRole,
    DestructiveRole,
    ActionRole,
    HelpRole,
    YesRole,
    NoRole,
    ResetRole,
    ApplyRole,
    UnknownLayout: -1,
    WinLayout: 0,
    MacLayout: 1,
    KdeLayout: 2,
    GnomeLayout: 3,
    AndroidLayout: 4,
    Header: 0,
    Footer: 1,
  },
  attached: DialogButtonBoxAttached,
  methods: {
    $focusScope: true,
    $isContent(item) {
      return isa(item, AbstractButton);
    },
    // As wide as its buttons side by side: all as wide as the widest, when
    // they are to share the width.
    $contentWidth() {
      const buttons = this.contentChildren;
      const spacing = Math.max(0, buttons.length - 1) * this.spacing;
      let total = spacing;
      let widest = 0;
      for (const button of buttons) {
        total += button.implicitWidth;
        widest = Math.max(widest, button.implicitWidth);
      }
      return this.alignment & AlignHorizontal ? total : Math.max(total, buttons.length * widest + spacing);
    },
    $contentHeight() {
      let height = 0;
      for (const button of this.contentChildren) height = Math.max(height, button.implicitHeight);
      return height;
    },
    // The buttons fill what is inside the padding, or with an alignment are
    // as big as they like, at that side of it.
    $inside() {
      let x = this.leftPadding;
      let y = this.topPadding;
      let width = this.width - x - this.rightPadding;
      let height = this.height - y - this.bottomPadding;
      let alignment = this.alignment;
      if (!alignment) return [x, y, width, height];
      // Left is right where the box is mirrored.
      if (this.mirrored && !(alignment & AlignAbsolute) && !(alignment & AlignHCenter)) alignment ^= AlignRight;
      const wide = this.contentWidth;
      const high = this.contentHeight;
      if (alignment & AlignVCenter || !(alignment & AlignVertical)) y += Math.max(0, (height - high) / 2);
      else if (alignment & AlignBottom) y += Math.max(0, height - high);
      if (alignment & AlignRight) x += Math.max(0, width - wide);
      else if (alignment & AlignHCenter) x += Math.max(0, (width - wide) / 2);
      return [x, y, wide, high];
    },
    standardButton(button) {
      if (!(this.standardButtons & button)) return null;
      return this.contentChildren.find((item) => flagOf(item) === button) ?? null;
    },
  },
  setup(self, props) {
    const state = (self.$box = { standard: 0, wanted: 0, making: false, defaultButton: null, made: new Map() });
    for (const [name, work] of Object.entries(WORKED)) {
      const asked = () => slot(self, name).asked();
      // What it was made with is done once everything is there to hear of
      // it, and before `Component.onCompleted`.
      onChange(self, name, nothing, (value, firsts) => {
        slot(self, name).changed();
        if (!(name in props)) return;
        const first = () => work(self, untrack(asked));
        if (firsts) firsts.push(first);
        else first();
      });
      // A binding does what an assignment does, when what it gives changes:
      // it is asked again when the work is done, and gives the same.
      let had;
      if (name in props) {
        effect(asked, (value) => {
          if (Object.is(value, had)) return;
          had = value;
          last(() => untrack(() => work(self, value)));
        });
      }
    }
    // A click on a button is the box's to tell of.
    const heard = new Map();
    effect(
      () => self.contentChildren,
      (buttons) => {
        for (const [button, told] of heard) {
          if (buttons.includes(button)) continue;
          button.clicked.disconnect(told);
          heard.delete(button);
        }
        for (const button of buttons) {
          if (heard.has(button)) continue;
          const told = () => click(self, button);
          heard.set(button, told);
          button.clicked.connect(told);
        }
      },
    );
    // The platform's order.
    effect(
      () => {
        const buttons = self.contentChildren;
        const sorted = ordered(self, buttons);
        return sorted.some((button, index) => button !== buttons[index]) ? sorted : null;
      },
      (sorted) => {
        if (!sorted) return;
        untrack(() => {
          const objects = self.$model.$objects;
          sorted = ordered(self, objects);
          for (let index = 0; index < sorted.length - 1; index++) {
            if (objects[index] !== sorted[index]) self.insertItem(index, sorted[index]);
          }
        });
      },
    );
    // The buttons that say no width share what there is, and are as high as
    // the highest; with an alignment each is as big as it likes. What there
    // is may come of how wide they are, in a box as wide as the view its
    // buttons are in: so a button is as wide as its share is when it is
    // asked, and the two agree whichever is asked first.
    const share = () => {
      const count = self.count;
      return (self.availableWidth - (count - 1) * self.spacing) / count;
    };
    const sized = new Set();
    effect(
      () => self.contentChildren,
      (buttons) => {
        for (const button of sized) {
          if (buttons.includes(button)) continue;
          sized.delete(button);
          slot(button, "width").place(undefined);
          slot(button, "height").place(undefined);
        }
        for (const button of buttons) {
          if (sized.has(button)) continue;
          sized.add(button);
          const width = slot(button, "width");
          const free = (alignment) => (self.alignment & alignment) !== 0 || width.explicit();
          width.place(() => (free(AlignHorizontal) ? undefined : share()));
          slot(button, "height").place(() => (free(AlignVertical) ? undefined : self.contentHeight));
        }
      },
    );
    // Focus is the default button's, else the first that accepts; the
    // default one is highlighted. It is given when the buttons are others
    // and when the box comes to be seen, and left where it went since when
    // the box goes.
    let before = [];
    effect(
      () => {
        const buttons = self.contentChildren;
        if (!buttons.length) return null;
        const button = self.defaultButton;
        const flag = self.defaultStandardButton;
        let index = buttons.findIndex((one) => isa(one, Button) && (one === button || (flag !== 0 && flagOf(one) === flag)));
        const lit = buttons[index] ?? null;
        if (index < 0) index = buttons.findIndex((one) => roleOf(one) === AcceptRole);
        return [self.contentItem, self.visible, index, lit, ...buttons];
      },
      (focus) => {
        const was = before;
        before = focus ?? [];
        if (!focus) return;
        const same = focus.length === was.length && focus.every((value, at) => at === 1 || value === was[at]);
        if (same && !(focus[1] && !was[1])) return;
        const [view, , index, lit, ...buttons] = focus;
        untrack(() => {
          // A view has a current item, and focus of its own to give.
          if (view?.$v !== undefined) {
            if (view.currentIndex !== index) view.currentIndex = index;
            if (view.$focusScope) setFocus(view, index >= 0);
          }
          buttons.forEach((button, at) => {
            if (!isa(button, Button)) return;
            setFocus(button, at === index);
            if (button.highlighted !== (button === lit)) button.highlighted = button === lit;
          });
        });
      },
    );
  },
});

for (const [name, work] of Object.entries(WORKED)) {
  Object.defineProperty(DialogButtonBox.proto, name, {
    ...Object.getOwnPropertyDescriptor(DialogButtonBox.proto, name),
    set(value) {
      untrack(() => work(this, value));
    },
  });
}
