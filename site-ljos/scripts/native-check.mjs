// `mise run site:native --check`: ljos.dev on Ljós on the desktop, off-screen.
// It starts `ljos run --headless` with the inspector, waits for the front
// page, follows the header's links to a docs page and to the showcase as a
// reader would, and fails on anything the app logged that is an error,
// other than the gaps named below, each waiting on Ljós itself.
//
//   node native-check.mjs <ljos> <bundle dir> <site dir> <scratch dir>
import { spawn } from "node:child_process";
import { existsSync, readFileSync, openSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [ljos, bundle, site, scratch] = process.argv.slice(2);
if (!scratch) {
  console.error("native-check: node native-check.mjs <ljos> <bundle dir> <site dir> <scratch dir>");
  process.exit(2);
}
// A debug build makes the first page slowly; a wait this long is only ever
// reached when something is wrong.
const STEP_MS = Number(process.env.LJOS_SITE_NATIVE_STEP_MS || 90000);

// What Ljós at the pinned commit does not do yet, each with what it is
// waiting for. A line any of these match is told, never failed on.
const KNOWN = [
  // A TypeScript module's import of an ECMAScript module (Demos/logic/
  // stage.ts imports keys.mjs): ljos-ui's feat/ts-imports-mjs. Until then
  // the front page's agent poster shows its board without its log.
  /keys\.mjs/,
  /stage\.ts/,
  /AgentPoster\.qml:\d+: TypeError: Cannot call method 'argsText'/,
  // Flickable.acceptedButtons (Qt 6.9): the same branch.
  /acceptedButtons/,
  // A debug build's turns are slow; the budget is a release build's.
  /a turn of the UI thread took/,
];
const FAILS = /error|unable to|is not available|could not|cannot|binding loop|unhandled/i;

mkdirSync(scratch, { recursive: true });
const logPath = join(scratch, "ljos.log");
const log = openSync(logPath, "w");
const app = spawn(
  ljos,
  ["run", "--headless", "--size", "1280x800", "--mcp=inspect,input", "--mcp-rate", "200", join(bundle, "Main.qml"), "--", `--site=${site}`],
  { cwd: scratch, stdio: ["ignore", log, log], env: { ...process.env, QML_XHR_ALLOW_FILE_READ: "1" } },
);
let exited = null;
app.on("exit", (code, signal) => (exited = signal || code));

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(what, test) {
  const end = Date.now() + STEP_MS;
  for (;;) {
    if (exited !== null) throw new Error(`ljos ended (${exited}) while waiting for ${what}; its log is ${logPath}`);
    const got = await test();
    if (got) return got;
    if (Date.now() > end) throw new Error(`no ${what} after ${STEP_MS} ms; its log is ${logPath}`);
    await sleep(500);
  }
}

const tokenFile = join(scratch, "target", "ljos", `mcp-${app.pid}.json`);
let session = null;
async function call(name, args) {
  const { url, token } = JSON.parse(readFileSync(tokenFile, "utf8"));
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  if (!session) {
    const init = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "site-native-check", version: "1" } } }),
    });
    session = init.headers.get("mcp-session-id") || "";
    await init.text();
  }
  if (session) headers["Mcp-Session-Id"] = session;
  const answer = await fetch(url, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
  const body = await answer.json();
  return body.result?.content?.[0]?.text ?? JSON.stringify(body);
}
async function find(locator) {
  const text = await call("app_find", { locator });
  const ref = /\[(e\d+)\]/.exec(text);
  return ref ? ref[1] : null;
}

let failed = false;
try {
  await until("inspector", () => existsSync(tokenFile));
  await until("front page", () => find("text=Software you can reshape"));
  console.log("site:native: the front page is up");
  await call("app_click", { target: await find("text=Docs >> nth=0") });
  await until("docs page", () => find("text=What is Ljós?"));
  console.log("site:native: a docs page is up");
  await call("app_click", { target: await find("text=Showcase >> nth=0") });
  await until("showcase", () => find("text=Built with Ljós"));
  console.log("site:native: the showcase is up");
  // Each shell in turn, picked from the header's switcher as a reader
  // picks it, with the showcase still standing in it.
  let current = "Elegant";
  for (const shell of ["Cyberpunk", "Workbench", "Desktop", "Elegant"]) {
    // A shell with no room in its header for the shell's name has the
    // compact switcher, named for what it does.
    const switcher = await until("the shell switcher", async () => (await find(`role=button[name="Current shell: ${current}"] >> nth=0`)) || find(`role=button[name="Switch shell"] >> nth=0`));
    await call("app_click", { target: switcher });
    const choice = await until(`the ${shell} choice`, async () => (await find(`role=radio[name="${shell}"]`)) || find(`role=radiobutton[name="${shell}"]`));
    await call("app_click", { target: choice });
    // The switcher names the shell; where it is compact, a part only
    // that shell has (Shells/*.qml) shows it is on.
    const mark = { Workbench: `[name="Explorer"]`, Desktop: `[name="Menu bar"]` }[shell] || `role=button[name="Current shell: ${shell}"]`;
    await until(`the ${shell} shell`, () => find(mark));
    await until(`the showcase in the ${shell} shell`, () => find("text=Built with Ljós"));
    console.log(`site:native: the ${shell} shell is up`);
    current = shell;
  }
} catch (error) {
  console.error(`site:native: ${error.message}`);
  failed = true;
}
if (exited === null) {
  app.kill("SIGTERM");
  await until("ljos to end", () => exited !== null).catch(() => app.kill("SIGKILL"));
}

// Each logged item from its first line; its stack lines go with it.
const lines = readFileSync(logPath, "utf8").split("\n");
const told = [];
for (const line of lines) {
  if (/^\S/.test(line) && FAILS.test(line)) told.push(line);
}
const known = told.filter((line) => KNOWN.some((gap) => gap.test(line)));
const errors = told.filter((line) => !KNOWN.some((gap) => gap.test(line)));
if (known.length > 0) console.log(`site:native: ${known.length} logged lines are known gaps in Ljós (scripts/native-check.mjs names them)`);
for (const line of errors) console.error(`site:native: logged: ${line}`);
if (errors.length > 0) failed = true;
process.exit(failed ? 1 : 0);
