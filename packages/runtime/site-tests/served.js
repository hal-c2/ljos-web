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
// A shared hook's parts, which no test watches, say so 2 s before the
// hook's time runs out.
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

// Every server listening, and what is watched now: a test's run, or a
// shared hook's (`watch`).
const servers = new Set();
let watched = null;
const hooks = new WeakMap();

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

// One part of a test, as a step the report names and times. A part of a
// shared hook (`beforeAll`, `afterAll`), which no test's fixture watches,
// is watched by the hook's own watch.
export function part(title, run) {
  const watch = watched ?? hookWatch();
  const at = { title, since: Date.now(), took: null };
  watch.parts.push(at);
  return test.step(title, async () => {
    try {
      return await run();
    } finally {
      at.took = Date.now() - at.since;
    }
  });
}

// What runs for `info`: its parts, and how long Node's own work kept it
// from its event loop; `late` is what it waited for read 2 s before its
// time runs out, while the page and what it asked for are still there.
function watch(info, { hook = false } = {}) {
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  const watch = { parts: [], delay, late: null, near: null };
  if (info.timeout > 0) {
    watch.near = setTimeout(() => {
      watch.late = stalled(watch);
      // A hook that runs out of time is ended where it is, with no fixture
      // after it to tell, so it tells now, if it is still in a part.
      if (hook && watch.parts.some(({ took }) => took === null)) {
        console.error(`${info.titlePath.join(" › ")}, a shared hook: ${NEAR / 1000} s before its time runs out\n${watch.late.join("\n")}`);
      }
      if (hook) delay.disable();
    }, Math.max(info.timeout - NEAR, 0));
    watch.near.unref();
  }
  return watch;
}

// A hook's watch, from its first part, which is near when it starts.
function hookWatch() {
  const info = test.info();
  let found = hooks.get(info);
  if (!found) hooks.set(info, (found = watch(info, { hook: true })));
  return found;
}

// What a test that did not pass was waiting for, as text.
function stalled(watch) {
  const now = Date.now();
  const lines = watch.parts.map(({ title, since, took }) => (took === null ? `${title}: unfinished after ${now - since} ms` : `${title}: ${took} ms`));
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
      const mine = (watched = watch(testInfo));
      try {
        await use();
      } finally {
        watched = null;
        clearTimeout(mine.near);
      }
      if (testInfo.status !== testInfo.expectedStatus) {
        const lines = [...(mine.late ? [`${NEAR / 1000} s before the time ran out:`, ...mine.late, "", "after:"] : []), ...stalled(mine)];
        const body = lines.join("\n");
        await testInfo.attach("where it stopped", { body, contentType: "text/plain" });
        // The report shows an attachment's first lines only.
        console.error(`${testInfo.titlePath.join(" › ")}: where it stopped\n${body}`);
      }
      mine.delay.disable();
      // A server a stalled test left listening, closed so that it holds
      // nothing of the next test's.
      await Promise.all([...servers].filter((server) => !shared.has(server)).map((server) => server.stop()));
    },
    { auto: true },
  ],
});
