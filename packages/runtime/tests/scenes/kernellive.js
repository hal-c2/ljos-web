// What nobody can reach any more: an element of a ListModel gone from it, a
// signal with no owner. The page's graph is to hold no node for them.
import { createMemo, createRoot } from "solid-js";
import { live, signal, WASM } from "#kernel";
import { flush } from "ljos-web/object";
import { Item, ListModel } from "ljos-web/QtQuick";
import { make } from "../scene.js";

const model = make(ListModel, {});

function churn() {
  for (let row = 0; row < 200; row++) model.append({ name: `row ${row}` });
  createRoot((dispose) => {
    for (let row = 0; row < 200; row++) {
      const memo = createMemo(() => model.get(row).name);
      memo();
    }
    dispose();
  });
  model.clear();
  for (let one = 0; one < 200; one++) {
    const [read, bump] = signal(0);
    createRoot((dispose) => {
      createMemo(() => read())();
      bump(1);
      dispose();
    });
  }
  flush();
}

export const objects = { churn, live: () => (WASM ? live() : 0) };

export default () => make(Item, { width: 10, height: 10 });
