// A node's number, handed out again after the node is gone, while what held
// the old number still reads and touches it late.
import { createMemo, createRoot, getOwner } from "solid-js";
import { cell, read, touch, WASM } from "#kernel";
import { flush } from "ljos-web/object";
import { Item } from "ljos-web/QtQuick";
import { make } from "../scene.js";

function reuse() {
  if (!WASM) return null;
  let old;
  createRoot((dispose) => {
    old = cell(getOwner());
    dispose();
  });
  flush();
  // Read late under a Solid computation, before and after its number is
  // reused.
  const late = createRoot(() => createMemo(() => (read(old, null), 0)));
  late();
  let runs = 0;
  const now = cell(null);
  const reader = createRoot(() =>
    createMemo(() => {
      read(now, null);
      return ++runs;
    }),
  );
  const seen = [reader()];
  touch(now);
  flush();
  seen.push(reader());
  // A late touch is nothing: it is not the node that now has the number.
  touch(old);
  flush();
  seen.push(reader());
  return { reused: old >>> 0 === now >>> 0, distinct: old !== now, seen };
}

export const objects = { reuse };

export default () => make(Item, { width: 10, height: 10 });
