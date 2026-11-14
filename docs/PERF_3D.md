# View3D performance on the web

`packages/runtime/tests/perf3d` measures what a View3D costs in the browser, on
each renderer it has:

- the JS renderer (the default: WebGL2, `QtQuick3D/render.js`)
- wgpu on WebGPU (`?view3d=wgpu`, `crates/ljos_web_3d` over ljos-ui's `ljos_3d`)
- wgpu on WebGL2 (the same, with WebGPU hidden from the page)

It also measures the same QML in Qt's own `qml6` for comparison.

## Running it

```sh
mise run perf:3d                      # every scene on every renderer
LJOS_PERF3D_SCENES=grid,stress LJOS_PERF3D_RENDERERS=webgpu mise run perf:3d
```

- The harness builds `tests/perf3d` for production, serves it with
  `vite preview`, and opens one headless Chromium page per scene on the
  machine's own GPU. Nothing appears on screen.
- Results go to `tests/perf3d/results/` (`LJOS_PERF3D_OUT` moves them). Each
  run first removes what the previous run wrote there; other files and
  qml6's results are left alone:
  - one JSON per scene and renderer
  - a picture of each at 1.5 s
  - `summary.md`, the table
- `LJOS_PERF3D_SECONDS` (default 5) sets how long frames are measured, after
  2 s of warm-up.
- `LJOS_PERF3D_PROFILE=1` also samples the main thread at 100 µs. It writes a
  `.cpuprofile` per run (open it in Chrome DevTools) and puts the top
  functions in the JSON.
- The harness refuses reduced motion. A scene that does not move measures
  nothing.

Each scene and renderer runs in separate pages:

1. **Timing page.** It records:
   - startup: navigation to the first 3D frame presented
   - frames while the scene animates: interval, busy, sync, draw, submit
   - CPU of the renderer and GPU processes, from CDP `SystemInfo` and `/proc`
   - memory: JS heap, each wasm module's memory, and the resident memory of
     both processes
   - idle: the same scene with the page clock stopped, which should show
     0 rAF and about 0 % CPU
2. **Counting page.** Every WebGL and WebGPU call and every wasm↔JS crossing
   is counted per frame: draws, pipelines, uploads and bytes, creates. Counting
   takes time of its own, so it stays out of the timing page.
3. **Profiling page** (only with `LJOS_PERF3D_PROFILE=1`).

The sync and draw split comes from probe hooks in `View3D.js` and
`QtQuick3D/wgpu.js`. They cost nothing when no probe is attached.
`tests/perf3d.spec.js` checks that they report on both renderers.

### qml6

```sh
LJOS_PERF3D_QML6_RUN="<ljos-ui>/scripts/cua-sandbox.sh exec" node packages/runtime/tests/perf3d/qml6.js
```

- `qml6.js` runs each scene in Qt's `qml6`, natively, in ljos-ui's headless
  sway (off the user's screen; give the sandbox `LJOS_CUA_GPU` to put it on
  the GPU).
- Frame timing comes from Qt's scene graph log
  (`qt.scenegraph.time.renderloop`, in whole milliseconds). CPU and resident
  memory come from `/proc`, and there is a picture of each window.
- It writes `qml6.json`, and `table.js` adds those rows to the table.
- Qt for WebAssembly is not available to measure in the browser, so this is the
  desktop runtime on the same machine and GPU.

## Scenes

| scene | what |
|---|---|
| spin | one lit cube turning (ljos-ui `bench/quick3d-spin.qml`) |
| orbit | ljos.dev's orbit demo: 12 models, 4 lights, a shadow, MSAA |
| grid | 1000 cubes from a Repeater3D, 4 lights, a circling camera (`bench/quick3d-grid.qml`) |
| instances | 10 000 instances from RandomInstancing, turned as one (`bench/quick3d-instances.qml`) |
| stress | 400 textured models, 10 lights, a shadow, a circling camera, 50 of them turning |

Any QML put in `tests/perf3d/scenes/` can be measured by adding it to the list
in `measure.bench.js`.

## Baseline (2026-11-13)

Measured on Chromium 158 headless and an AMD Radeon 8060S (RADV; WebGL2 through
ANGLE on Vulkan). The load average was 13.6–49.2 on 32 CPUs, so read the ratios
more than the absolute times. qml6 is 6.12.0 on RHI OpenGL. All times are
p50 in milliseconds.

| scene | renderer | startup | fps | busy | sync | draw | main CPU/frame | draws | wasm↔JS/frame |
|---|---|---|---|---|---|---|---|---|---|
| spin | JS | 170 | 60 | 0.8 | 0.08 | 0.25 | 0.86 | 1 | – |
| spin | wgpu WebGPU | 214 | 60 | 1.3 | 0.25 | 0.39 | 1.37 | 2 | 16 / 188 |
| spin | wgpu WebGL2 | 300 | 60 | 1.5 | 0.24 | 0.67 | 1.52 | 2 | 15 / 450 |
| spin | qml6 | 166 | 62 | 0–1 | | | 0.7 (process) | | |
| orbit | JS | 253 | 60 | 1.1 | 0.09 | 0.34 | 1.08 | 11 | – |
| orbit | wgpu WebGPU | 204 | 60 | 2.3 | 1.11 | 0.52 | 2.15 | 23 | 95 / 1249 |
| orbit | wgpu WebGL2 | 319 | 60 | 2.6 | 1.09 | 0.93 | 2.44 | 23 | 94 / 2874 |
| orbit | qml6 | 186 | 62 | 0–1 | | | 1.2 | | |
| grid | JS | 217 | 60 | 8.6 | 0.33 | 7.72 | 8.16 | 1000 | – |
| grid | wgpu WebGPU | 411 | 20.6 | 48.7 | 44.86 | 2.57 | 44.64 | 1001 | 6018 / 53200 |
| grid | wgpu WebGL2 | 484 | 25.3 | 38.5 | 31.85 | 5.81 | 37.96 | 1001 | 6017 / 159356 |
| grid | qml6 | 212 | 62 | 3 | | 2–3 | 15.4 | | |
| instances | JS | 106 | 60 | 0.8 | 0.07 | 0.25 | 0.84 | 1 | – |
| instances | wgpu WebGPU | 131 | 60 | 3.0 | 0.22 | 2.32 | 3.13 | 2 | 18 / 220 |
| instances | wgpu WebGL2 | 184 | 60 | 3.2 | 0.23 | 2.45 | 3.25 | 2 | 17 / 487 |
| instances | qml6 | 198 | 62 | 0 | | | 0.7 | | |
| stress | JS | 125 | 60 | 4.2 | 0.11 | 2.37 | 4.09 | 401 | – |
| stress | wgpu WebGPU | 248 | 30.7 | 33.0 | 28.96 | 1.50 | 30.84 | 803 | 2841 / 42045 |
| stress | wgpu WebGL2 | 358 | 35.1 | 28.3 | 23.03 | 3.32 | 27.83 | 803 | 2840 / 94283 |
| stress | qml6 | 243 | 62 | 3 | | 2–3 | 9.6 | | |

Idle (nothing moving, clock stopped): 0 rAF and 0.00–0.20 % CPU on every
renderer and scene; qml6 draws 0 frames and uses 0 % on a still scene.

Resident memory: the page uses 126–308 MB and the GPU process 100–132 MB.
qml6 uses 172–218 MB. Instances on wgpu upload 782 KB per frame. The JS
renderer makes 37 016 uniform calls per frame on grid.

## What to fix, by measured cost

| # | fix | where | measured cost | expected |
|---|---|---|---|---|
| 1 | Sync only what changed. Today every change reruns the whole build inside one tracking effect. Profile on grid: 43 % Solid's tracking of 53 k reads, 26 % `wgpu.js`'s readers, 15 % wasm-bindgen glue, 11 % wasm. | ljos-web `QtQuick3D/wgpu.js` and `crates/ljos_web_3d` first: effects per object, an untracked build of only the dirty ones. Then ljos-ui `ljos_3d::qml::build` reuses unchanged nodes. | grid sync 45 ms (WebGPU) / 32 ms (WebGL2); stress 29 / 23 ms | 60 fps on grid and stress; sync under 2 ms |
| 2 | Upload instance rows when the table changes, and apply the world matrix in the shader. | ljos-ui `ljos_3d` `gpu.rs` (`copy_rows`, `instances.write`) | 782 KB per frame; draw 2.3 ms against 0.25 ms on JS | about 0 KB, draw about 0.3 ms |
| 3 | Draw in the same frame as the build, not in a second rAF. | ljos-web `QtQuick3D/wgpu.js` | 2 rAFs per frame, one frame of latency | −16.7 ms latency |
| 4 | Batch identical models (auto-instancing or render bundles). | ljos-ui `ljos_3d` `gpu.rs` | 1001 draws on grid, 803 on stress | grid draw 2.6 → under 0.5 ms |
| 5 | JS renderer: send per-frame uniforms once (cache or UBO). | ljos-web `QtQuick3D/render.js` | 37 016 uniform calls per frame on grid, 7.7 ms draw | about 2–3 k calls, about 2 ms |
| 6 | wgpu on WebGL2: redundant GL state. | ljos-ui `ljos_3d` sampler use, then wgpu's GL backend | 450 crossings per frame for one cube (188 on WebGPU) | the WebGL2 fallback costs close to WebGPU |
| 7 | Make the GPU time readable. | ljos-ui `ljos_3d` (`SurfaceView.target` is private) | the harness can only bound GPU time | real GPU ms in the table |
| 8 | Start the wasm sooner (streaming compile, fetch before the first View3D). | ljos-web | wgpu startup 1.2–2× the JS renderer's | −100–200 ms |

Fidelity: in the pictures, stress shows clear model shadows in qml6 and far
fainter ones on both web renderers. On orbit, the JS renderer's tower shadow
is weaker than wgpu's.
