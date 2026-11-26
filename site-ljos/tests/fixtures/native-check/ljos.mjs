#!/usr/bin/env node
// A stand-in for `ljos run --headless --mcp=inspect,input` that
// native-check.mjs can follow: its inspector finds what the check looks
// for, and leaves the requests NATIVE_FAKE_DROP names unanswered, as the
// pinned ljos's inspector now and then does while the app is idle.
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const drop = new Set((process.env.NATIVE_FAKE_DROP || "").split(",").filter(Boolean));
const token = "fake";
let typed = false;
let sessions = 0;
const asked = new Map();
const server = createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    const { id, method, params } = JSON.parse(body);
    if (method === "initialize") {
      response.writeHead(200, { "content-type": "application/json", "mcp-session-id": `s${++sessions}` });
      return response.end(JSON.stringify({ jsonrpc: "2.0", id, result: {} }));
    }
    const { name, arguments: args } = params;
    const key = `${name} ${args.locator ?? ""}`;
    const times = (asked.get(key) ?? 0) + 1;
    asked.set(key, times);
    // Only a request's first ask is left unanswered; the connection
    // stays open, as a dropped reply's does.
    if (times === 1 && drop.has(key)) return console.log(`fake: left "${key}" unanswered`);
    let text = "ok";
    if (name === "app_type") typed = true;
    if (name === "app_find") {
      const results = args.locator.startsWith(`role=list[name="Search results"]`);
      text = results && !typed ? "no match" : results ? `- listitem "Item model" [e5]` : `- found [e1]`;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }] } }));
  });
});
server.listen(0, "127.0.0.1", () => {
  mkdirSync(join("target", "ljos"), { recursive: true });
  writeFileSync(join("target", "ljos", `mcp-${process.pid}.json`), JSON.stringify({ url: `http://127.0.0.1:${server.address().port}/mcp`, token }));
});
process.on("SIGTERM", () => process.exit(0));
