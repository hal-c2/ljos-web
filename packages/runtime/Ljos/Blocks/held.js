// A block of a page with a live shell (`qml({ liveShell })`): one instance
// of it for the page, which every shell that shows it shows. A shell is
// what the visitor changes; the blocks are what the site keeps, so a basket
// still holds what was bought when another shell is dropped.
//
// The instance is made apart from any shell, by the id (or the name) the
// shell gives it: a shell that drops `basket` and writes `cart` has a new
// one. What a shell sets on it is a layer over what the block says, and
// what it handles is connected, both taken off when the shell goes; the
// block's own state is the block's. The shell's id names the instance
// itself, so a binding of the shell that reads `basket.count` reads the
// block's.
import { getOwner, onCleanup, runWithOwner } from "solid-js";
import { connect, defineType, instantiate, override, QtObject, slot } from "../../object.js";
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

// What a block's compiled component is for a page with a live shell.
export function $held(Block) {
  function Held(props) {
    const key = `${Block.name}#${props.$self?.$id ?? props.objectName ?? ""}`;
    let block = instances.get(key);
    if (!block) instances.set(key, (block = instantiate(Block, {}, null, null).object));
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
