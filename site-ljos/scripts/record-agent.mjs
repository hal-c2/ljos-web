// Records the agent-built demo's session (bundle/Demos/AgentBuiltDemo.qml):
// an agent's calls to Ljós's two MCP servers, `ljos mcp` (authoring) and
// `ljos run --mcp` (the running app's inspector), and what each answered,
// against the Dispatch app as it was before the agent came. The page
// replays the recording; nothing in it is written by hand.
//
//   node scripts/record-agent.mjs <path to a ljos binary> [ljos-ui commit]
//
// It starts from the recording's own `before` file, so a new ljos is
// recorded against the same app, and writes recordings/agent-built.json.
// `node scripts/agent-session.mjs` then makes the page's session from it.
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "../bundle/Demos/Dispatch");
const out = join(here, "../recordings/agent-built.json");
const [ljos, commit = "unknown"] = process.argv.slice(2);
if (!ljos) throw new Error("usage: node scripts/record-agent.mjs <ljos binary> [ljos-ui commit]");
const old = JSON.parse(readFileSync(out, "utf8"));

const dir = mkdtempSync(join(tmpdir(), "agent-built-"));
cpSync(app, dir, { recursive: true });
writeFileSync(join(dir, "DispatchCard.qml"), old.before);

// One MCP server over stdio, a JSON-RPC request per line.
function server(args) {
  const child = spawn(ljos, args, { cwd: dir, stdio: ["pipe", "pipe", "inherit"] });
  const waiting = new Map();
  let next = 1;
  createInterface({ input: child.stdout }).on("line", (line) => {
    const message = JSON.parse(line);
    waiting.get(message.id)?.(message);
    waiting.delete(message.id);
  });
  const ask = (method, params) =>
    new Promise((resolve) => {
      const id = next++;
      waiting.set(id, resolve);
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  return {
    async init() {
      await ask("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "record-agent", version: "1" } });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    },
    async tools() {
      return (await ask("tools/list", {})).result.tools;
    },
    async call(name, args) {
      const reply = await ask("tools/call", { name, arguments: args });
      if (reply.error) return { error: reply.error };
      const text = (reply.result.content ?? []).filter((part) => part.type === "text").map((part) => part.text).join("\n");
      return { isError: reply.result.isError === true, text, structured: reply.result.structuredContent ?? null };
    },
    close: () => child.stdin.end(),
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const running = spawn(ljos, ["run", "--headless", "--mcp=inspect,input,mutate", "--watch", "Main.qml"], { cwd: dir, stdio: ["pipe", "inherit", "inherit"] });
const tokens = join(dir, "target/ljos");
for (let i = 0; i < 600 && !(existsSync(tokens) && readdirSync(tokens).some((name) => name.startsWith("mcp-"))); i++) await sleep(200);

const inspector = server(["attach", "."]);
const authoring = server(["mcp", "--project", ".", "--caps", "fs"]);
// The person at the app: a second client of the inspector, whose click
// is what the agent's `app_watch` waits for.
const person = server(["attach", "."]);
await inspector.init();
await authoring.init();
await person.init();
const listed = async (s) => (await s.tools()).map((tool) => ({ name: tool.name, args: Object.keys(tool.inputSchema?.properties ?? {}).sort() }));
const tools = { authoring: await listed(authoring), inspector: await listed(inspector) };

const steps = [];
const reader = [];
async function step(via, tool, args) {
  const answer = await (via === "authoring" ? authoring : inspector).call(tool, args);
  steps.push({ via, tool, args, answer });
  return answer;
}
async function by(tool, args) {
  const answer = await person.call(tool, args);
  reader.push({ tool, args, answer });
  return answer;
}

const button = ["Button {", "    id: openFilter", '    objectName: "openFilter"', "    text: t`Open only`", "    checkable: true", "    onToggled: ticketList.openOnly = checked", "}"].join("\n");
await step("authoring", "qml_edit_apply", { path: "DispatchCard.qml", edit: { op: "insert_object", parent: { id: "tools" }, index: 0, text: button }, write: true });
await step("authoring", "qml_check", { paths: ["DispatchCard.qml"] });
await step("inspector", "app_reload", {});
const found = await step("inspector", "app_find", { locator: 'role=button[name="Open only"]' });
const audit = await step("inspector", "app_audit", { root: "#ticketList", matrix: "full" });
// The first label it flagged, by where it is drawn: three share its id.
const flagged = audit.structured?.findings?.[0]?.bounds;
const at = flagged ? `at=${Math.round(flagged.x + flagged.width / 2)},${Math.round(flagged.y + flagged.height / 2)}` : "#stateText";
await step("inspector", "app_inspect", { target: at, dependencies: "color" });
await step("authoring", "qml_edit_apply", { path: "DispatchCard.qml", edit: { op: "set_binding", object: { id: "dispatch" }, name: "statusInk", value: "Theme.warningForeground" }, write: true });
await step("authoring", "qml_check", { paths: ["DispatchCard.qml"] });
await step("inspector", "app_reload", {});
await step("inspector", "app_audit", { root: "#ticketList", matrix: "full" });
await step("inspector", "app_click", { target: found.structured?.matches?.[0]?.ref ?? "#openFilter" });
await step("inspector", "app_snapshot", { root: "#card", depth: 2 });
const counted = await step("inspector", "app_watch", { topics: ["logs"] });
const logs = await inspector.call("app_logs", {});
const watching = step("inspector", "app_watch", { topics: ["logs"], since: counted.structured?.counts, wait_ms: 30000, settle_ms: 800 });
await sleep(1200);
await by("app_click", { target: "#crew-BG-415" });
await sleep(600);
const item = await by("app_find", { locator: "text=Katrín S." });
await by("app_click", { target: item.structured?.matches?.at(-1)?.ref });
await watching;
await step("inspector", "app_logs", { since: logs.structured?.next_since ?? 0, level: "info" });

const final = readFileSync(join(dir, "DispatchCard.qml"), "utf8");
inspector.close();
authoring.close();
person.close();
running.kill("SIGTERM");
// Where it ran is the recorder's own business: answers name the app's
// files from its folder.
const plain = (value) => JSON.parse(JSON.stringify(value).replaceAll(`file://${dir}/`, "").replaceAll(`${dir}/`, "").replaceAll(dir, "."));
const recording = {
  recorded: {
    on: new Date().toISOString().slice(0, 10),
    ljos: commit,
    commands: ["ljos run --headless --mcp=inspect,input,mutate --watch Main.qml", "ljos mcp --project . --caps fs", "ljos attach ."],
  },
  tools,
  before: old.before,
  final,
  steps: plain(steps),
  reader: plain(reader),
};
writeFileSync(out, JSON.stringify(recording, null, 2) + "\n");
rmSync(dir, { recursive: true, force: true });
process.exit(0);
