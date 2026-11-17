// A prerendered site's renders — every page at every size in every
// scheme, each in a Node process of its own — are run several at once,
// and the site they make is the same, byte for byte, however many ran
// at once: the renders are put back in the order one at a time made
// them before anything is written.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import { askedJobs, cgroupMemory, fittingJobs, freeMemory } from "../pool.js";
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
    expect(() => siteJobs({ LJOS_SITE_JOBS: wrong })).toThrow(SiteError);
  }
});

test("every pool reads its variable the same way, and by default fits the memory that is free, not the machine's", () => {
  const GiB = 1024 ** 3;
  expect(askedJobs({}, "LJOS_PRERENDER_JOBS")).toBeUndefined();
  expect(askedJobs({ LJOS_PRERENDER_JOBS: "" }, "LJOS_PRERENDER_JOBS")).toBeUndefined();
  expect(askedJobs({ LJOS_PRERENDER_JOBS: "6" }, "LJOS_PRERENDER_JOBS")).toBe(6);
  for (const wrong of ["0", "1.5", "many"]) {
    expect(() => askedJobs({ LJOS_PRERENDER_JOBS: wrong }, "LJOS_PRERENDER_JOBS")).toThrow(`LJOS_PRERENDER_JOBS is "${wrong}"`);
  }
  expect(fittingJobs(2 * GiB, { cores: 16, memory: 9 * GiB })).toBe(4);
  expect(fittingJobs(2 * GiB, { cores: 16, memory: GiB })).toBe(1);
  // By default the memory is what this process could still be given
  // (freeMemory, below). Whatever this machine has free just now, it
  // has room for a byte each and none for an exabyte, so neither
  // answer turns on when it is read.
  expect(fittingJobs(1, { cores: 3 })).toBe(3);
  expect(fittingJobs(2 ** 60, { cores: 3 })).toBe(1);
});

test("under a cgroup's limit, what every process in it holds counts, and the page cache it filled does not", () => {
  const GiB = 1024 ** 3;
  // Node's availableMemory() there is the limit less memory.current,
  // and that counts the files read and written: 14 GiB of 16 held, 6 of
  // it cache. The cgroup's processes, this one and the others, hold 8.
  const limited = { cgroup: { limit: 16 * GiB, held: 8 * GiB }, free: 40 * GiB, available: 2 * GiB, total: 64 * GiB };
  expect(freeMemory(limited)).toBe(8 * GiB);
  expect(fittingJobs(2 * GiB, { cores: 32, memory: freeMemory(limited) })).toBe(4);
  // A cgroup at its limit has none, and still runs one.
  expect(freeMemory({ ...limited, cgroup: { limit: 16 * GiB, held: 17 * GiB } })).toBe(0);
  // Nor is more than the machine has free there, whatever the limit.
  expect(freeMemory({ ...limited, free: 3 * GiB })).toBe(3 * GiB);
  // No limit, or one above the machine's memory: the machine's free
  // memory, which leaves the cache out already, is what there is.
  expect(freeMemory({ ...limited, cgroup: null })).toBe(2 * GiB);
  expect(freeMemory({ ...limited, cgroup: { limit: 128 * GiB, held: GiB } })).toBe(2 * GiB);
  expect(freeMemory()).toBeGreaterThan(0);
});

test("the cgroup read is the nearest one with a limit, all it holds less its inactive file cache", () => {
  const GiB = 1024 ** 3;
  const root = mkdtempSync(join(tmpdir(), "cgroup-"));
  const self = join(root, "self");
  const group = (path, files) => {
    mkdirSync(join(root, path), { recursive: true });
    for (const [name, text] of Object.entries(files)) writeFileSync(join(root, path, name), text);
  };
  const stat = (inactive) => `anon ${GiB}\nfile ${7 * GiB}\nactive_file ${GiB}\ninactive_file ${inactive}\n`;
  try {
    writeFileSync(self, "0::/build.slice/job.scope\n");
    group("build.slice", { "memory.max": `${16 * GiB}\n`, "memory.current": `${14 * GiB}\n`, "memory.stat": stat(6 * GiB) });
    // The process's own cgroup sets no limit: its parent's holds, and so
    // do the parent's numbers, siblings and all.
    group("build.slice/job.scope", { "memory.max": "max\n", "memory.current": `${3 * GiB}\n`, "memory.stat": stat(GiB) });
    expect(cgroupMemory({ root, self })).toEqual({ limit: 16 * GiB, held: 8 * GiB });
    // Its own limit, when it has one, is the nearer.
    group("build.slice/job.scope", { "memory.max": `${4 * GiB}\n` });
    expect(cgroupMemory({ root, self })).toEqual({ limit: 4 * GiB, held: 2 * GiB });
    // No limit up to the root (which has no memory.max), no cgroup v2,
    // or one it cannot read: nothing to go by.
    group("build.slice/job.scope", { "memory.max": "max\n" });
    group("build.slice", { "memory.max": "max\n" });
    expect(cgroupMemory({ root, self })).toBeNull();
    writeFileSync(self, "12:memory:/build.slice\n");
    expect(cgroupMemory({ root, self })).toBeNull();
    expect(cgroupMemory({ root, self: join(root, "nowhere") })).toBeNull();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a build that renders nothing does not read LJOS_SITE_JOBS", async () => {
  const site = bundle("pages");
  const was = process.env.LJOS_SITE_JOBS;
  process.env.LJOS_SITE_JOBS = "0";
  try {
    await part("build it without prerenders", () => buildSite({ dir: site.dir, out: site.out, qmlc }));
    await expect(buildSite({ dir: site.dir, out: site.out, qmlc, prerender: { pages: [{ route: "/", title: "Home" }] } })).rejects.toThrow('LJOS_SITE_JOBS is "0"');
  } finally {
    if (was === undefined) delete process.env.LJOS_SITE_JOBS;
    else process.env.LJOS_SITE_JOBS = was;
    site.remove();
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
