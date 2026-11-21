// What every site test serves its built site with, and what a test that
// runs out of time says about where it was.
//
// A test timeout alone names no part of the test when nothing the browser
// does is pending: a build, a server that will not listen or will not close
// are all Node's own, and the report says only that two minutes ran out.
// Each part here is a step of its own, and a test that runs out of time
// attaches what it was waiting for: the part it was in, every server's
// requests still in flight and connections still open, what Node itself
// still waits on, and how long Node's own work kept it from doing anything
// else (a child process run to its end, as the compiler is, holds it).
// A shared hook, which no test watches, is given by `shared` and says so
// 2 s before its time runs out, if it is still in a part. A hook that runs
// out of time is abandoned, never settled, so its watch ends without it.
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { test as base } from "@playwright/test";

export { expect } from "@playwright/test";

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".wasm": "application/wasm",
};

// How long before a test's time runs out what it waits for is read.
const NEAR = 2_000;

// Every server listening, and what is watched: a test's run, or a shared
// hook's (a `beforeEach` in a test), the latest last.
const servers = new Set();
const watching = [];

// A static server of `directory` at `below`, on a port of its own, so that
// tests run side by side. `headers(file)` gives a file's own headers.
// Resolves to the server, with `origin` its address, once it listens, and
// rejects if it cannot.
export function serve(directory, { below = "/", headers = () => ({}) } = {}) {
  const asked = new Map();
  const sockets = new Set();
  const server = createServer((request, response) => {
    asked.set(response, { url: request.url, since: Date.now() });
    response.on("close", () => asked.delete(response));
    const path = decodeURIComponent(new URL(request.url, "http://site").pathname);
    const within = path.startsWith(below) ? path.slice(below.length) : null;
    const file = within === null ? null : normalize(join(directory, within === "" || within.endsWith("/") ? `${within}index.html` : within));
    if (!file?.startsWith(directory) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", ...headers(file) }).end(readFileSync(file));
  });
  server.on("connection", (socket) => {
    const held = { since: Date.now() };
    sockets.add(held);
    socket.on("close", () => sockets.delete(held));
  });
  // What it is still doing, for a test that stalls.
  server.state = () => {
    const now = Date.now();
    const requests = [...asked.values()].map(({ url, since }) => `${url} for ${now - since} ms`);
    return `${server.origin ?? "not listening"}: ${sockets.size} connection(s) open, ${requests.length ? `in flight: ${requests.join(", ")}` : "no request in flight"}`;
  };
  // `close` waits for every connection to end, and the browser keeps one
  // open while it may ask again: a request in flight as it is called holds
  // `close` until the browser lets that connection go.
  server.stop = () =>
    new Promise((done) => {
      servers.delete(server);
      if (!server.listening) return done();
      server.closeAllConnections();
      server.close(() => done());
    });
  return new Promise((done, failed) => {
    server.once("error", failed);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", failed);
      server.origin = `http://127.0.0.1:${server.address().port}`;
      servers.add(server);
      done(server);
    });
  });
}

// One part of a test, or of a shared hook given by `shared`, as a step the
// report names and times. A part given a `timeout` fails on its own when
// that runs out, naming itself, and leaves the rest of the test's time to
// what follows it (a `finally` that stops a server, the report). `within`
// says where inside itself a part is, as text (a site build's own parts,
// `buildSite({ timings })`), for a part that does not end.
export function part(title, run, { timeout, within } = {}) {
  const watched = watching.at(-1);
  if (!watched) throw new Error(`part "${title}" runs outside a test and outside a hook given by shared(): nothing would say where it stalled`);
  const at = { title, since: Date.now(), took: null, within };
  watched.parts.push(at);
  return test.step(
    title,
    async () => {
      try {
        return await run();
      } finally {
        at.took = Date.now() - at.since;
      }
    },
    { timeout },
  ).catch((error) => {
    // Its own time ran out: the step's error says only that it did.
    if (at.took === null && within && error instanceof Error) error.message += `\n${title}, within: ${within()}`;
    throw error;
  });
}

// What a site build given `timings` has done so far, as `part`'s
// `within`: each part's milliseconds, and the one under way.
export const building = (timings) => () =>
  Object.entries(timings)
    .map(([name, took]) => (took === null ? `${name} under way` : `${name} ${took}`))
    .join(", ") || "not started";

// A shared hook (`beforeAll`, `afterAll`), watched from its start: no
// test's fixture runs around it, so it is its own. Its body is one part,
// `title`, and the parts in it say which step it was in.
//
// A hook has a time of its own, not its test's: the project's timeout,
// which `test.info().timeout` does not give (that is the test's, which
// `describe.configure` or `test.slow` change). A hook that needs another
// says so here, as `timeout`, rather than with `test.setTimeout`, which
// would change it where the watch cannot see.
//
// A hook that runs out of time is left pending: its `finally` never runs.
// Its watch ends without it, so that what runs next in the worker (an
// `afterAll` runs after its `beforeAll` timed out) is not read as the
// stalled hook's, and its event-loop monitor stops: when the next hook or
// test starts, as a worker runs one hook at a time and no test inside one,
// or else when the hook's time is over.
export function shared(title, run, { timeout } = {}) {
  return async () => {
    const info = test.info();
    if (timeout !== undefined) test.setTimeout(timeout);
    const mine = watch(info, { hook: true, timeout: timeout ?? info.project.timeout });
    try {
      return await part(title, run);
    } finally {
      end(mine);
    }
  };
}

// What runs for `info`: its parts, and how long Node's own work kept it
// from its event loop; `late` is what it waited for read 2 s before its
// time runs out, while the page and what it asked for are still there.
function watch(info, { hook = false, timeout = info.timeout } = {}) {
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  const watch = { parts: [], delay, late: null, near: null, over: null, hook };
  for (const left of watching.filter((other) => other.hook || !hook)) end(left);
  watching.push(watch);
  if (hook && timeout > 0) {
    // Playwright's own timer for the hook started before this one, so this
    // rings once the hook has been abandoned, never while it still runs.
    // It holds nothing open: a worker with nothing else to do may end.
    watch.over = setTimeout(() => end(watch), timeout);
    watch.over.unref();
  }
  if (timeout > 0) {
    watch.near = setTimeout(() => {
      watch.late = stalled(watch);
      // A hook that runs out of time is ended where it is, with no fixture
      // after it to tell, so it tells now, if it is still in a part.
      if (hook && watch.parts.some(({ took }) => took === null)) {
        console.error(`${info.titlePath.join(" › ")}, a shared hook: ${NEAR / 1000} s before its time runs out\n${watch.late.join("\n")}`);
      }
    }, Math.max(timeout - NEAR, 0));
    watch.near.unref();
  }
  return watch;
}

// `watch` is over: it leaves the list, and its timers and monitor stop.
// Ending it twice does nothing.
function end(watch) {
  const at = watching.indexOf(watch);
  if (at !== -1) watching.splice(at, 1);
  clearTimeout(watch.near);
  clearTimeout(watch.over);
  watch.delay.disable();
}

// What a test that did not pass was waiting for, as text.
function stalled(watch) {
  const now = Date.now();
  const lines = watch.parts.map(({ title, since, took, within }) =>
    took === null ? `${title}: unfinished after ${now - since} ms${within ? ` (${within()})` : ""}` : `${title}: ${took} ms`,
  );
  for (const server of servers) lines.push(`server ${server.state()}`);
  const waits = process.getActiveResourcesInfo().reduce((count, name) => count.set(name, (count.get(name) ?? 0) + 1), new Map());
  lines.push(`Node waits on: ${[...waits].map(([name, n]) => `${name} ×${n}`).join(", ") || "nothing"}`);
  lines.push(`Node was kept from its event loop for up to ${Math.round(watch.delay.max / 1e6)} ms at a time`);
  return lines;
}

export const test = base.extend({
  stalls: [
    async ({}, use, testInfo) => {
      // A server from a `beforeAll` serves every test of its group; only
      // what this test started is this test's to stop.
      const shared = new Set(servers);
      const mine = watch(testInfo);
      try {
        await use();
      } finally {
        // Its monitor is read below, so it stops after.
        const at = watching.indexOf(mine);
        if (at !== -1) watching.splice(at, 1);
        clearTimeout(mine.near);
      }
      if (testInfo.status !== testInfo.expectedStatus) {
        const lines = [...(mine.late ? [`${NEAR / 1000} s before the time ran out:`, ...mine.late, "", "after:"] : []), ...stalled(mine)];
        const body = lines.join("\n");
        await testInfo.attach("where it stopped", { body, contentType: "text/plain" });
        // The report shows an attachment's first lines only.
        console.error(`${testInfo.titlePath.join(" › ")}: where it stopped\n${body}`);
      }
      end(mine);
      // A server a stalled test left listening, closed so that it holds
      // nothing of the next test's.
      await Promise.all([...servers].filter((server) => !shared.has(server)).map((server) => server.stop()));
    },
    { auto: true },
  ],
});
