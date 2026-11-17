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

// The cgroup (v2) whose limit holds this process: its own, or the
// nearest above it that sets one. `held` is what every process in it
// holds, less the file cache it could drop (inactive_file), which the
// kernel takes back before it refuses anyone. Null when nothing up to
// the root sets a limit, or there is no cgroup v2 to read (another
// system, or cgroup v1): then the machine's own free memory is all
// there is to go by.
export function cgroupMemory({ root = "/sys/fs/cgroup", self = "/proc/self/cgroup" } = {}) {
  const read = (path) => {
    try {
      return readFileSync(path, "utf8").trim();
    } catch {
      return undefined;
    }
  };
  const path = /^0::(\/.*)$/m.exec(read(self) ?? "")?.[1];
  if (path === undefined) return null;
  for (let at = path; ; at = posix.dirname(at)) {
    const max = read(join(root, at, "memory.max"));
    if (max !== undefined && max !== "max") {
      const current = Number(read(join(root, at, "memory.current")));
      const inactive = Number(/^inactive_file (\d+)$/m.exec(read(join(root, at, "memory.stat")) ?? "")?.[1]);
      return Number.isFinite(current) && Number.isFinite(inactive) ? { limit: Number(max), held: current - inactive } : null;
    }
    if (at === "/") return null;
  }
}

// What this process could still be given, in bytes. Under a cgroup's
// limit, Node's availableMemory() is the limit less memory.current, and
// that counts the page cache: the files a build has read and written.
// A long build fills it, and would be held to one job by memory it can
// have. So under a limit it is the limit less what the cgroup's
// processes hold (cgroupMemory), and never more than the machine has
// free. With none, or one above the machine's memory, it is
// availableMemory(), the machine's free memory, which leaves the cache
// out already.
export function freeMemory({ cgroup = cgroupMemory(), free = freemem(), available = process.availableMemory(), total = totalmem() } = {}) {
  return cgroup !== null && cgroup.limit < total ? Math.min(free, Math.max(0, cgroup.limit - cgroup.held)) : available;
}

// As many as the machine runs at once and has `each` bytes of memory
// free for, and never fewer than one. Free, not total: memory other
// work already holds, or that a cgroup's limit keeps from it, is not
// there for these to use.
export function fittingJobs(each, { cores = availableParallelism(), memory = freeMemory() } = {}) {
  return Math.max(1, Math.min(cores, Math.floor(memory / each)));
}
