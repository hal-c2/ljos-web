// Switch: on or off, by a click or by dragging its handle across.
import { defineType, derived } from "../../object.js";
import { styleHints } from "../../QtQml/application.js";
import { AbstractButton } from "./AbstractButton.js";
import { put } from "./Control.js";
import { untrack } from "#kernel";
import { speaks } from "../Accessible.js";

function setPosition(self, position) {
  put(self, "position", Math.min(1, Math.max(0, position)));
}

// How far across the indicator a point of the switch is.
function positionAt(self, x, y) {
  return untrack(() => {
    const indicator = self.indicator;
    const at = indicator ? indicator.mapFromItem(self, x, y).x / indicator.width : 0;
    return self.mirrored ? 1 - at : at;
  });
}

const over = (position) => position >= 0 && position <= 1;

// What a switch and a switch delegate have in common.
export const switching = {
  properties: {
    checkable: true,
    position: 0,
    visualPosition: derived((self) => (self.mirrored ? 1 - self.position : self.position)),
  },
  methods: {
    $keepPressed: true,
    // Switches do not exclude each other.
    $buttonChange(checked) {
      setPosition(this, checked ? 1 : 0);
    },
    $handleMove(x, y, point) {
      const mine = this.$button;
      // The handle is dragged only by a press at the indicator, or once the
      // pointer has come to it, and not before it has moved some way.
      if (!mine.dragging && (over(positionAt(this, mine.x, mine.y)) || over(positionAt(this, x, y)))) {
        mine.dragging = Math.abs(x - mine.x) > styleHints().startDragDistance;
      }
      AbstractButton.proto.$handleMove.call(this, x, y, point);
      if (mine.dragging) setPosition(this, positionAt(this, x, y));
    },
    $handleRelease(x, y, point) {
      AbstractButton.proto.$handleRelease.call(this, x, y, point);
      this.$button.dragging = false;
    },
    $handleUngrab() {
      AbstractButton.proto.$handleUngrab.call(this);
      this.$button.dragging = false;
    },
    // Dragged, it is on when let go in the second half.
    $nextCheckState() {
      if (!this.$button.dragging) return AbstractButton.proto.$nextCheckState.call(this);
      this.$toggle(untrack(() => this.position) > 0.5);
      // It may be as it was: the handle goes back to its end all the same.
      setPosition(this, untrack(() => this.checked) ? 1 : 0);
    },
  },
  setup(self) {
    self.$button.dragging = false;
    // A finger on it drags the handle, not the page.
    self.$node.style.touchAction = "none";
  },
};

export const Switch = defineType("Switch", AbstractButton, switching);

speaks(Switch, "Switch", undefined, true);
