// What shows a system's particles: an ImageParticle paints a picture for
// each, an ItemParticle moves an item with each. A painter shows the groups
// it names, or the one without a name.
import { defineType } from "../../object.ts";
import { Item } from "../Item.js";
import { belongs, found, names } from "./system.js";

const NONE = Object.freeze([]);
const UNNAMED = [""];

export const ParticlePainter = defineType("ParticlePainter", Item, {
  properties: { system: found, groups: NONE },
  methods: {
    // A particle of `group` was emitted in the slot `index`.
    $load() {},
    // The frame: show the particles as they are at the system's time.
    $paint() {},
    // The system starts again from nothing.
    $reset() {},
  },
  setup(self) {
    self.$painted = NONE;
    belongs(
      self,
      "painters",
      () => names(self.groups).map(String),
      (sim, wanted, old) => {
        for (const group of self.$painted) {
          group.painters.splice(group.painters.indexOf(self), 1);
          if (group.colorOwner === self) group.colorOwner = null;
          if (group.spinOwner === self) group.spinOwner = null;
        }
        self.$painted = sim ? (wanted.length ? wanted : UNNAMED).map((name) => sim.group(name)) : NONE;
        for (const group of self.$painted) group.painters.push(self);
        if (!sim && old) self.$reset();
        (sim ?? old)?.refresh();
      },
    );
  },
});
