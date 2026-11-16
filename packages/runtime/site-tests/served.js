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

// The servers of the test running now, and the parts it has run.
const servers = new Set();
let parts = [];

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

// One part of a test, as a step the report names and times.
export function part(title, run) {
  const at = { title, since: Date.now(), took: null };
  parts.push(at);
  return test.step(title, async () => {
    try {
      return await run();
    } finally {
      at.took = Date.now() - at.since;
    }
  });
}

// What a test that did not pass was waiting for, as text.
function stalled() {
  const now = Date.now();
  const lines = parts.map(({ title, since, took }) => (took === null ? `${title}: unfinished after ${now - since} ms` : `${title}: ${took} ms`));
  for (const server of servers) lines.push(`server ${server.state()}`);
  const waits = process.getActiveResourcesInfo().reduce((count, name) => count.set(name, (count.get(name) ?? 0) + 1), new Map());
  lines.push(`Node waits on: ${[...waits].map(([name, n]) => `${name} ×${n}`).join(", ") || "nothing"}`);
  return lines;
}

export const test = base.extend({
  stalls: [
    async ({}, use, testInfo) => {
      parts = [];
      // A server from a `beforeAll` serves every test of its group; only
      // what this test started is this test's to stop.
      const shared = new Set(servers);
      const delay = monitorEventLoopDelay({ resolution: 20 });
      delay.enable();
      // Read just before the time runs out, while the page and what it
      // asked for are still there: after it, the page is closed first.
      let late = null;
      const near = testInfo.timeout > 0 ? setTimeout(() => (late = stalled()), Math.max(testInfo.timeout - NEAR, 0)) : null;
      near?.unref();
      await use();
      clearTimeout(near);
      delay.disable();
      if (testInfo.status !== testInfo.expectedStatus) {
        const lines = [...(late ? [`${NEAR / 1000} s before the time ran out:`, ...late, "", "after:"] : []), ...stalled()];
        lines.push(`Node was kept from its event loop for up to ${Math.round(delay.max / 1e6)} ms at a time`);
        const body = lines.join("\n");
        await testInfo.attach("where it stopped", { body, contentType: "text/plain" });
        // The report shows an attachment's first lines only.
        console.error(`${testInfo.titlePath.join(" › ")}: where it stopped\n${body}`);
      }
      // A server a stalled test left listening, closed so that it holds
      // nothing of the next test's.
      await Promise.all([...servers].filter((server) => !shared.has(server)).map((server) => server.stop()));
    },
    { auto: true },
  ],
});
