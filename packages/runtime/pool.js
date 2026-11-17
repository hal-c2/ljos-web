// A pool of async tasks with a bound on how many run at once: a site's
// prerenders and a docs build's compiler checks are many short processes
// each, and one at a time leaves every core but one idle.

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
