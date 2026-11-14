// LayoutMirroring: an item laid out from the right instead of the left.
//
// Its left anchors become right ones, a positioner or layout runs the other
// way, and text asked to the left is set to the right. `childrenInherit`
// says the same of everything inside the item that does not say otherwise.
import { defineType, QtObject, slot } from "../object.ts";
import { lazy } from "./compute.ts";
import { signal } from "#kernel";
import type { QObject } from "../object.ts";

// What can be mirrored, and what it says of that.
interface Mirrorable extends QObject {
  parent?: Mirrorable | null;
  horizontalAlignment?: number;
  $mirrors?: () => number;
}
type Said = QObject & { childrenInherit: boolean };

// Nearly no program mirrors anything, and then no item has to ask what it
// is in: this says whether an attached object was ever made. Every item
// that can be mirrored reads it, so it changes once and never again.
const [made, setMade] = signal(false);

const next = (version: number): number => version + 1;

const NOT = 0;
const LEFT = 1;
const RIGHT = 2;

// What an item says for itself, when it says anything.
const said = (attached: QObject): boolean | null => {
  const enabled = slot(attached, "enabled")!;
  return enabled.explicit() ? Boolean(enabled.asked()) : null;
};

// What an item says of mirroring, which it may come to say later than it
// was first asked: whoever asked is told when it does.
const says = (item: Mirrorable): Said | undefined => {
  const attached = item.$attached?.LayoutMirroring as Said | undefined;
  if (!attached) item.$track();
  return attached;
};

// What an item tells those inside it: nothing, or which way they run. It
// works that out once for all of them, from what the item it is in tells
// it: what is inside follows the one item, not every item around that.
const told = (item: Mirrorable): number => (item.$mirrors ??= lazy(item, () => tell(item)))();

function tell(item: Mirrorable): number {
  const parent = item.parent;
  const from = parent?.$node ? told(parent) : NOT;
  const attached = says(item);
  if (!attached) return from;
  const inherit = attached.childrenInherit;
  if (from === NOT && !inherit) return NOT;
  const own = inherit ? said(attached) : null;
  return (own ?? from === RIGHT) ? RIGHT : LEFT;
}

// Whether an item is mirrored: by what it says, or else by what it is in.
export function mirrored(item: Mirrorable): boolean {
  if (!made()) return false;
  const attached = says(item);
  const parent = item.parent;
  return (attached && said(attached)) ?? (parent?.$node ? told(parent) === RIGHT : false);
}

// Left and right change sides in a mirrored item, when one was asked for.
export function alignment(item: Mirrorable): number | undefined {
  const asked = item.horizontalAlignment;
  if (!mirrored(item) || !slot(item, "horizontalAlignment")!.explicit()) return asked;
  return asked === 1 ? 2 : asked === 2 ? 1 : asked;
}

const LayoutMirroringAttached = defineType("LayoutMirroringAttached", QtObject, {
  properties: { enabled: false, childrenInherit: false },
  // It reads as what the item is, whoever said so.
  // An attached object always has what it is attached to.
  resolve: { enabled: (self) => mirrored(self.$props.$attachee!) },
  setup(self, props) {
    setMade(true);
    props.$attachee!.$touch(next);
  },
});

export const LayoutMirroring = defineType("LayoutMirroring", QtObject, { attached: LayoutMirroringAttached });
