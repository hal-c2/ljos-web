// Which item takes the pointer events of an element, and the root a click
// is made in. It imports nothing, so what asks these (inspect.js) does not
// carry pointer delivery, its clock and its keys with it: they stay in the
// chunks of the items that use them.

// Each element's item, as pointer.js's `receive` records it.
export const receivers = new WeakMap();

// The item an element takes pointer events for, if it takes any.
export const receiverOf = (node) => receivers.get(node) ?? null;

// Whether `item` is `root` or in it: through its parents, and a popup's
// item, whose parent is its window's overlay while it is open, through the
// popup to what it is in.
export function inRoot(item, root) {
  for (let up = item; up; up = up.$popup ? up.$popup.parent : up.parent) if (up === root) return true;
  return false;
}

// The root a click is asked of while it is made (inspect's `click`), or
// null for a person's. What that click is outside of but not in that root,
// a popup the page holds the root in has open, does not hear it.
let driven = null;
export const drivenRoot = () => driven;
export function driving(root, make) {
  const was = driven;
  driven = root;
  try {
    return make();
  } finally {
    driven = was;
  }
}

