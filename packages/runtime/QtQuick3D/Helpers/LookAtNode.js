// LookAtNode: a node that keeps facing another, wherever either goes. It
// turns up and down and to the side and never rolls: how far it is rolled
// is left as it was.
import { defineType, effect } from "../../object.js";
import { Vector3d } from "../../QtQml/values.js";
import { Node } from "../Node.js";
import { untrack } from "#kernel";

const DEGREES = 180 / Math.PI;

export const LookAtNode = defineType("LookAtNode", Node, {
  properties: {
    target: null,
  },
  setup(self) {
    // Only where either is says which way to face: turning this node by
    // hand lasts until one of them moves.
    let last = "";
    effect(
      () => {
        const to = self.target?.$spatial ? self.target.scenePosition : null;
        const from = self.scenePosition;
        return to && [from.x - to.x, from.y - to.y, from.z - to.z, `${from} ${to}`];
      },
      (away) => {
        if (!away || away[3] === last) return;
        const [x, y, z] = away;
        last = away[3];
        const roll = untrack(() => self.eulerRotation.z);
        self.eulerRotation = new Vector3d(Math.atan2(Math.hypot(x, z), y) * DEGREES - 90, Math.atan2(x, z) * DEGREES, roll);
      },
    );
  },
});
