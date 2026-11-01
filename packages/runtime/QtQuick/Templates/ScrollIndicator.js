// ScrollIndicator: a handle that shows where a Flickable is in its content,
// and that nothing can be done to.
import { defineType, QtObject } from "../../object.js";
import { Control } from "./Control.js";
import { drive } from "./driven.js";
import { assignables, follows, inside, properties, resolve, setup } from "./scrolling.js";
import { speaks } from "../Accessible.js";

// It shows while the Flickable moves.
const moves = (indicator, moving) => drive(indicator, "active", moving);

const ScrollIndicatorAttached = defineType("ScrollIndicatorAttached", QtObject, {
  properties: { horizontal: null, vertical: null },
  setup(self, props) {
    const of = (self.$of = props.$attachee);
    if (!of.$viewport) {
      return console.warn("ScrollIndicator attached property must be attached to an object deriving from Flickable");
    }
    const flickable = () => of;
    follows(self, "horizontal", flickable, moves, true);
    follows(self, "vertical", flickable, moves, true);
  },
});

export const ScrollIndicator = defineType("ScrollIndicator", Control, {
  properties,
  resolve,
  attached: ScrollIndicatorAttached,
  methods: { $inside: inside },
  setup(self) {
    setup(self);
    // What is under it is pressed, and scrolled, as if it were not there.
    self.$node.style.pointerEvents = "none";
  },
});

assignables(ScrollIndicator);

speaks(ScrollIndicator, "Indicator");
