// A pool of async tasks with a bound on how many run at once: a site's
// prerenders and a docs build's compiler checks are many short processes
// each, and one at a time leaves every core but one idle.
import { readFileSync } from "node:fs";
import { availableParallelism, freemem, totalmem } from "node:os";
import { join, posix } from "node:path";

// Each of `tasks` run, at most `jobs` at once, its results in the tasks'
// order whatever order they end in. A task is given a signal that says
// to stop. The first to fail starts no more, signals those running to
// stop, and is what is thrown once they have ended: nothing is left
// running into whatever the caller does next (the build removes the
// stage the renders read).
export async function pooled(tasks, jobs) {
  const results = new Array(tasks.length);
  const stop = new AbortController();
  let next = 0;
  let failed = null;
  const worker = async () => {
    while (failed === null && next < tasks.length) {
      const at = next++;
      try {
        results[at] = await tasks[at](stop.signal);
      } catch (error) {
        if (failed === null) {
          failed = { error };
          stop.abort();
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, tasks.length) }, worker));
  if (failed !== null) throw failed.error;
  return results;
}

// How many `name` in `env` asks to run at once, or undefined when it is
// unset or empty and the caller's default stands. Anything else but a
// whole number from 1 is refused rather than read as the default: a
// build should not quietly run at a pace nobody chose.
export function askedJobs(env, name) {
  const asked = env[name];
  if (asked === undefined || asked === "") return undefined;
  const jobs = Number(asked);
  if (!Number.isInteger(jobs) || jobs < 1) throw new RangeError(`${name} is ${JSON.stringify(asked)}; give how many may run at once, a whole number from 1`);
  return jobs;
}

// How much more this process's cgroup (v2) tree lets it have, in
// bytes, or null when no limit holds it. Every cgroup from its own up
// to the root may set one (memory.max, or memory.high, where the kernel
// starts to throttle), and each covers all its processes, so the room
// is the least any of them leaves. What a cgroup holds is
// memory.current less inactive_file, the file cache the kernel drops
// before it refuses anyone. A limit above the machine's memory never
// holds before the machine does. Null too without cgroup v2 (another
// system, or v1): then the machine's free memory is all there is to go
// by.
export function cgroupHeadroom({ root = "/sys/fs/cgroup", self = "/proc/self/cgroup", total = totalmem() } = {}) {
  const read = (path) => {
    try {
      return readFileSync(path, "utf8").trim();
    } catch {
      return undefined;
    }
  };
  const path = /^0::(\/.*)$/m.exec(read(self) ?? "")?.[1];
  if (path === undefined) return null;
  let room = null;
  // The most any cgroup below this one is known to hold: every cgroup
  // holds at least what those in it hold.
  let heldBelow = null;
  for (let at = path; ; at = posix.dirname(at)) {
    const limits = ["memory.max", "memory.high"].map((name) => Number(read(join(root, at, name)))).filter((limit) => limit < total);
    if (limits.length > 0) {
      const current = Number(read(join(root, at, "memory.current")));
      const inactive = Number(/^inactive_file (\d+)$/m.exec(read(join(root, at, "memory.stat")) ?? "")?.[1]);
      // A limit whose use cannot be read is not guessed at: it leaves
      // no more than itself less what is known to be held in it, and
      // with nothing known, takes nothing from the others' room.
      const held = Number.isFinite(current) && Number.isFinite(inactive) ? current - inactive : heldBelow;
      if (held !== null) {
        const left = Math.min(...limits) - held;
        room = room === null ? left : Math.min(room, left);
        heldBelow = Math.max(heldBelow ?? 0, held);
      }
    }
    if (at === "/") return room;
  }
}

// What this process could still be given, in bytes. Under a cgroup's
// limit, Node's availableMemory() is the nearest limit less its
// memory.current, and that counts the page cache: the files a build has
// read and written. A long build fills it, and would be held to one job
// by memory it can have. So under a limit it is the room the cgroup
// tree leaves (cgroupHeadroom), and never more than the machine has
// free. With none it is availableMemory(), the machine's free memory,
// which leaves the cache out already.
export function freeMemory({ headroom = cgroupHeadroom(), free = freemem(), available = process.availableMemory() } = {}) {
  return headroom !== null ? Math.min(free, Math.max(0, headroom)) : available;
}

// As many as the machine runs at once and has `each` bytes of memory
// free for, and never fewer than one. Free, not total: memory other
// work already holds, or that a cgroup's limit keeps from it, is not
// there for these to use.
export function fittingJobs(each, { cores = availableParallelism(), memory = freeMemory() } = {}) {
  return Math.max(1, Math.min(cores, Math.floor(memory / each)));
}
