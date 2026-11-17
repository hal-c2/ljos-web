// A pool of async tasks with a bound on how many run at once: a site's
// prerenders and a docs build's compiler checks are many short processes
// each, and one at a time leaves every core but one idle.
import { availableParallelism } from "node:os";

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

// As many as the machine runs at once and has `each` bytes of memory
// free for, and never fewer than one. Free, not total: memory other
// work already holds (or a cgroup's limit, which Node reads) is not
// there for these to use.
export function fittingJobs(each, { cores = availableParallelism(), memory = process.availableMemory() } = {}) {
  return Math.max(1, Math.min(cores, Math.floor(memory / each)));
}
