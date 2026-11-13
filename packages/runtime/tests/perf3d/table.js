// The table of what `measure.bench.js` wrote, with qml6's numbers for the
// same QML where `qml6.json` has them (`qml6.js`): printed, and written to
// `summary.md` beside the results. Also `node table.js` on its own.
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const OUT = process.env.LJOS_PERF3D_OUT ?? join(import.meta.dirname, "results");
const ORDER = ["spin", "orbit", "grid", "instances", "stress"];
const RENDERERS = ["js", "webgpu", "webgl2", "qml6"];

const ms = (value, digits = 1) => (value === null || value === undefined || Number.isNaN(value) ? "–" : value.toFixed(digits));
const kb = (value) => (value ? `${Math.round(value / 1024 / 1024)} MB` : "–");
const n = (value) => (value === null || value === undefined ? "–" : value >= 100 ? Math.round(value).toString() : value.toFixed(1));

// Before a run (the harness's globalSetup): what an earlier run wrote goes,
// so the table is of this run alone. qml6's files stay, as `qml6.js`
// measures them on its own.
export function fresh(out = OUT) {
  if (!existsSync(out)) return;
  for (const name of readdirSync(out)) {
    if (/qml6/.test(name) || !/\.(json|png|cpuprofile|md)$/.test(name)) continue;
    if (statSync(join(out, name)).isFile()) rmSync(join(out, name));
  }
}

export function table(out = OUT) {
  if (!existsSync(out)) return "";
  const results = readdirSync(out)
    .filter((name) => name.endsWith(".json") && name !== "qml6.json")
    .map((name) => JSON.parse(readFileSync(join(out, name), "utf8")));
  const qml6 = existsSync(join(out, "qml6.json")) ? JSON.parse(readFileSync(join(out, "qml6.json"), "utf8")) : {};
  for (const [scene, each] of Object.entries(qml6.scenes ?? {})) results.push({ scene, renderer: "qml6", qml6: each });
  results.sort((a, b) => ORDER.indexOf(a.scene) - ORDER.indexOf(b.scene) || RENDERERS.indexOf(a.renderer) - RENDERERS.indexOf(b.renderer));

  const lines = [];
  lines.push("| scene | renderer | startup ms | fps | frame p50 / p99 ms | busy p50 / p99 ms | sync ms | draw ms | submit ms | other ms | main CPU ms/frame | GPU-proc CPU ms/frame | GPU done ms | draws | pipelines | uploads (KB) | creates/frame | wasm↔JS/frame | memory | idle rAF / CPU % |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    if (r.renderer === "qml6") {
      const q = r.qml6;
      lines.push(
        `| ${r.scene} | qml6 ${qml6.version ?? ""} native (${q.backend ?? "rhi"}) | ${ms(q.startup, 0)} | ${n(q.fps)} | ${ms(q.interval?.p50)} / ${ms(q.interval?.p99)} | ${ms(q.render?.p50)} / ${ms(q.render?.p99)} (render thread) | ${ms(q.sync?.p50)} | ${ms(q.renderPass?.p50)} | ${ms(q.swap?.p50)} | – | ${ms(q.cpuPerFrame)} (whole process) | – | – | – | – | – | – | – | ${kb(q.rss)} RSS | ${q.idle?.frames ?? "–"} frames / ${ms(q.idle?.percent, 2)} % |`,
      );
      continue;
    }
    const f = r.frames;
    const c = r.counts.perFrame;
    const memory = [
      r.memory.jsHeapUsed && `heap ${kb(r.memory.jsHeapUsed)}`,
      ...Object.entries(r.memory.wasm ?? {}).map(([name, bytes]) => `${name} ${kb(bytes)}`),
      r.memory.resident?.renderer && `page RSS ${kb(r.memory.resident.renderer)}`,
      r.memory.resident?.gpu && `GPU RSS ${kb(r.memory.resident.gpu)}`,
    ]
      .filter(Boolean)
      .join(", ");
    const idleCpu = (r.idle.percent.renderer ?? 0) + (r.idle.percent.gpu ?? 0);
    lines.push(
      `| ${r.scene} | ${r.label} | ${ms(r.startup.presented, 0)} | ${n(f.fps)} | ${ms(f.interval.p50)} / ${ms(f.interval.p99)} | ${ms(f.busy.p50)} / ${ms(f.busy.p99)} | ${ms(f.sync.p50, 2)} | ${ms(f.draw.p50, 2)} | ${ms(f.submit.p50, 2)} | ${ms(f.other.p50, 2)} | ${ms(r.cpu.main, 2)} | ${ms(r.cpu.gpu, 2)} | ${ms(f.gpu?.p50)} | ${n(c.draws)} | ${n(c.pipelines)} | ${n(c.uploads + c.uniforms)} (${ms((c.bytes ?? 0) / 1024)}) | ${n(c.creates)} | ${n(c.into)} / ${n(c.out)} | ${memory} | ${f && r.idle.asked} / ${ms(idleCpu, 2)} % |`,
    );
  }
  const loads = results.filter((r) => r.load).map((r) => r.load.before[0]);
  const about = results.find((r) => r.counts?.adapter);
  lines.push("");
  if (loads.length) lines.push(`Load average (1 min) while measuring: ${Math.min(...loads).toFixed(1)}–${Math.max(...loads).toFixed(1)} on ${results.find((r) => r.load).load.cpus} CPUs.`);
  if (about) lines.push(`Chromium ${about.browser}; WebGPU adapter: ${JSON.stringify(about.counts.adapter.webgpu)}; WebGL2: ${about.counts.adapter.webgl2}.`);
  if (qml6.note) lines.push(qml6.note);
  if (qml6.load) lines.push(`Load average (1 min) while qml6 ran: ${qml6.load.before[0].toFixed(1)}–${qml6.load.after[0].toFixed(1)}.`);
  return lines.join("\n");
}

export default function teardown() {
  const text = table();
  if (!text) return;
  writeFileSync(join(OUT, "summary.md"), `${text}\n`);
  console.log(`\n${text}\n\n(${join(OUT, "summary.md")})`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) teardown();
