// A native type's face: what `ljos-web faces` builds each generated type on
// (docs/LJOS_WEB.md A22). The wasm struct owns the values. The kernel's slots
// show them to Solid: a read is served from the slot and tracked, what QML
// gives a property is pushed across, and a change made in Rust comes back in
// one telling when the outermost call into Rust returns. Nothing polls.
import { onCleanup } from "solid-js";
import { untrack } from "#kernel";
import { defineType, group, kinds, onChange, QtObject, settle, slot, typed, whenCompleted } from "../object.js";

const initial = (kind, value) => {
  const of = kinds[kind];
  return of ? typed(of, value) : value;
};

// `[name, key, value, key, value…]` per enum, as `Type.Key` reads them.
const enumsOf = (Rust) => {
  const given = Rust.__ljos_enums();
  if (!given) return undefined;
  const enums = {};
  for (const [, ...pairs] of given) {
    for (let at = 0; at < pairs.length; at += 2) enums[pairs[at]] = pairs[at + 1];
  }
  return enums;
};

// The values a property starts with are the struct's own `Default`, read off
// a specimen once. A type with no `Default` starts from its kinds' zeroes,
// and its first object says otherwise.
function specify(meta, Rust) {
  let specimen = null;
  try {
    specimen = new Rust();
  } catch {
    // An `uncreatable` type with no `Default`: the code that makes one says.
  }
  const properties = {};
  for (const property of meta.props) {
    if (property.members) {
      const members = {};
      for (const member of property.members) {
        const value = specimen?.__ljos_group_get(property.name, member.name);
        members[member.name] = initial(member.kind, value);
      }
      properties[property.name] = group(members);
    } else {
      const value = specimen?.[property.name];
      properties[property.name] = initial(property.kind, value ?? (property.kind === "var" ? null : undefined));
    }
  }
  specimen?.free();
  return properties;
}

function methodsOf(meta) {
  const methods = {};
  for (const { name } of meta.methods ?? []) {
    methods[name] = function (...args) {
      const result = this.$rust[name](...args);
      settle();
      return result;
    };
  }
  return methods;
}

// A field's `write` hook is its setter: what it keeps is what the slot gets,
// before the slot stores it or anyone hears of it, as it is natively.
function kept(self, name, rust, known, holding) {
  const it = slot(self, name);
  const kind = it.kind;
  const through = (value) => {
    const made = kind ? kind(value) : value;
    if (kind && (typeof made === "symbol" || made === undefined)) return made;
    const before = holding.on;
    holding.on = true;
    try {
      rust[name] = made;
    } finally {
      holding.on = before;
    }
    const held = rust[name];
    known.set(name, held);
    return held;
  };
  it.kind = kind ? Object.assign(through, kind) : through;
}

function connect(self, meta, rust) {
  const props = meta.props;
  const known = new Map();
  const memberKey = (name, member) => `${name}$${member}`;

  // What Rust holds now is what the property is, over a value QML assigned. A
  // binding stands, as a write from outside doesn't end one in the kernel.
  const give = (key, value) => {
    if (Object.is(known.get(key), value)) return;
    known.set(key, value);
    const it = slot(self, key);
    if (it.assigned) it.write(value);
    else it.provide(value);
  };
  const put = (property, value) => {
    if (property.members) {
      for (const { name } of property.members) give(memberKey(property.name, name), value?.[name]);
    } else give(property.name, value);
  };

  // `[index, value, …, "signal", [args], …]`: every change, then the signals,
  // so a handler sees all of what the call did.
  const holding = { on: false };
  const tell = (told) => {
    // A `write` hook runs inside the write it filters, which may be inside a
    // binding: what else it changed is told once that has finished.
    if (holding.on) {
      queueMicrotask(() => tell(told));
      return;
    }
    let signals;
    for (let at = 0; at < told.length; at += 2) {
      if (typeof told[at] === "number") put(props[told[at]], told[at + 1]);
      else (signals ??= []).push(told[at], told[at + 1]);
    }
    settle();
    if (!signals) return;
    for (let at = 0; at < signals.length; at += 2) self[signals[at]](...signals[at + 1]);
    settle();
  };
  rust.__ljos_listen(tell);

  for (const property of props) {
    const { name } = property;
    if (property.members) {
      for (const member of property.members) {
        const key = memberKey(name, member.name);
        const now = rust.__ljos_group_get(name, member.name);
        known.set(key, now);
      }
      const push = () => {
        for (const member of property.members) {
          const key = memberKey(name, member.name);
          const value = untrack(() => self[name][member.name]);
          if (Object.is(known.get(key), value)) continue;
          known.set(key, value);
          rust.__ljos_group_set(name, member.name, value);
        }
        settle();
      };
      onChange(self, name, push, push);
      continue;
    }
    const now = rust[name];
    known.set(name, now);
    if (property.readonly) continue;
    if (property.write) kept(self, name, rust, known, holding);
    const push = (value) => {
      if (Object.is(known.get(name), value)) return;
      known.set(name, value);
      rust[name] = value;
      settle();
    };
    onChange(self, name, () => push(untrack(() => self[name])), push);
  }
}

// `meta` is what the generator read from the wasm, `Base` the runtime's type
// it stands on, and `extra` the visual part, which only a type on `Item`
// brings: a page with no visual type never loads QtQuick for this.
export function defineFace(meta, Base, Rust, extra) {
  return defineType(meta.name, Base, {
    properties: specify(meta, Rust),
    signals: (meta.signals ?? []).map((signal) => signal.name),
    methods: { ...methodsOf(meta), ...extra?.methods },
    enums: meta.enums ? enumsOf(Rust) : undefined,
    attached: meta.attachedType,
    setup(self) {
      const rust = new Rust();
      self.$rust = rust;
      rust.__ljos_bind(self);
      onCleanup(() => rust.free());
      connect(self, meta, rust);
      extra?.setup(self, rust);
      if (meta.complete)
        whenCompleted(() => {
          rust.__ljos_complete();
          settle();
        });
    },
  });
}

export { QtObject };
