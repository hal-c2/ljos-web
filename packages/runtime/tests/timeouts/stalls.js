import { test as base, phase } from "../open.js";

const test = base.extend({
  // As a page: what still waits on it is rejected when teardown closes it,
  // which is before `phases` says where the test was.
  stuck: async ({}, use) => {
    let close;
    const closed = new Promise((_, reject) => (close = () => reject(new Error("closed"))));
    closed.catch(() => {});
    await use(() => closed);
    close();
    await new Promise((settled) => setImmediate(settled));
  },
});

test("inside a part", async ({ stuck }) => {
  await phase("done", async () => {});
  await phase("failed", async () => {
    throw new Error("caught by the test");
  }).catch(() => {});
  await phase("waiting", stuck);
});

test("between parts", async ({ stuck }) => {
  await phase("done", async () => {});
  await stuck();
});
