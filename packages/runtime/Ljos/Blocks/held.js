// A block of a page with a live shell (`qml({ liveShell })`): one instance
// of it for the page, which every shell that shows it shows. A shell is
// what the visitor changes; the blocks are what the site keeps, so a basket
// still holds what was bought when another shell is dropped.
//
// The instance is made apart from any shell, by the id (or the name) the
// shell gives it and by which use of that it is among the uses written in its
// shell: `Card {} Card {}` are one instance each, the same again in the next
// shell. A shell that drops `basket` and writes `cart` has a new one. What
// comes and goes while the page runs (a Repeater's rows, a Loader's item, what
// `createObject` makes) is no use of that kind: it is made anew each time, and
// goes when it goes. So is a block used inside a block, which is that block's
// own, as any object inside it.
//
// All a use says besides is under the instance for as long as the use lasts,
// and taken off when the shell goes: what it sets is a layer over what the
// block says, what it handles is connected, what it writes inside it is put
// where the block puts its children, and what it declares is kept apart, on
// an object of its own, and reached through the instance. The block's own
// state is the block's. The shell's id names the instance itself, so a binding
// of the shell that reads `basket.count` reads the block's.
import { getOwner, onCleanup, runWithOwner } from "solid-js";
import { connect, currentParent, defineType, inherit, inside, instantiate, madeOnDemand, override, QtObject, slot } from "../../object.js";
import { untrack } from "#kernel";

const hide = (self, name, value) => Object.defineProperty(self, name, { value, writable: true, configurable: true });

// Where the instance is in the shell: in its place among its parent's
// children (`$siblings`), as a Repeater's delegates are, while it is not
// itself an item there.
const Placed = defineType("Placed", QtObject, {
  methods: {
    $siblings() {
      return [this.$block];
    },
  },
  setup(self, props) {
    const block = props.$block;
    hide(self, "$block", block);
    const parent = self.$parent;
    if (!parent) return;
    slot(block, "parent")?.write(parent);
    // The shell that comes next has put it in its own place by then.
    runWithOwner(self.$owner, () =>
      onCleanup(() => {
        if (untrack(() => block.parent) === parent) slot(block, "parent")?.write(null);
      }),
    );
  },
});

const instances = new Map();
const blocks = new WeakSet();
const taken = new WeakMap();
const places = new WeakMap();
const said = new WeakMap();
let making = 0;
// The shell whose uses are being made inside a use of a block: they are that
// shell's, though the block they are put in has no parent to find it by.
let shellOfUse;

// The shell an object being made is in; none for the shell's own root.
function shellRoot() {
  if (shellOfUse !== undefined) return shellOfUse;
  let root = currentParent();
  while (root?.$parent) root = root.$parent;
  return root;
}

// Which use of `key` this is among those written in this shell. The shell's
// root has no siblings to be told from, and is made before the last shell's
// has gone: it has the one number.
function claim(root, key) {
  if (!root) return key;
  let uses = taken.get(root);
  if (!uses) taken.set(root, (uses = new Set()));
  let index = 0;
  while (uses.has(`${key}/${index}`)) index++;
  const use = `${key}/${index}`;
  uses.add(use);
  return use;
}

function instanceOf(Block, key) {
  let block = instances.get(key);
  if (block) return block;
  // Where the block's file puts what is written inside an instance of it, as
  // it is read: nothing is there yet, and the uses bring it.
  let place;
  const holding = {
    $holding: true,
    get children() {
      place ??= currentParent();
      return [];
    },
  };
  making++;
  try {
    block = instantiate(Block, holding, null, null).object;
  } finally {
    making--;
  }
  blocks.add(block);
  places.set(block, place ?? block);
  instances.set(key, block);
  hide(block, "$held", Block);
  return block;
}

// `Panel { Text {} }`: made in the shell, under its owner, so that they go
// with it, and put where the block's file says.
function written(block, props, root, parent) {
  const place = places.get(block);
  const outer = shellOfUse;
  // A reload knows a plain item by what it was made in: the shell's, though
  // it is the block they are put in.
  const born = parent?.$born ?? root?.$born;
  const had = Object.getOwnPropertyDescriptor(place, "$born");
  if (born) hide(place, "$born", born);
  // A shell whose root is this use has no object to be found by; what is
  // written in it still tells its uses apart.
  shellOfUse = root ?? {};
  let made;
  try {
    made = inside(place, () => untrack(() => [props.children].flat(Infinity).flatMap(flattened)));
  } finally {
    shellOfUse = outer;
    if (had) Object.defineProperty(place, "$born", had);
    else if (born) delete place.$born;
  }
  const [name, list] = block.$props.$default ?? [];
  if (name) {
    const layer = override(block, name, { value: list ? made : (made.at(-1) ?? null) });
    onCleanup(() => layer.remove());
    return;
  }
  for (const child of made) place.$add?.(child);
  if (!place.$add && made.length) console.warn(`${block.$type.typeName} has nowhere to put what a use of it writes inside it`);
  onCleanup(() => {
    for (const child of made) {
      place.$remove?.(child);
      child.$node?.remove();
    }
  });
}

const flattened = (made) => (typeof made === "function" && !made.$component && !made.proto ? [made()].flat(Infinity).flatMap(flattened) : made == null ? [] : [made]);

// What a use declares, on an object of its own for as long as the use lasts:
// the block's own type does not change for one shell's sake. It is reached
// through the instance, where the block has no member of that name, so that
// `parent.extra` of what the use writes inside it reads it too; through the
// use's own id otherwise.
function declared(block, self, given) {
  const layer = QtObject(given);
  const names = new Set([...Object.getOwnPropertyNames(layer.$type.proto), ...Object.keys(given.$functions ?? {})]);
  names.delete("constructor");
  for (const name of Object.keys(given.$aliases ?? {})) names.add(name).add(`${name}Changed`);
  const forwards = [];
  for (const name of names) {
    const descriptor = { get: () => layer[name], set: (value) => (layer[name] = value), enumerable: false, configurable: true };
    // The last use's, which goes after this one comes, is no member of the block's.
    const on = name in block && !Object.getOwnPropertyDescriptor(block, name)?.get?.$use ? self : block;
    if (!on) continue;
    descriptor.get.$use = true;
    Object.defineProperty(on, name, descriptor);
    forwards.push([on, name, descriptor]);
  }
  if (!block.$uses) hide(block, "$uses", new Set());
  const uses = block.$uses;
  uses.add(layer);
  onCleanup(() => {
    uses.delete(layer);
    // The shell that comes next has put its own in place by then.
    for (const [on, name, descriptor] of forwards) {
      if (Object.getOwnPropertyDescriptor(on, name)?.get === descriptor.get) delete on[name];
    }
  });
  return layer;
}

// `Layout.fillWidth`: said of the instance, by whichever attached type is
// asked of it for as long as the use lasts. The use that comes next says its
// own before this one goes, so this one takes off only what is still its own,
// and what is under it is what the block's file said.
function attached(block, props, types, owner) {
  if (!said.has(block)) said.set(block, new Map());
  const saying = said.get(block);
  const use = {};
  const mine = [];
  const release = (key, entry) => {
    if (entry.under) Object.defineProperty(block.$props, key, entry.under);
    else delete block.$props[key];
    saying.delete(key);
  };
  for (const type of types) {
    const prefix = `${type.typeName}$`;
    // What the last use said and this one does not is not said any longer.
    for (const [key, entry] of saying) if (key.startsWith(prefix) && !(key in props)) release(key, entry);
    for (const key of Object.keys(props)) {
      if (!key.startsWith(prefix)) continue;
      const under = saying.has(key) ? saying.get(key).under : Object.getOwnPropertyDescriptor(block.$props, key);
      Object.defineProperty(block.$props, key, { ...Object.getOwnPropertyDescriptor(props, key), configurable: true });
      saying.set(key, { use, under });
    }
    if (block.$attached) delete block.$attached[type.typeName];
    const home = block.$owner;
    hide(block, "$owner", owner);
    try {
      type.attached?.(block);
    } finally {
      hide(block, "$owner", home);
    }
    mine.push([type.typeName, block.$attached?.[type.typeName]]);
  }
  onCleanup(() => {
    for (const [key, entry] of saying) if (entry.use === use) release(key, entry);
    for (const [name, object] of mine) if (block.$attached?.[name] === object) delete block.$attached[name];
  });
}

// What a block's compiled component is for a page with a live shell. `name`
// is the block's `Module/Name`: its function's name is only its file's, which
// a block of another module may share.
export function $held(Block, name) {
  function Held(given) {
    const root = shellRoot();
    if (making > 0 || madeOnDemand() || blocks.has(root)) return Block(given);
    const props = given.$given ? inherit(given, given.$given) : given;
    const key = claim(root, `${name}#${props.$self?.$id ?? props.objectName ?? ""}`);
    const block = instanceOf(Block, key);
    const self = props.$self;
    if (self && self !== block) {
      Object.setPrototypeOf(self, block);
      self.$touch((version) => version + 1);
    }
    const parent = currentParent();
    const owner = getOwner();
    const types = props.$attach ?? [];
    const declarations = [props.$declare ?? []].flat();
    const own = new Set(Object.keys(props.$aliases ?? {}));
    for (const { properties, signals } of declarations) {
      for (const property of Object.keys(properties ?? {})) own.add(property);
      for (const signal of signals ?? []) own.add(signal);
    }
    for (const property of [...own]) own.add(`${property}Changed`);
    const layered = {};
    for (const key of ["$declare", "$aliases", "$functions"]) if (props[key]) layered[key] = props[key];
    const copy = (key) => Object.defineProperty(layered, key, Object.getOwnPropertyDescriptor(props, key));
    runWithOwner(owner, () => {
      for (const key of Object.keys(props)) {
        if (key[0] === "$" || key === "children") continue;
        const descriptor = Object.getOwnPropertyDescriptor(props, key);
        const handled = /^on([A-Z]\w*)$/.exec(key)?.[1];
        const member = handled ? handled[0].toLowerCase() + handled.slice(1) : key;
        if (own.has(member) || key.startsWith("Component$")) {
          copy(key);
          continue;
        }
        if (types.some((type) => key.startsWith(`${type.typeName}$`))) continue;
        if (handled) {
          connect(block, member, (...args) => descriptor.value?.(...args));
          continue;
        }
        if (!slot(block, key)) {
          console.warn(`${name}: a use of it cannot say \`${key.replaceAll("$", ".")}\`: the block has no such member`);
          continue;
        }
        const layer = override(block, key, descriptor.get ? { binding: () => descriptor.get.call(props) } : { value: descriptor.value });
        onCleanup(() => layer.remove());
      }
      if (Object.keys(layered).length > 0) declared(block, self, layered);
      if ("children" in props) written(block, props, root, parent);
      if (types.length > 0) attached(block, props, types, owner);
    });
    return Placed({ $block: block });
  }
  Object.setPrototypeOf(Held, Block);
  Held.$held = Block;
  return Held;
}
