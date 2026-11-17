// A prerendered site's renders — every page at every size in every
// scheme, each in a Node process of its own — are run several at once,
// and the site they make is the same, byte for byte, however many ran
// at once: the renders are put back in the order one at a time made
// them before anything is written.
import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { buildSite, pooled, siteJobs, SiteError } from "../site.js";
import { bundle, qmlc } from "./bundle.js";
import { expect, part, test } from "./served.js";

const later = (ms) => new Promise((done) => setTimeout(done, ms));

test("the pool keeps the tasks' order and runs as many at once as it is given", async () => {
  let running = 0;
  let most = 0;
  // The later tasks end first, so an order taken from when each ended
  // would be the wrong one.
  const tasks = Array.from({ length: 9 }, (_, at) => async () => {
    running += 1;
    most = Math.max(most, running);
    await later(5 * (9 - at));
    running -= 1;
    return at;
  });
  expect(await pooled(tasks, 4)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  expect(most).toBe(4);
  most = 0;
  expect(await pooled(tasks, 1)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  expect(most).toBe(1);
  expect(await pooled([], 4)).toEqual([]);
});

test("a task that fails stops the pool: nothing more starts, the running are told to stop, and its error is thrown", async () => {
  const started = [];
  const stopped = [];
  const tasks = Array.from({ length: 8 }, (_, at) => (signal) => {
    started.push(at);
    if (at === 1) return Promise.reject(new SiteError("page 1 could not be prerendered"));
    return new Promise((done, fail) => {
      const timer = setTimeout(() => done(at), 2_000);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        stopped.push(at);
        fail(new Error(`task ${at} was stopped`));
      });
    });
  });
  await expect(pooled(tasks, 3)).rejects.toThrow("page 1 could not be prerendered");
  expect(started).toEqual([0, 1, 2]);
  expect(stopped.sort()).toEqual([0, 2]);
});

test("LJOS_SITE_JOBS says how many renders run at once; by default, as many as the machine runs and has the memory for", () => {
  const GiB = 1024 ** 3;
  const roomy = { cores: 32, memory: 64 * GiB };
  expect(siteJobs({}, roomy)).toBe(32);
  expect(siteJobs({ LJOS_SITE_JOBS: "" }, roomy)).toBe(32);
  // A build held to 14 GiB (a cgroup's limit, which Node reads) runs
  // no more renders than fit in it, nor fewer than one.
  expect(siteJobs({}, { cores: 32, memory: 14 * GiB })).toBe(14);
  expect(siteJobs({}, { cores: 4, memory: 0.5 * GiB })).toBe(1);
  expect(siteJobs({})).toBeGreaterThanOrEqual(1);
  expect(siteJobs({})).toBeLessThanOrEqual(availableParallelism());
  // What is asked for is what runs, whatever the machine.
  expect(siteJobs({ LJOS_SITE_JOBS: "3" }, { cores: 1, memory: GiB })).toBe(3);
  for (const wrong of ["0", "-2", "1.5", "many"]) {
    expect(() => siteJobs({ LJOS_SITE_JOBS: wrong })).toThrow(`LJOS_SITE_JOBS is "${wrong}"`);
  }
});

test("a site built with renders run at once is the site built with one at a time", async () => {
  const pages = {
    sizes: [
      { width: 390, height: 844 },
      { width: 1200, height: 800, from: 800 },
    ],
    schemes: ["light", "dark"],
    pages: [
      { route: "/", title: "Home — Pages", props: { route: "/" } },
      { route: "/docs/", title: "Docs — Pages", props: { route: "/docs/" } },
      { route: "/docs/more/", title: "More — Pages", props: { route: "/docs/more/" } },
    ],
  };
  const one = bundle("pages");
  const many = bundle("pages");
  try {
    const alone = await part("build it one render at a time", () => buildSite({ dir: one.dir, out: one.out, qmlc, prerender: pages, jobs: 1 }));
    const together = await part("build it with renders at once", () => buildSite({ dir: many.dir, out: many.out, qmlc, prerender: pages, jobs: 5 }));
    expect(together.files).toEqual(alone.files);
    expect(together.bytes).toBe(alone.bytes);
    for (const file of alone.files) {
      expect(readFileSync(join(many.out, file)).equals(readFileSync(join(one.out, file))), file).toBe(true);
    }
  } finally {
    one.remove();
    many.remove();
  }
});
