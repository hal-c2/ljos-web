// Instancing: a table that says where a Model's shape is drawn, once for
// each entry of it: where that one is, how it is turned and how big it is,
// what colour it is times, and four numbers of its own. An InstanceList is
// such a table written out, entry by entry.
//
// An entry is kept as Qt keeps it: three rows of a matrix, the colour in
// linear light, and the four numbers. What is asked of an entry is read
// back out of that, so a colour reads as it is in linear light, as in Qt.
//
// A FileInstancing is one read from a file: Qt's own of numbers as they are
// kept (`.bin`), or one of XML with an `Instance` for each entry.
//
// Not here: the bounds a table gives its shadows, and the `.bin` file Qt
// reads instead of an XML one that has one beside it, which says the same.
import { defineType, derived, effect, located } from "../object.js";
import { Quaternion, Vector3d, Vector4d } from "../QtQml/values.js";
import { color, colorValue, rgba } from "../QtQuick/color.js";
import * as math from "./math.js";
import { kept, Object3D } from "./Node.js";
import { file, linear } from "./scene.js";
import { signal } from "#kernel";

// How many numbers an entry is.
export const ENTRY = 20;

const NOTHING = new Float32Array(0);
const ORIGIN = [0, 0, 0];

// An entry put into a table: the turn is a quaternion, the colour one a
// screen shows, which is brought to linear light here.
export function enter(into, index, position, scale, turn, tone, data) {
  const m = math.placed(position, scale, ORIGIN, turn);
  into.set([m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14], ...linear(tone), ...data], index * ENTRY);
}

const three = (value) => [Number(value?.x) || 0, Number(value?.y) || 0, Number(value?.z) || 0];
const four = (value) => [...three(value), Number(value?.w) || 0];

// The three directions of an entry, each as long as the entry scales it.
function axes(data, at) {
  return [0, 1, 2].map((column) => [data[at + column], data[at + 4 + column], data[at + 8 + column]]);
}

export const Instancing = defineType("Instancing", Object3D, {
  properties: {
    instanceCountOverride: -1,
    hasTransparency: false,
    depthSortingEnabled: false,
    shadowBoundsMinimum: new Vector3d(1, 1, 1),
    shadowBoundsMaximum: new Vector3d(-1, -1, -1),
  },
  signals: ["instanceTableChanged", "instanceNodeDirty"],
  methods: {
    // What is asked of an entry there is none of is nothing: not an error.
    instancePosition(index) {
      const at = this.$entry(index);
      if (at < 0) return new Vector3d(0, 0, 0);
      const data = this.$data();
      return new Vector3d(data[at + 3], data[at + 7], data[at + 11]);
    },
    instanceScale(index) {
      const at = this.$entry(index);
      if (at < 0) return new Vector3d(0, 0, 0);
      return math.vector(axes(this.$data(), at).map(([x, y, z]) => Math.hypot(x, y, z)));
    },
    instanceRotation(index) {
      const at = this.$entry(index);
      if (at < 0) return new Quaternion(1, 0, 0, 0);
      const [x, y, z] = axes(this.$data(), at).map(math.normalized);
      return math.quaternion(math.turnOf([...x, 0, ...y, 0, ...z, 0, 0, 0, 0, 1]));
    },
    instanceColor(index) {
      const at = this.$entry(index);
      if (at < 0) return color("");
      const data = this.$data();
      return rgba(data[at + 12], data[at + 13], data[at + 14], data[at + 15]);
    },
    instanceCustomData(index) {
      const at = this.$entry(index);
      if (at < 0) return new Vector4d(0, 0, 0, 0);
      const data = this.$data();
      return new Vector4d(data[at + 16], data[at + 17], data[at + 18], data[at + 19]);
    },
    // Where an entry starts among the numbers, or -1.
    $entry(index) {
      const at = Math.trunc(Number(index)) * ENTRY;
      return at >= 0 && at < this.$data().length ? at : -1;
    },
  },
  setup(self) {
    // The numbers of every entry, which the table that this is makes
    // (`$made`), and how many of them are drawn.
    // Made again with the same numbers it is the same table: nothing is
    // told of it.
    let last = NOTHING;
    self.$data = kept(self, () => {
      const made = self.$made?.() ?? NOTHING;
      if (made.length !== last.length || made.some((number, at) => number !== last[at])) last = made;
      return last;
    });
    self.$count = () => {
      const all = self.$data().length / ENTRY;
      const only = self.instanceCountOverride;
      return only >= 0 ? Math.min(only, all) : all;
    };
    // What a Model draws by.
    self.$table = () => ({ data: self.$data(), count: self.$count(), sheer: Boolean(self.hasTransparency), sorted: Boolean(self.depthSortingEnabled) });
    effect(
      () => self.$data(),
      () => void self.instanceTableChanged(),
    );
  },
});

export const InstanceListEntry = defineType("InstanceListEntry", Object3D, {
  properties: {
    position: new Vector3d(0, 0, 0),
    scale: new Vector3d(1, 1, 1),
    eulerRotation: new Vector3d(0, 0, 0),
    rotation: new Quaternion(1, 0, 0, 0),
    color: "#ffffff",
    customData: new Vector4d(0, 0, 0, 0),
  },
  resolve: { color: colorValue },
  setup(self, props) {
    self.$instance = true;
    // An entry is turned by its angles, or by `rotation` where that was
    // what it was given last.
    const [angled, setAngled] = signal(!("rotation" in props) || "eulerRotation" in props, self.$owner);
    self.$angled = setAngled;
    self.$turn = () => {
      if (angled()) return math.fromEuler(...three(self.eulerRotation));
      const { scalar, x, y, z } = self.rotation;
      return [scalar, x, y, z];
    };
  },
});

for (const [name, angled] of [
  ["eulerRotation", true],
  ["rotation", false],
]) {
  const { get, set } = Object.getOwnPropertyDescriptor(InstanceListEntry.proto, name);
  Object.defineProperty(InstanceListEntry.proto, name, {
    get,
    set(value) {
      this.$angled(angled);
      set.call(this, value);
    },
    enumerable: true,
    configurable: true,
  });
}

const list = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);

export const InstanceList = defineType("InstanceList", Instancing, {
  properties: {
    instances: undefined,
    instanceCount: derived((self) => self.$instances().length),
  },
  setup(self) {
    // Its entries are those declared in it and those it was given.
    self.$instances = () => {
      self.$track();
      const inside = [...(self.$static ?? []), ...(self.$extra ?? [])];
      return [...inside, ...list(self.instances).filter((entry) => !inside.includes(entry))].filter((entry) => entry?.$instance);
    };
    self.$made = () => {
      const entries = self.$instances();
      const data = new Float32Array(entries.length * ENTRY);
      entries.forEach((entry, index) => {
        enter(data, index, three(entry.position), three(entry.scale), entry.$turn(), entry.color, four(entry.customData));
      });
      return data;
    };
  },
});

// Qt's file of a table as it is kept: `QtIR`, the version, how long an
// entry is, where the first is and how many there are, then the entries.
function binary(buffer) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 20 || view.getUint32(0, true) !== 0x52497451) return { error: "is not a table of instances" };
  if (view.getUint16(4, true) > 1) return { error: `is of version ${view.getUint16(4, true)}, which is too new` };
  const stride = view.getUint32(8, true);
  const offset = view.getUint32(12, true);
  const count = view.getUint32(16, true);
  if (stride !== ENTRY * 4 || buffer.byteLength !== 20 + count * stride) return { error: "is not as long as it says" };
  return new Float32Array(buffer.slice(offset, offset + count * stride));
}

// One written as XML: numbers with spaces between them, where those left
// off the end are nothing.
const decoder = new TextDecoder();
function written(buffer) {
  const table = new DOMParser().parseFromString(decoder.decode(buffer), "application/xml").documentElement;
  if (table?.localName !== "InstanceTable") return { error: "has no InstanceTable" };
  const entries = [...table.children].filter((entry) => entry.localName === "Instance");
  const data = new Float32Array(entries.length * ENTRY);
  entries.forEach((entry, index) => {
    const numbers = (name, many, missing) => {
      const said = entry.getAttribute(name);
      if (said === null) return missing;
      const given = said.trim().split(/\s+/).map(Number);
      return Array.from({ length: many }, (_, at) => given[at] || 0);
    };
    const quaternion = numbers("quaternion", 4, null);
    const turn = quaternion ? [quaternion[3], quaternion[0], quaternion[1], quaternion[2]] : math.fromEuler(...numbers("eulerRotation", 3, ORIGIN));
    enter(data, index, numbers("position", 3, ORIGIN), numbers("scale", 3, [1, 1, 1]), turn, entry.getAttribute("color") ?? "#ffffff", numbers("custom", 4, [0, 0, 0, 0]));
  });
  return data;
}

const warned = new Set();

export const FileInstancing = defineType("FileInstancing", Instancing, {
  properties: {
    source: "",
    instanceCount: derived((self) => self.$data().length / ENTRY),
  },
  setup(self) {
    // No entries until the file is here, and none of one that is not a
    // table, which is said once.
    self.$made = () => {
      const given = String(self.source ?? "");
      if (!given) return NOTHING;
      const url = located(given);
      const read = file(url, "instances", /\.bin$/.test(new URL(url, location.href).pathname) ? binary : written).state();
      if (read?.error) {
        if (!warned.has(url)) console.warn(`FileInstancing: ${url}: ${read.error}`);
        warned.add(url);
        return NOTHING;
      }
      return read ?? NOTHING;
    };
  },
});
