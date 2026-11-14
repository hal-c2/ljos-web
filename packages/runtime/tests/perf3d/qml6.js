// The same scenes in Qt's own runtime, natively: `qml6.json` beside the
// results, which `table.js` puts in the table under ljos-web's numbers.
// Qt for WebAssembly is not here to measure in a browser, so this is the
// desktop qml6 on the same machine and GPU.
//
//   LJOS_PERF3D_QML6_RUN="<ljos-ui>/scripts/cua-sandbox.sh exec" node qml6.js [scene…]
//
// `LJOS_PERF3D_QML6_RUN` is a command that runs what follows it off the
// user's screen (ljos-ui's headless sway; with LJOS_CUA_GPU on the GPU).
// Each scene runs once to warm Qt's caches, then again to be measured: its
// scene graph's own timing (qt.scenegraph.time.renderloop) for the frames,
// the process's CPU and resident memory from /proc, and a screenshot of its
// window (the screen, cut to the window by ImageMagick where it is there). qml6 has no clock to stop, so what it does standing still is
// measured on a scene with nothing animating (`still.qml`).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, loadavg } from "node:os";
import { join } from "node:path";

const OUT = process.env.LJOS_PERF3D_OUT ?? join(import.meta.dirname, "results");
const SECONDS = Number(process.env.LJOS_PERF3D_SECONDS ?? 5);
const WARM = 2;
const IDLE = 10;
const RUN = (process.env.LJOS_PERF3D_QML6_RUN ?? "").split(" ").filter(Boolean);
const SCENES = process.argv.slice(2).length ? process.argv.slice(2) : ["spin", "orbit", "grid", "instances", "stress"];
const here = (name) => join(import.meta.dirname, "scenes", `${name}.qml`);

if (!RUN.length) {
  console.error("qml6.js: say how to run qml6 off-screen in LJOS_PERF3D_QML6_RUN (see the top of this file)");
  process.exit(2);
}

// Runs `qml6 <file>` in the sandbox for `seconds` after `warm`, and says
// what its log, /proc and a screenshot told.
function run(file, { warm, seconds, picture }) {
  const script = `
    set -u
    export QT_FORCE_STDERR_LOGGING=1
    export QT_LOGGING_RULES="qt.scenegraph.time.renderloop=true;qt.scenegraph.general=true;qt.rhi.general=true"
    export QT_MESSAGE_PATTERN="%{time process} %{category}: %{message}"
    qml6 "$1" 2> "$2.log" &
    pid=$!
    cpu() { awk '{ print $14 + $15 }' /proc/$pid/stat; }
    # qml6 gone before it was measured (a QML error, say) is a failed run,
    # not one of no frames.
    alive() { kill -0 $pid 2> /dev/null || { echo "qml6 exited while $1; its log: $2.log" >&2; exit 3; }; }
    sleep ${warm}
    alive "warming up" "$2"
    a=$(cpu); sleep ${seconds}; alive "measured" "$2"; b=$(cpu)
    rss=$(awk '/VmRSS/ { print $2 }' /proc/$pid/status)
    if [ -n "\${3:-}" ]; then
      for socket in "$XDG_RUNTIME_DIR"/wayland-*; do [ -S "$socket" ] && break; done
      WAYLAND_DISPLAY=$(basename "$socket") grim "$3" 2> /dev/null || true
    fi
    kill $pid; wait $pid 2> /dev/null
    echo "$a $b $rss $(getconf CLK_TCK)"
  `;
  const base = join(OUT, `qml6-${file.split("/").pop().replace(/\.qml$/, "")}`);
  // Paths go in as arguments, never into the script's text.
  const done = spawnSync(RUN[0], [...RUN.slice(1), "bash", "-c", script, "qml6", file, base, picture ?? ""], { encoding: "utf8" });
  if (done.status !== 0) throw new Error(`qml6 ${file}: ${done.stderr}`);
  const said = done.stdout.trim().split("\n").pop().split(" ").map(Number);
  const [a, b, rss, tick] = said;
  if (said.length !== 4 || !said.every(Number.isFinite) || b < a || tick <= 0) throw new Error(`qml6 ${file}: no measurement in ${JSON.stringify(done.stdout)}`);
  return { log: readFileSync(`${base}.log`, "utf8"), cpu: (b - a) / tick, rss: rss * 1024 };
}

const quantile = (values, q) => {
  if (!values.length) return null;
  const all = [...values].sort((x, y) => x - y);
  return all[Math.min(all.length - 1, Math.floor(q * all.length))];
};
const spread = (values) => ({ p50: quantile(values, 0.5), p99: quantile(values, 0.99) });

// The render thread's line for each frame: when, and its sync, render and
// swap in whole milliseconds.
function frames(log) {
  const all = [];
  for (const line of log.split("\n")) {
    const found = /^\s*([\d.]+) qt\.scenegraph\.time\.renderloop: .*frame rendered in (\d+)ms, sync=(\d+), render=(\d+), swap=(\d+)/.exec(line);
    if (found) all.push({ t: Number(found[1]) * 1000, total: Number(found[2]), sync: Number(found[3]), render: Number(found[4]), swap: Number(found[5]) });
  }
  return all;
}

function measure(name) {
  run(here(name), { warm: 1, seconds: 1 });
  const picture = join(OUT, `${name}-qml6.png`);
  const { log, cpu, rss } = run(here(name), { warm: WARM, seconds: SECONDS, picture });
  // The window floats on a black screen at the size it asked for.
  if (existsSync(picture)) spawnSync("magick", [picture, "-trim", "+repage", picture]);
  const all = frames(log);
  if (!all.length) throw new Error(`qml6 ${name}: no frame was logged (${join(OUT, `qml6-${name}.log`)})`);
  // The first frame that drew anything: the 3D scene's first, as Quick3D
  // makes its pipelines in it.
  const first = all.find(({ render }) => render > 0) ?? all[1];
  const window = all.filter(({ t }) => t >= WARM * 1000 && t < (WARM + SECONDS) * 1000);
  const intervals = window.slice(1).map(({ t }, i) => t - window[i].t);
  return {
    backend: /Creating QRhi with backend (\w+)/.exec(log)?.[1] ?? null,
    startup: first?.t ?? null,
    fps: window.length / SECONDS,
    interval: spread(intervals),
    render: spread(window.map(({ sync, render }) => sync + render)),
    sync: spread(window.map(({ sync }) => sync)),
    renderPass: spread(window.map(({ render }) => render)),
    swap: spread(window.map(({ swap }) => swap)),
    cpuPerFrame: window.length ? (cpu * 1000) / window.length : null,
    rss,
  };
}

mkdirSync(OUT, { recursive: true });
const version = execFileSync("qml6", ["--version"], { encoding: "utf8" }).trim().split(" ").pop();
const load = { before: loadavg(), cpus: cpus().length };
const scenes = {};
for (const name of SCENES) {
  scenes[name] = measure(name);
  console.log(name, JSON.stringify(scenes[name]));
}
// Nothing animating: frames drawn and CPU over ten seconds.
const still = run(join(import.meta.dirname, "still.qml"), { warm: WARM, seconds: IDLE });
const idle = {
  frames: frames(still.log).filter(({ t }) => t >= WARM * 1000).length,
  percent: (100 * still.cpu) / IDLE,
};
for (const each of Object.values(scenes)) each.idle = idle;
const note = `qml6 ${version} runs natively on the same GPU (RHI ${Object.values(scenes)[0]?.backend ?? "?"}, X11 through XWayland in a headless sway): Qt for WebAssembly is not available to measure in the browser. Its numbers are the scene graph's own, in whole milliseconds: "busy" is the render thread's sync + render, "draw" its render pass, "submit" its swap (which waits for vsync). CPU is the whole process's. Idle is a scene with nothing animating, as qml6 has no clock to stop.`;
load.after = loadavg();
writeFileSync(join(OUT, "qml6.json"), `${JSON.stringify({ version, note, load, scenes }, null, 2)}\n`);
if (existsSync(join(OUT, "summary.md"))) await import("./table.js").then(({ default: teardown }) => teardown());
