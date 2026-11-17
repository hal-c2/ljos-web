// A pool of async tasks with a bound on how many run at once: a site's
// prerenders and a docs build's compiler checks are many short processes
// each, and one at a time leaves every core but one idle.
import { availableParallelism, totalmem } from "node:os";

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

// What this process could still be given, in bytes. Under a cgroup's
// limit Node's availableMemory() is the limit less all the cgroup
// holds, and that counts its page cache: the files a build has read
// and written, which the kernel takes back when memory is asked for.
// A long build fills it, and would be held to one job by memory it can
// have. So under a limit it is the limit less this process. With none
// (Node says 0, the largest number it has, or more than the machine
// holds) it is the machine's free memory, which leaves the cache out
// already.
export function freeMemory({
  limit = process.constrainedMemory(),
  available = process.availableMemory(),
  used = process.memoryUsage.rss(),
  total = totalmem(),
} = {}) {
  return limit > 0 && limit < total ? Math.max(0, limit - used) : available;
}

// As many as the machine runs at once and has `each` bytes of memory
// free for, and never fewer than one. Free, not total: memory other
// work already holds, or that a cgroup's limit keeps from it, is not
// there for these to use.
export function fittingJobs(each, { cores = availableParallelism(), memory = freeMemory() } = {}) {
  return Math.max(1, Math.min(cores, Math.floor(memory / each)));
}
