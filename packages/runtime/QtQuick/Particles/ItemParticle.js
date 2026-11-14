// ItemParticle: an item for each particle of its groups, made from the
// delegate when the particle is emitted, moved with it, and destroyed when
// it is gone.
import { defineType, effect, instantiate, QtObject, slot } from "../../object.ts";
import { between } from "./geometry.js";
import { ParticlePainter } from "./painter.js";
import { heard, LIFE, position, STRIDE, T, X, Y } from "./system.js";

const MAP = new Float64Array(6);
const NOTHING = Object.freeze({});

// `ItemParticle.particle` in a delegate, and what tells it of its particle.
const ItemParticleAttached = defineType("ItemParticleAttached", QtObject, {
  properties: { particle: null },
  signals: ["attached", "detached"],
});

// The item is its particle's no more.
function drop(self, entry) {
  const told = ItemParticle.attached(entry.object);
  if (told && heard(told, "detached", "onDetached")) told.detached();
  self.$remove(entry.object);
  entry.dispose();
}

export const ItemParticle = defineType("ItemParticle", ParticlePainter, {
  properties: { fade: true, delegate: undefined },
  attached: ItemParticleAttached,
  methods: {
    // The item's particle stays as it is, neither moving nor ageing.
    freeze(item) {
      this.$frozen.add(item);
    },
    unfreeze(item) {
      this.$frozen.delete(item);
    },
    // The item is let go of, and its particle ends. It was made here, so it
    // ends too, as in Qt.
    give(item) {
      for (const [group, items] of this.$items) {
        const index = items.findIndex((entry) => entry?.object === item);
        if (index < 0) continue;
        group.data[index * STRIDE + LIFE] = 0;
        drop(this, items[index]);
        items[index] = undefined;
        return;
      }
    },
    $reset() {
      for (const items of this.$items.values()) for (const entry of items) if (entry) drop(this, entry);
      this.$items.clear();
      this.$frozen.clear();
      this.$last = 0;
    },
    $paint(sim) {
      const time = sim.now / 1000;
      const elapsed = time - this.$last;
      this.$last = time;
      const groups = this.$painted;
      const component = this.$delegate;
      const fade = this.$fade;
      // Nothing to move and nothing to make: no need to know where.
      let busy = this.$items.size > 0;
      for (let each = 0; each < groups.length && !busy; each++) busy = groups[each].alive > 0;
      if (!busy || !between(sim.system, this, MAP)) return;
      for (let each = 0; each < groups.length; each++) {
        const group = groups[each];
        let items = this.$items.get(group);
        if (!items) this.$items.set(group, (items = []));
        const { data, used, serial } = group;
        const end = Math.max(group.high, items.length);
        for (let index = 0, at = 0; index < end; index++, at += STRIDE) {
          let entry = items[index];
          const live = index < group.high && used[index] !== 0;
          // Its particle is gone, or the slot is another's by now.
          if (entry && !(live && serial[index] === entry.serial)) {
            drop(this, entry);
            entry = items[index] = undefined;
          }
          if (!live) continue;
          if (entry && this.$frozen.has(entry.object)) {
            data[at + T] += elapsed;
            continue;
          }
          const age = time - data[at + T];
          const part = age / data[at + LIFE];
          if (!(part < 1)) {
            if (entry) {
              drop(this, entry);
              items[index] = undefined;
            }
            continue;
          }
          if (!entry) {
            if (!component) continue;
            const made = instantiate(component, NOTHING, this, this.$owner);
            if (!made.object?.$node) {
              made.dispose();
              continue;
            }
            entry = items[index] = { object: made.object, dispose: made.dispose, serial: serial[index] };
            this.$add(entry.object);
            const told = ItemParticle.attached(entry.object);
            if (told) {
              slot(told, "particle").write(this);
              if (heard(told, "attached", "onAttached")) told.attached();
            }
          }
          const item = entry.object;
          // In over the first fifth of its life, out over the last.
          if (fade) slot(item, "opacity").write(part < 0.2 ? Math.max(part, 0) * 5 : part > 0.8 ? (1 - part) * 5 : 1);
          const x = position(data, at + X, age);
          const y = position(data, at + Y, age);
          slot(item, "x").write(MAP[0] * x + MAP[2] * y + MAP[4] - item.width / 2);
          slot(item, "y").write(MAP[1] * x + MAP[3] * y + MAP[5] - item.height / 2);
        }
        items.length = Math.min(items.length, group.high);
      }
    },
  },
  setup(self) {
    self.$items = new Map();
    self.$frozen = new Set();
    self.$last = 0;
    self.$delegate = null;
    self.$fade = true;
    effect(
      () => [self.delegate, Boolean(self.fade)],
      ([delegate, fade]) => {
        self.$delegate = typeof delegate === "function" ? delegate : null;
        self.$fade = fade;
        self.$in?.refresh();
      },
    );
  },
});
