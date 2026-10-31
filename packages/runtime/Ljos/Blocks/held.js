// A block of a page with a live shell (`qml({ liveShell })`): one instance
// of it for the page, which every shell that shows it shows. A shell is
// what the visitor changes; the blocks are what the site keeps, so a basket
// still holds what was bought when another shell is dropped.
//
// The instance is made apart from any shell, by the id (or the name) the
// shell gives it and by which use of that it is among the uses in its shell:
// `Card {} Card {}` and a Repeater's delegates are one instance each, the
// same again in the next shell. A shell that drops `basket` and writes `cart`
// has a new one. A block used inside a block is that block's own, as any
// object inside it, and goes with it. What a shell sets on it is a layer over what the block says, and
// what it handles is connected, both taken off when the shell goes; the
// block's own state is the block's. The shell's id names the instance
// itself, so a binding of the shell that reads `basket.count` reads the
// block's.
import { getOwner, onCleanup, runWithOwner } from "solid-js";
import { connect, currentParent, defineType, instantiate, override, QtObject, slot } from "../../object.js";
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
let making = 0;

// The shell an object being made is in.
function shellRoot() {
  let root = currentParent();
  while (root?.$parent) root = root.$parent;
  return root;
}

// The smallest number of a use not in use in this shell, given up when the
// use goes. The shell's own root has no siblings to be told from, and is made
// before the last shell's has gone.
function claim(root, key) {
  if (!root) return key;
  let uses = taken.get(root);
  if (!uses) taken.set(root, (uses = new Set()));
  let index = 0;
  while (uses.has(`${key}/${index}`)) index++;
  const use = `${key}/${index}`;
  uses.add(use);
  onCleanup(() => uses.delete(use));
  return use;
}

// What a block's compiled component is for a page with a live shell. `name`
// is the block's `Module/Name`: its function's name is only its file's, which
// a block of another module may share.
export function $held(Block, name) {
  function Held(props) {
    const root = shellRoot();
    if (making > 0 || blocks.has(root)) return Block(props);
    const key = claim(root, `${name}#${props.$self?.$id ?? props.objectName ?? ""}`);
    let block = instances.get(key);
    if (!block) {
      making++;
      try {
        block = instantiate(Block, {}, null, null).object;
      } finally {
        making--;
      }
      blocks.add(block);
      instances.set(key, block);
    }
    hide(block, "$held", Block);
    const self = props.$self;
    if (self && self !== block) {
      Object.setPrototypeOf(self, block);
      self.$touch((version) => version + 1);
    }
    const owner = getOwner();
    runWithOwner(owner, () => {
      for (const key of Object.keys(props)) {
        if (key[0] === "$" || key === "children") continue;
        const handled = /^on([A-Z]\w*)$/.exec(key)?.[1];
        const descriptor = Object.getOwnPropertyDescriptor(props, key);
        if (handled) {
          const name = handled[0].toLowerCase() + handled.slice(1);
          connect(block, name, (...args) => descriptor.value?.(...args));
          continue;
        }
        if (!slot(block, key)) continue;
        const layer = override(block, key, descriptor.get ? { binding: () => descriptor.get.call(props) } : { value: descriptor.value });
        onCleanup(() => layer.remove());
      }
    });
    return Placed({ $block: block });
  }
  Object.setPrototypeOf(Held, Block);
  Held.$held = Block;
  return Held;
}
