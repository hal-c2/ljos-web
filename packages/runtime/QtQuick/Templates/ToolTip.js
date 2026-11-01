// ToolTip: a popup that says what an item is for. It can wait before it is
// shown (`delay`) and go away of itself (`timeout`).
//
// An item needs none of its own: `ToolTip.text` and `ToolTip.visible` show
// the one tool tip all the items share, made from the style's ToolTip the
// first time it is wanted.
import { onCleanup } from "solid-js";
import { defineType, effect, instantiate, last, onChange, QtObject, slot, whenComplete } from "../../object.js";
import { after, cancel } from "../pointer.js";
import { itemOf, Popup } from "./Popup.js";
import { untrack } from "#kernel";
import { speaks } from "../Accessible.js";

const never = () => false;

// The tool tip the items share, by the component it is made from: the
// ToolTip of the style whose `ToolTip.text` was written.
const tips = new Map();

function shared(self, create) {
  const from = self.$from;
  let tip = tips.get(from);
  if (!tip && create) tips.set(from, (tip = instantiate(from, {}, null, null).object));
  return tip;
}

// Whether the shared tool tip is shown, and for this item.
const showing = (self) => {
  const tip = shared(self, false);
  return tip ? untrack(() => tip.visible && tip.parent === self.$for) : false;
};

// The component whose `attached` is being asked for.
let asking = null;

const ToolTipAttached = defineType("ToolTipAttached", QtObject, {
  properties: {
    text: "",
    delay: 0,
    timeout: -1,
    visible: false,
  },
  // Qt tells of `visible` when the tool tip comes and goes, and only the
  // item it is over then.
  resolve: { visible: showing },
  methods: {
    get toolTip() {
      return shared(this, true);
    },
    show(text, ms = -1) {
      const tip = shared(this, true);
      const item = this.$for;
      untrack(() => {
        slot(tip, "width").reset();
        slot(tip, "height").reset();
        tip.parent = item.$node ? item : null;
        tip.delay = this.delay;
        tip.timeout = ms >= 0 ? ms : this.timeout;
        tip.show(text);
      });
    },
    hide() {
      const tip = shared(this, false);
      // Another item's is not closed by one that never showed it.
      if (tip && untrack(() => tip.parent) === this.$for) tip.close();
    },
  },
  setup(self, props) {
    self.$for = props.$attachee;
    self.$from = asking;
    self.$told = false;
    // `visible` is heard of when the tool tip says so, and not when
    // something else of this object changes.
    whenComplete(() => slot(self, "visible").changed());
    if (!self.$for.$node) console.warn("ToolTip attached property must be attached to an object deriving from Item");
    // What is said here while the tool tip is this item's, it is told.
    for (const name of ["text", "delay", "timeout"]) {
      onChange(self, name, () =>
        untrack(() => {
          if (self.visible) shared(self, true)[name] = self[name];
        }),
      );
    }
    if (!("visible" in props)) return;
    // A binding shows and hides it as an assignment does.
    let was = false;
    effect(
      () => Boolean(slot(self, "visible").asked()),
      (wanted) => {
        if (wanted === was) return;
        was = wanted;
        last(() => untrack(() => (wanted ? self.show(self.text) : self.hide())));
      },
    );
  },
});

Object.defineProperty(ToolTipAttached.proto, "visible", {
  ...Object.getOwnPropertyDescriptor(ToolTipAttached.proto, "visible"),
  set(value) {
    untrack(() => (value ? this.show(this.text) : this.hide()));
  },
});

const open = (self, shown) => Popup.proto.$show.call(self, shown);

function startTimeout(self) {
  const waits = self.$waits;
  const timeout = untrack(() => self.timeout);
  if (timeout > 0) waits.timeout = after(timeout, () => open(self, false), waits.timeout ?? undefined);
}

export const ToolTip = defineType("ToolTip", Popup, {
  properties: {
    text: "",
    delay: 0,
    timeout: -1,
  },
  methods: {
    // What does not fit over its item is shown under it.
    $flipX: true,
    $flipY: true,
    $relax: false,
    show(text, ms = -1) {
      if (ms >= 0) this.timeout = ms;
      this.text = String(text);
      this.open();
    },
    hide() {
      this.close();
    },
    $show(shown) {
      const waits = this.$waits;
      if (!shown) cancel(waits.delay);
      else if (!this.$pop.visible) {
        const delay = untrack(() => this.delay);
        if (delay > 0) {
          waits.delay = after(delay, () => open(this, true), waits.delay ?? undefined);
          return;
        }
      }
      open(this, shown);
    },
    $came() {
      startTimeout(this);
    },
    $appeared(shown) {
      if (!shown) cancel(this.$waits.timeout);
      // The item it is over says that its tool tip is seen, or no more.
      const attached = untrack(() => this.parent)?.$attached?.ToolTip;
      if (!attached) return;
      // It was told last when the tool tip was another item's, perhaps, and
      // Qt tells it again of what it knows.
      const seen = showing(attached);
      slot(attached, "visible").changed();
      if (seen === attached.$told) attached.visibleChanged();
      attached.$told = seen;
    },
  },
  setup(self) {
    const waits = (self.$waits = { delay: null, timeout: null });
    onChange(self, "timeout", () =>
      untrack(() => {
        if (self.timeout <= 0) cancel(waits.timeout);
        else if (self.opened) startTimeout(self);
      }),
    );
    onCleanup(() => {
      cancel(waits.delay);
      cancel(waits.timeout);
    });
  },
  attached: ToolTipAttached,
});

// The mouse goes through a tool tip to what is under it.
itemOf(ToolTip, { properties: { hoverEnabled: false }, methods: { $hovers: never } });

// The attached object is asked for through a style's ToolTip, which says
// what the shared tool tip is made from.
const attachedTo = ToolTip.attached;
ToolTip.attached = function (self) {
  const before = asking;
  asking = typeof this === "function" && this.proto ? this : ToolTip;
  try {
    return attachedTo(self);
  } finally {
    asking = before;
  }
};

speaks(ToolTip, "ToolTip");
