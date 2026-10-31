// The instance tables QtQuick3D.Helpers has, and what reads a table row by
// row: a RandomInstancing, whose entries are made up between the ends of an
// InstanceRange each; an InstanceModel, a model with a row for each entry of
// a table; and an InstanceRepeater, which makes a node for each and puts it
// where the entry is.
//
// What a RandomInstancing makes up from a seed it makes up as Qt does: the
// numbers are those of Qt's own generator, drawn in Qt's order, so a table
// with a seed is the same table here.
import { defineType, effect, inside as within, slot } from "../../object.js";
import { Vector3d } from "../../QtQml/values.js";
import { color, hsla, hsva, rgba } from "../../QtQuick/color.js";
import { AbstractListModel, reset } from "../../QtQuick/model.js";
import { ENTRY, enter, Instancing } from "../instancing.js";
import * as math from "../math.js";
import { Object3D } from "../Node.js";
import { Repeater3D } from "../Repeater3D.js";
import { untrack } from "#kernel";

const RGB = 0;
const HSV = 1;
const HSL = 2;

const f = Math.fround;

// Qt's generator of numbers from a seed: a Mersenne Twister, begun from the
// seed as the C++ library's `seed_seq` begins one. Gives the next number
// from nothing up to one, which is two of the twister's put together.
function seeded(seed) {
  const n = 624;
  const b = new Uint32Array(n).fill(0x8b8b8b8b);
  const p = (n - 11) >> 1;
  const q = p + 11;
  const mixed = (x) => (x ^ (x >>> 27)) >>> 0;
  for (let k = 0; k < n; k++) {
    const r1 = Math.imul(1664525, mixed(b[k % n] ^ b[(k + p) % n] ^ b[(k + n - 1) % n])) >>> 0;
    const r2 = (r1 + (k === 0 ? 1 : k === 1 ? 1 + (seed >>> 0) : k)) >>> 0;
    b[(k + p) % n] += r1;
    b[(k + q) % n] += r2;
    b[k % n] = r2;
  }
  for (let k = n; k < n + n; k++) {
    const r3 = Math.imul(1566083941, mixed((b[k % n] + b[(k + p) % n] + b[(k + n - 1) % n]) >>> 0)) >>> 0;
    const r4 = (r3 - (k % n)) >>> 0;
    b[(k + p) % n] ^= r3;
    b[(k + q) % n] ^= r4;
    b[k % n] = r4;
  }
  let at = n;
  const next = () => {
    if (at >= n) {
      for (let i = 0; i < n; i++) {
        const y = (b[i] & 0x80000000) | (b[(i + 1) % n] & 0x7fffffff);
        b[i] = b[(i + 397) % n] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      at = 0;
    }
    let y = b[at++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  };
  return () => {
    const low = next();
    return (next() * 2097152 + (low >>> 11)) / 9007199254740992;
  };
}

// Somewhere between two lists of numbers: as far along for each as a number
// drawn for it says, or as one number says for them all.
function between(from, to, proportional, draw) {
  const along = (index, c) => f(from[index] + f(c * f(to[index] - from[index])));
  if (proportional) {
    const c = f(draw());
    return from.map((_, index) => along(index, c));
  }
  return from.map((_, index) => along(index, f(draw())));
}

const three = (value) => [Number(value?.x) || 0, Number(value?.y) || 0, Number(value?.z) || 0];
const four = (value) => [...three(value), Number(value?.w) || 0];

// A colour as numbers in the model the colours are mixed in, and back.
const PARTS = {
  [RGB]: [(c) => [c.r, c.g, c.b, c.a], rgba],
  [HSV]: [(c) => [c.hsvHue, c.hsvSaturation, c.hsvValue, c.a], hsva],
  [HSL]: [(c) => [c.hslHue, c.hslSaturation, c.hslLightness, c.a], hsla],
};

// Where the entries are put. With a grid they keep apart: none is put in a
// cell that is next to one taken, and one that finds no room after a
// million tries is the end of the table.
function placing(range, spacing, draw) {
  const from = three(range.from);
  const to = three(range.to);
  const proportional = Boolean(range.proportional);
  const gridded = spacing.some((size) => size > 0) && !spacing.some((size) => size < 0);
  if (!gridded) return { full: () => false, next: () => between(from, to, proportional, draw) };
  const cells = from.map((least, axis) => {
    const across = f(to[axis] - least);
    if (Math.abs(across) <= 0.00001) return 0;
    const cell = spacing[axis] > 0 ? spacing[axis] : across;
    return Math.trunc(across / cell) > 1 ? cell : 0;
  });
  const taken = new Set();
  let tries = 1000000;
  const near = (cell, axis) => (cells[axis] ? [cell[axis] - 1, cell[axis], cell[axis] + 1] : [cell[axis]]);
  return {
    full: () => tries <= 0,
    next() {
      for (; tries > 0; tries--) {
        const position = between(from, to, proportional, draw);
        const cell = position.map((part, axis) => (cells[axis] ? Math.trunc(f(part / cells[axis])) : 0));
        let free = true;
        for (const x of near(cell, 0)) for (const y of near(cell, 1)) for (const z of near(cell, 2)) if (taken.has(`${x} ${y} ${z}`)) free = false;
        if (!free) continue;
        taken.add(cell.join(" "));
        return position;
      }
      return [0, 0, 0];
    },
  };
}

export const InstanceRange = defineType("InstanceRange", Object3D, {
  properties: {
    from: undefined,
    to: undefined,
    proportional: false,
  },
});

export const RandomInstancing = defineType("RandomInstancing", Instancing, {
  properties: {
    instanceCount: 0,
    position: null,
    scale: null,
    rotation: null,
    color: null,
    customData: null,
    colorModel: RGB,
    gridSpacing: new Vector3d(0, 0, 0),
    randomSeed: -1,
  },
  enums: { RGB, HSV, HSL },
  setup(self) {
    // For each entry in turn: where it is, how big, how turned, its colour
    // and its own numbers, of each only where there is a range for it.
    self.$made = () => {
      const count = Math.max(0, Math.trunc(Number(self.instanceCount)) || 0);
      const seed = Number(self.randomSeed);
      const draw = seeded(seed === -1 ? Math.random() * 0x100000000 : seed);
      const { position, scale, rotation, color: tones, customData } = self;
      const places = position && placing(position, three(self.gridSpacing), draw);
      const [parts, mixed] = PARTS[self.colorModel] ?? PARTS[RGB];
      const data = new Float32Array(count * ENTRY);
      for (let index = 0; index < count; index++) {
        const place = places ? places.next() : [0, 0, 0];
        const size = scale ? between(three(scale.from), three(scale.to), scale.proportional, draw) : [1, 1, 1];
        const angles = rotation ? between(three(rotation.from), three(rotation.to), rotation.proportional, draw) : [0, 0, 0];
        const tone = tones ? mixed(...between(parts(color(tones.from)), parts(color(tones.to)), tones.proportional, draw)) : "#ffffff";
        const own = customData ? between(four(customData.from), four(customData.to), customData.proportional, draw) : [0, 0, 0, 0];
        if (places?.full()) return data.slice(0, index * ENTRY);
        enter(data, index, place, size, math.fromEuler(...angles), tone, own);
      }
      return data;
    };
    // A table that was cut short has as many entries as found room.
    effect(
      () => self.$data().length / ENTRY,
      (made) =>
        void untrack(() => {
          if (made >= self.instanceCount) return;
          console.warn(`RandomInstancing: Could not find free cell, truncating instance array ${made}`);
          slot(self, "instanceCount").write(made);
        }),
    );
  },
});

const ROLES = ["modelPosition", "modelRotation", "modelScale", "modelColor", "modelData"];

// The rows are those the table had when its entries last changed: a table
// told to draw fewer of them says so in `rowCount()` and the rows stay, as
// in Qt.
export const InstanceModel = defineType("InstanceModel", AbstractListModel, {
  properties: {
    instancingTable: null,
  },
  methods: {
    rowCount() {
      return this.instancingTable?.$count?.() ?? 0;
    },
  },
  setup(self) {
    effect(
      () => {
        const table = self.instancingTable;
        return table?.$data ? [table, table.$data()] : null;
      },
      (found) =>
        void untrack(() => {
          const table = found?.[0];
          const rows = Array.from({ length: table?.$count() ?? 0 }, (_, index) => ({
            modelPosition: table.instancePosition(index),
            modelRotation: table.instanceRotation(index),
            modelScale: table.instanceScale(index),
            modelColor: table.instanceColor(index),
            modelData: table.instanceCustomData(index),
          }));
          reset(self, rows, ROLES);
        }),
    );
  },
});

// A node made for an entry is put where the entry is, turned and sized as
// it is, whatever the delegate says of those itself.
export const InstanceRepeater = defineType("InstanceRepeater", Repeater3D, {
  properties: {
    instancingTable: null,
  },
  setup(self) {
    const rows = within(null, () => InstanceModel({}));
    self.objectAdded.connect((index, node) => {
      const row = rows.$elements[index];
      if (!row || !node?.$spatial) return;
      node.position = row.modelPosition;
      node.scale = row.modelScale;
      node.rotation = row.modelRotation;
    });
    effect(
      () => self.instancingTable,
      (table) =>
        void untrack(() => {
          rows.instancingTable = table;
          if (table) self.model = rows;
        }),
    );
  },
});
