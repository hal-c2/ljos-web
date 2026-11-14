# ljos-web: Ljós applications on the web

An Ljós application is QML over native types written in Rust
(`#[derive(QmlObject)]`, `#[qml_impl]`, list models, singletons).
On the desktop and on phones Ljós runs both. On the web there is no
egui and no second JavaScript engine to bring: the browser has a DOM
and a JS engine of its own. So ljos-web splits the application at the
seam Ljós already has:

```text
.qml ──qmlc──▶ Solid components over packages/runtime (QtQuick on the DOM)
Rust ──cargo──▶ wasm32-unknown-unknown (the application's own crates,
                the same source its desktop build compiles)
ljostypes.json ──▶ the compiler's type table (what the Rust types are)
generated glue ──▶ each Rust type as a type of the runtime's kernel
```

The QML is compiled by ljos-web exactly as it is today. What is new
is that a type the application has in Rust is there at run time as a
wasm struct behind a small generated face, used by compiled QML as
it uses `Rectangle` or `Timer`. One application codebase then covers
desktop and mobile on Ljós, and the web on ljos-web.

`examples/wasm-counter` is the first spike of every mechanism below,
end to end, with the glue written by hand. Section 12 says what it
measured; section 2 says, item by item, what the macro would
generate in place of the hand-written parts.

What carries over from Ljós's architecture, because the web build is
the same application:

- **Qt semantics by default** (ARCHITECTURE.md §2.2 in ljos-ui), and
  where the two reactive graphs differ observably, a stated
  divergence (section 4).
- **One owner per piece of state, messages between owners** (§2.4):
  a Rust struct owns its fields; the DOM side holds a face, never a
  second copy that is written to independently.
- **0 % CPU when idle** (§2.5): nothing polls, nothing ticks. A
  change in wasm is told, synchronously, to whoever follows it
  (section 4).
- **No parser in the shipped page by default**: QML is compiled
  ahead of time, as ljos-web already does; the wasm is the
  application's logic and Ljós's own semantics (Part I), never an
  interpreter for JavaScript. A site that opts in to live shells
  (A9) ships the compiler as a lazily loaded chunk, and what it
  compiles is tier-1 IR, not JS.

## Part I — Aligned: Solid draws, Ljós decides

Sections 1–15 (Part II) are about an application's *own* Rust types
on the web. This part is about the runtime underneath them:
`packages/runtime`, 72 k lines of JavaScript that re-implement, over
Solid, what ljos-ui's crates already implement natively — the
property graph, Qt's value coercions, layout arithmetic, states,
animation timing, models. Two implementations of one semantics drift;
every divergence is a bug found twice. "Aligned" is the plan to make
them one.

### A1. Goals and non-goals

Goals:

1. **Solid where it renders, Rust where it decides.** Solid stays the
   renderer: it builds and patches the DOM, owns events, focus,
   scrolling, text measuring and every browser API. The *decisions* —
   what a binding evaluates to and when, what a value coerces to, where
   a positioner puts its children, which state is active, what an
   easing curve gives at t — are ljos-ui's crates compiled to
   `wasm32-unknown-unknown`, **the same source the desktop builds**,
   never a port.
2. **Few crossings.** The JS↔wasm boundary is crossed per node, not
   per value: numbers in, numbers out, no strings, no objects, no
   serialisation on any hot path (A4).
3. **An honest budget.** ≤ 250 kB gzip for a first useful page,
   measured by the build on every change (A8). The wasm is counted,
   the JS it replaces is subtracted.
4. **Behaviour parity, proven the same way as native.** The `@web`
   surface of ljos-ui's Gherkin ledger, with qml6 as the oracle
   (section 11, A7). A semantics moved to Rust is moved because the
   ledger says the Rust one is right.
5. **Live QML shells, opt-in.** A site may let its visitor drop in a
   QML shell that recomposes the site's blocks, compiled in the
   browser, with no more power than the blocks give (A9).

Non-goals:

- Drawing with wgpu/vello into a canvas instead of the DOM. The DOM
  is the web's accessibility tree, text input, selection, find-in-page
  and scrolling; ljos-web keeps them. (3D is the exception: A10.)
- Replacing Solid's reactivity in what Solid alone reads (a
  component's local UI state). Only QML's property graph moves.
- Moving browser-bound modules: Flickable (native scrolling is the
  design), TextInput, pointer capture, the clock driver, font
  measuring, Window, Image/Canvas/Particles/ShaderEffect painting,
  QtQuick3D's scene, Charts/Graphs, Multimedia (audit, A3).
- Shipping a QML parser by default (goal 9 says an application *may*;
  A9 is how a site opts in).
- A server for live shells. ljos-web defines the publish interface;
  the site brings the endpoint.

### A2. Modules and their seams

```text
             compile time                           run time (browser)
 .qml ──qmlc (Rust)──▶ Solid JSX ──vite──▶ ┌────────────────────────────────┐
                                           │ Solid components (DOM)         │
                                           │   ▲ faces: one Solid signal    │
                                           │   │ per followed node          │
                                           │ packages/runtime (JS)          │
                                           │   object.js: defineType, Slot, │
                                           │   values kept here             │
                                           │   │ #kernel  (seam K)          │
                                           │   ▼                            │
                                           │ kernel/wasm.js  ◀─ u32 ─▶ wasm │
                                           │                  ljos_web_kernel│
                                           │                  └ ljos_reactive│
                                           │                  └ (later) value│
                                           │                    kinds, layout│
                                           │                    states, anim │
                                           └────────────────────────────────┘
```

| Module | Where | Role | Interface (seam) |
|---|---|---|---|
| `qmlc` (`crates/ljos_web`) | ljos-web | QML → Solid JSX, over `qml_front`/`qt_types` | `vite.js` plugin; unchanged by this part |
| `packages/runtime` | ljos-web | QtQuick on the DOM; defines types (`defineType`), keeps values in `Slot`s | imports the kernel only through `#kernel` |
| `#kernel` (seam K) | ljos-web | The property/binding kernel, chosen at build time | `cell`, `binding`, `read`, `touch`, `version`, `signal`, `followed`, `live`, `WASM` |
| `kernel/solid.js` | ljos-web | Adapter: Solid's own signals: the default kernel | seam K |
| `kernel/checked.js` | ljos-web | The opt-in wasm kernel (`LJOS_KERNEL=wasm`): `wasm.js` where `wasm-check.js` finds WebAssembly runs and the wasm loads, else `solid.js` | seam K |
| `kernel/wasm.js` | ljos-web | Adapter: raw wasm imports/exports, faces, rethrow | seam K above, seam W below |
| seam W | — | `ljos` import module: `evaluate(u32)->u32`, `changed(u32)`; exports `ljos_cell/binding/read/pull/bump/follow/dispose/live` | numbers only |
| `ljos_web_kernel` | ljos-web now, ljos-ui later | Owns the graph: `Kernel` over `Graph<u32>` + a `Host` trait | seam W; `Host` for native tests |
| `ljos_reactive` | ljos-ui (git dep, pinned rev) | Push-pull graph, Qt loop breaking | unchanged by the spike |
| value/layout/states/anim crates | ljos-ui | A5 | each behind a numbers-only export set, as seam W |

**DECISION:** the kernel is chosen at *build time* through
`packages/runtime/package.json`'s `imports` (`"#kernel"`, condition
`ljos-wasm-kernel`; Vite's `resolve.conditions` from
`LJOS_KERNEL=wasm`). No runtime branch on the hot path beyond a
constant, and both kernels testable from one tree.

**DECISION (TREESHAKE B2):** everything that can be HTML renders through
Solid into the real DOM, and Solid's signals stay the default kernel;
they are not deleted at W10. `ljos_web_kernel` computes the dependency
graph and hands results to Solid: it neither renders nor lays out, so it
buys no rendering and stays opt-in (`LJOS_KERNEL=wasm`, condition
`ljos-wasm-kernel` → `kernel/checked.js`), not promoted. Should it ever
grow rendering or layout of its own, that is a reason to remove it, not
to make it the default. wasm in a page is for application logic written
in Rust: the compiler (live code blocks, a dropped shell) and an app's
own Rust models.

**DECISION (TREESHAKE B2):** `wasm-check.js` is the one WebAssembly check:
it compiles and calls a module of a few bytes (never the user agent) and
keeps the answer. The compiler's loaders (`compiler/link.js`,
`Ljos/Blocks/shell-worker.js`, `codeblocks/live.js`) and
`kernel/checked.js` ask it. There is no compiler but the wasm one, and
none is written in TS: where WebAssembly does not run (Safari's Lockdown
Mode, a policy without `'wasm-unsafe-eval'`), a live code block keeps the
build's prerendered result and says "Live editing needs WebAssembly"
(`data-state="needs-wasm"`), and a compile answers that as its
diagnostic. Rendering never asks.

**DECISION:** `ljos_web_kernel` lives in ljos-web for the spike and
moves to ljos-ui as `crates/ljos_web` (section 13 item 3) when the
first ljos-ui change it needs lands: it is general-purpose (no site,
no application in it) and it is what an application's own wasm links,
so there is **one wasm per page** — the kernel and the application's
types in one module, never two instances of `ljos_reactive`.

**How `qmlc` finds a module.** `qmlc [--root DIR] [-I DIR]... [--with
DIR]... [--qt DIR]... FILE.qml` compiles a file with its project: the
modules under the import paths, which are those `-I` (`--import-path`)
names in order and then `--root` (otherwise the nearest directory above
the file whose `CMakeLists.txt` starts a project), and the stand-ins
`--with` names. As Qt finds one, module `App.Media` is the `qmldir` at
`App/Media/qmldir` under an import path, the first to have one: of
`App/Media/qmldir` and `mocks/App/Media/qmldir`, both `module App.Media`,
it is the first, unless `-I mocks` puts the second first. A `qmldir`
under an import path (or the installed Qt's, below) out of its module's
place is not that module, and when no other is, `qmlc` says so on stderr
naming both. A stand-in's `qmldir` is at its module's place under its
`--with` directory and adds to that module what the program has in C++.
A `CMakeLists.txt` says what its modules are wherever it is. A Ljós
`# block Name 1.0 File.qml ...` line of a `qmldir` (ADR 0003 of ljos-ui)
declares a type of its module, as a plain `Name 1.0 File.qml` does; to
Qt it is a comment. The Vite
plugin takes the import paths as `importPaths` and the project's root as
`root`, each a value or a function of the file compiled, so that every
file of one project has one root. A module the file imports has to be installed, as it has to be for Qt: the
project's, one of Qt's table (`qt_types`), one the runtime package
exports (`packages/runtime/package.json`: `Qt.labs.settings`), or one of
the Qt that is installed, a `qmldir` in its place under a directory
`--qt` names (otherwise `QML_IMPORT_PATH` and `qtpaths`; the Vite plugin
passes its `qt` roots). Any other is a compile error where it is
imported, `Main.qml:2:1: module "No.Such.Module" is not installed`,
where it used to compile to an import from `ljos-web/No/Such/Module`.
A file compiled `--alone` has no project, and its imports are not
checked.

### A3. What stays JS, what moves (the audit)

From a classification of every `packages/runtime` module against
ljos-ui's crates (`$S/web/audit-runtime.md`, 2026-10-30):

| Moves to Rust (shared source) | ljos-ui home | Ready for wasm? |
|---|---|---|
| Property graph: `Slot` layering, `ringed`/`looped`/`bound`, `after`/`settle`/`flush` ordering | `ljos_reactive` | **yes** — the spike |
| Value kinds: int/real/string/numeral/date coercion | `ljos_engine/src/number.rs`, `value.rs` | needs `ljos_meta` split (section 13 item 2) |
| Colour | `ljos_ir/src/color.rs` | yes |
| Locale, number/date formats | `ljos_i18n` | yes (no engine dep) |
| Easing, smooth, spring | `ljos_quick/src/animation/{easing,smooth,spring}.rs` | code yes; crate no (A6) |
| Layout arithmetic | `ljos_quick/src/layouts/distribute.rs` | code yes; crate no |
| Positioners, anchors, states, animation jobs, views' layout pass, models | `ljos_quick`, `ljos_engine` | no — sit on `Engine` |

| Stays JS/Solid | Why |
|---|---|
| `defineType`, `mount`, faces, the DOM half of every item | the renderer |
| Flickable, TextInput, pointer/hit-testing, focus *events* | browser behaviour is the design |
| clock driver (rAF/timeouts) | host wakeups; deadlines may come from Rust |
| font measuring, Image/Canvas/ShaderEffect/Particles painting | browser APIs |
| QtQuick3D, Charts/Graphs, Multimedia, LocalStorage, XHR | browser APIs / A10 |

**DECISION:** move by *semantics*, not by file. A piece moves when its
ljos-ui crate builds for wasm32 with no `cfg` in the shared code
beyond the clock (A6), and the `@web` scenarios covering it pass on
both kernels before the JS copy is deleted.

### A4. The JS↔wasm boundary (what the spike proved)

The rule: **topology and scheduling cross; values do not.** The graph
in wasm is `Graph<u32>`: each node's value is a *version*. The real
value stays in the JS `Slot` (or the binding's closure). So:

| Operation | Crossings |
|---|---|
| Tracked read of a property | 1 JS→wasm (`ljos_read`) |
| Write | 1 JS→wasm (`ljos_bump`), then the graph's own pushes |
| Binding evaluation | 1 wasm→JS (`evaluate(node)`), returning "changed?" |
| Solid follows a node | 1 JS→wasm once (`ljos_follow`), then 1 wasm→JS (`changed`) per change that may have reached it, and 1 JS→wasm (`ljos_pull`) when Solid asks again |

- A Solid computation reads the graph through a **face**: a Solid
  memo of the node's version, made the first time a Solid observer
  reads that node. Nodes nobody draws have none.
- **DECISION (W8):** a face is *told*, not evaluated. The graph's
  `effect_told` says a change may have reached the node, without
  working it out; the face's memo asks the graph (`ljos_pull`, which
  gives the version) in Solid's own flush, and a version that did not
  move stops there, as a Solid memo does. Evaluating at the write (a
  `watch`) worked a delegate's binding out before the Repeater's
  effect had dropped its row, and re-ran a layout whose input came
  back the same.
- **DECISION (W8):** the kernel holds what it tells until the page's
  call into it returns, and tells it by height, a source first: the
  graph tells in its own queue's order, and Qt runs a property's own
  handler before what a binding of it gives is told. A face made
  inside an evaluation (an object a binding makes, following that
  binding or what reads it) is looked at again then too: the graph
  tells what a binding's result reaches only through the mark that
  made it out of date, which came before the face.
- A Rust binding evaluates its JS under `untrack`: what it reads, it
  reads through seam K, so the graph sees every edge.
- **A JS throw never unwinds through wasm frames** (it would leave a
  node computing forever): `evaluate` catches into `thrown`, the graph
  finishes, `rethrow()` throws on the JS side after the export
  returns. QML's "binding error → warn, keep the old value" stays in
  `object.js` as before.
- **DECISION:** each evaluation the graph runs has a Solid owner of
  its own (a root), ended once the *next* evaluation is over, through
  the runtime's `after` queue. A memo gave `ringed` that for free;
  without it, effects a binding made piled up under whoever happened
  to pull it (the first full run grew one face to 28 500 subscribers
  and was killed at its memory cap), and ending them *during* the
  next evaluation wrote into the graph from inside it and never
  finished.
- **DECISION:** raw imports/exports, u32 only, no wasm-bindgen for the
  kernel. wasm-bindgen's JS shim and its heap/externref table buy
  nothing when only integers cross, and the module stays loadable by
  any `WebAssembly.instantiate`.
- **DECISION:** what the runtime still keeps in a Solid signal of its
  own (79 `createSignal` and 12 `createMemo` sites in 55 files) is
  invisible to a binding the graph runs. Each site moves to
  `signal()`/`version()` from `#kernel` (same shape as
  `createSignal`; on the Solid kernel it *is* `createSignal`). The
  spike moved three (`placing.js` `Settling`, `Repeater` count,
  `Image` status) and each turned a failing scenario green. This is a
  mechanical pass; the `@web` run on the wasm kernel finds every
  site missed.
- **DECISION (W8):** `untrack` is the kernel's too. Solid's own stops
  only Solid's observer; a binding of the graph's went on recording
  what was read under it, so a binding that makes objects (an Item's
  `transitions`) came to depend on what its objects read as they were
  made, and was re-run, making them again. `#kernel` exports an
  `untrack` that stops both; under it the wasm kernel reads with
  `ljos_pull` (up to date, no edge). The runtime imports `untrack`
  from `#kernel`, never from `solid-js`.
- **DECISION (W8):** a memo a *binding* reads is `memo()` from
  `object.js`: Solid's `createMemo` on the Solid kernel, a graph node
  on the wasm one. A memo that only feeds a Solid effect
  (`follow(createMemo(...))` in states, Binding, the animations) stays
  Solid's: an effect sees graph nodes through their faces already.

**Measured** (headless Chromium, `$S/web/measure/bench`, 200 000
iterations, ns per operation):

| | wasm kernel | Solid |
|---|---:|---:|
| empty export call (boundary only) | 11 | — |
| tracked read of a clean binding | 64–88 | 4–6 |
| write + re-evaluate + read | 430–510 | 5 |
| `signal()` set + get | 172 | — |

The boundary is cheap; **the graph's own per-read work is the cost**
(≈ 55 ns a clean tracked read). That is `ljos_reactive`'s hot path,
and it is the same cost natively, so the fix is in ljos-ui and pays
twice (risk R2, milestone W8).

**W8** (same bench, medians of 7; warmed in brackets): a clean
tracked read 18 ns (9.5), write + read 117 (102), `signal()` set + get
43 (40), empty export 8 (5); Solid's clean read 3.5 (1.5). Two
changes: `ljos_reactive`'s `try_get` looks its node up once instead
of three times (ljos-ui, branch `web-needs`; natively 3.0 → 2.0 ns a
read), and the kernel is built at `opt-level=2`. What is left is the
crossing and the kernel's number table, not the graph: warmed, 2×
Solid is 3 ns, an empty crossing and one lookup. Two levers remain,
both design changes: the page's number *is* the graph's slot (the
table goes, ≈ 2–3 ns), and a clean bit per node in shared memory so
an untracked read of a clean node does not cross at all.

### A5. Data flow

1. `qmlc` compiles QML to Solid components; bindings are JS closures
   (as today).
2. Making an object: `defineType` makes `Slot`s; a bound slot asks
   seam K for a `binding(owner, run)` → one node in the graph.
3. Reading `a.width` inside a binding: `Slot.follow` → `read(cell)` →
   the graph records the edge (and, if `a.width` is itself bound and
   stale, calls `evaluate` for it first — pull).
4. Writing `a.width = 3`: the slot stores 3 and `touch(cell)` → the
   graph marks, then runs eager effects synchronously before returning
   — the change handlers (`onWidthChanged`), Qt's "before the write
   returns" (§6.2) — and tells the faces the change may have reached,
   a source first.
5. Solid asks the faces it was told of again, in its own flush; a face
   whose node gives the version it had stops there; the DOM is
   patched.
6. Moved semantics (later): a positioner's slot calls into the layout
   export with child sizes (numbers, in a shared `Float64Array` view
   of wasm memory — one crossing per layout pass, not per child) and
   reads back positions the same way.

### A6. What ljos-ui must change for this (general purpose, all of it)

In addition to section 13:

1. **`Instant::now()` panics on wasm32-unknown-unknown.** Every use
   on a path the web takes goes behind `ljos_runtime::time::Clock`
   (the `VirtualClock` already exists for tests), with the web's
   clock fed from `performance.now()` through one import. No `cfg` in
   the callers.
2. **Threads and `std::fs`** in `ljos_quick`/`ljos_engine` paths
   (image decode pools, file models) behind the `Platform` seam;
   wasm gets the single-threaded implementations.
3. **`ljos_quick`'s pure parts** (easing, smooth, spring,
   `layouts/distribute.rs`, `flickable/physics.rs`, positioner
   arithmetic) usable without `Engine`: a `ljos_quick_core` crate (no
   engine, no `ljos_js`) that `ljos_quick` re-exports. The same cut as
   section 13's `ljos_meta`, one level up.
4. **Loop semantics** (A7's two divergences) settled in
   `ljos_reactive`, scenario first.
5. A `wasm32-unknown-unknown` build of `ljos_reactive`,
   `ljos_ir`, `ljos_i18n` and the new core crates in ljos-ui's CI, so
   wasm-cleanness is held, not hoped for.

None of this names ljos-web, a site or an application; the native
build gains a cleaner layering from every item.

### A7. Testing: which features, which oracle

- **Kernel parity now:** the runtime's own Playwright suite
  (`packages/runtime/tests`, 111 specs, 734 tests, scenes compiled by
  `qmlc` and rendered by Solid in headless Chromium) runs on both
  kernels: `mise run test:kernel` (wasm) and the existing task
  (Solid). Its expectations are Qt 6.11's answers; none is edited to
  make the wasm kernel pass.
- **Native kernel tests:** `cargo test -p ljos_web_kernel` drives the
  `Kernel` through a stand-in `Host` (no browser), so seam W's
  contract is tested where it is written.
- **The ledger (section 11):** the `@web` backend runs ljos-ui's
  `features/` scenarios in headless Playwright, qml6 the oracle, held
  by `RATCHET`. **DECISION:** start with the areas ljos-web already
  passes in its own suite — bindings, properties and signals,
  completion order, positioners, Repeater/Loader, states — so the
  first `RATCHET` is a baseline, not a backlog; then grow area by area
  as semantics move (A3).
- **Divergences found by the spike** that ljos-ui's `features/` does
  not hold yet, so neither native Ljós nor ljos-web is gated on them:
  - `lateloop`: a property bound again, from a handler, to what
    depends on it "goes round once" — Qt leaves what changed first as
    it was when it changed.
  - `imageloop`: `sourceSize.width: height` on a picture whose height
    follows its loaded size is loaded once more and no more — Qt ends
    the loop at the *binding*; what a type works out for itself (the
    picture's size) is recomputed whenever asked.
  - A `DialogButtonBox` whose `contentWidth` is bound to its list's
    (`buttonbox.spec.js`, after step 20): the box places each
    button's width at its share of `availableWidth`, a value the type
    works out for itself, so this is `imageloop`'s rule again: Qt
    ends at the binding and gives 66 a button, the graph at the
    placed width and gives 58.9.
  **DECISION:** all three become scenarios in ljos-ui's `features/`
  (behaviour first, rule 3), checked against qml6, and
  `ljos_reactive` learns the rule there; ljos-web's JS glue does not
  paper over them.

### A8. Performance budget

| Item | Budget | Measured (phase 1) |
|---|---|---|
| First useful page, gzip, JS + wasm | ≤ 250 kB | W8, every QtQuick type + runtime (`test:size`): 149.1 kB JS (Solid kernel); 149.1 kB JS + 26.9 kB wasm = 176.0 kB (wasm kernel) |
| Kernel wasm | ≤ 30 kB gzip until value kinds move; every later move must remove more JS than it adds wasm, or say why | W8: 68,531 B raw / 26,916 B gzip (`opt-level=2`, LTO, one CGU, `panic=abort`, strip; no `wasm-opt` installed). At 2 the read path is inlined, which folds away more than it copies; "z" and "s" were larger |
| Compiler in the page (A15), fetched on a page's first compile only | ≤ 1,300 kB gzip wasm, ≤ 5 kB gzip JS | W9.1: 3,717,395 B raw / 1,085,222 B gzip wasm (`opt-level="z"`); 4,061 B gzip JS as written. With the Ljós dialect (A31): 4,327,487 B raw / 1,247,112 B gzip wasm, 4,916 B gzip JS. With one oxc parser (plain JavaScript read by ljos-ui's fork too): 4,044,143 B raw / 1,155,711 B gzip / 837,556 B brotli. `opt-level="s"` is 4,930,010 B, and `wasm-opt -Oz` gains about 1 % gzip but grows brotli, so neither is used. A page that does not compile: unchanged, byte for byte |
| Tracked clean read | ≤ 2× Solid's before the Solid kernel is deleted | W8: 18 ns against Solid's 3.5 (9.5 against 1.5 warmed), from 40.5; not met (A4) |
| Write → DOM | one Solid flush per write batch, zero polling | holds (faces) |
| Idle | 0 % CPU | holds (nothing ticks; graph is push on write) |

`mise run test:size` is the gate: it bundles a page that imports the
runtime and every QtQuick type (`packages/runtime/size/`) on both
kernels and fails over 250 kB gzip of JS + wasm, or over 30 kB gzip of
kernel wasm. It is part of `mise run test`. The compiler (A15) is a line
of its own, against its own budget, and a page bundle with the compiler
in it fails.

### A9. Live QML shell drop (opt-in)

**What a shell is.** A QML file whose root composes the site's
**blocks** (ljos-ui ADR 0003, the terms of `Ljos.Blocks`). A block is a
QML type that its module's `qmldir` marks with
`# block <Name> <version> <File.qml> [Category] ["summary"]`. Its
**state** is its read-only properties, its **actions** are its
functions and its **events** are its signals. A shell lays blocks out
with QtQuick items, binds to their state, handles their events and
calls their actions. It can do nothing else. Built: `ljos-web/live`
(`packages/runtime/Ljos/Blocks/live.js`), the shell mode of the
in-page compiler (`crates/ljos_web/src/shell.rs`), and its evaluator
(`Ljos/Blocks/shell.js`).

A site that turns this on takes on what is under *What a kept shell
costs a site* below: for a visitor who keeps a shell, Settings and
`QtQuick.LocalStorage` are kept by no write until Reset.

**Pipeline, as built.**

```text
 build: vite qml({ liveShell: true | { site } | (file) => … })   (default off)
        buildSite({ dir, liveShell: true })                       (A12)
   ├▶ each block (a `# block` line names its file) is held: one instance a page
   └▶ the entry carries Entry.$live = { site, blocks: [contract + component] }
        (`qmlc --shell` reads the contracts from the qmldir lines, of the
        modules the entry's compile finds, by the compile's own lookup; a
        module with no block is a library, and an entry that offers none is
        told so in a warning)
 page:  liveShell(Entry, element, { site, publish, storage, file, allowedHosts })
        a region with "Open a shell…" (a file picker), Reset, Publish
        (only with a hook), a status line, and the drop zone over the page
   1. the visitor drops or picks Shell.qml
   2. a module Worker (shell-worker.js) fetches ljos_web_compiler.wasm
      (first drop only) and compiles { shell: { text, blocks } }
   3. → { diagnostics: [{ line, column, message }] }  shown in a role=alert
        panel over the old shell as `Shell.qml:L:C: message`; it keeps running
      → { shell: ljos_ir CompiledFile }  objects + tier-1 programs, no JS
   4. import("./shell.js") → shellOf(ir, blocks) → reload(handle, Shell) (A13)
   5. localStorage["ljos-shell:" + site] = text; a page load shows it again
   6. Reset forgets it and reloads the page
   7. Publish → publish(text, { blocks: [{ module, name, version }], hash })
      (hash: the text's SHA-256, hex); its { url } or its error is shown
```

- **The compiler** is the page's own (A15), `ljos_web_compiler.wasm`,
  answering a second kind of request. In shell mode the front end
  resolves every name at compile time against a closed scope:
  - the shell's ids and its declared properties;
  - its blocks' contracts;
  - the QtQuick types `Item`, `Rectangle`, `Text`, `Row`, `Column`,
    `Grid`, `Flow`, `MouseArea` and `Image`;
  - `Accessible`, the one attached type a shell may write, values
    only (a name, a role and their kin, not its handlers nor the
    members whose value is an item): a shell's own buttons say
    what they are with it, and it makes and reaches nothing;
  - pure builtins: `Math.*`, `qsTr*`, Qt's value functions
    (`Qt.rgba`, `Qt.point`, `Qt.lighter`, …) and a primitive's own
    methods.

  Anything else is refused, with a diagnostic at its line and column.
  What comes out is `ljos_ir` (at ljos-ui 0cd3287c, built for wasm32
  without `ljos_engine`): the object tree, plus a tier-1 program for
  every binding and handler. A program's numbers travel as the decimal
  string of their bits, so a double survives JSON.
- **The evaluator** (`shell.js`) is a switch over tier-1 ops in JS. It
  has a budget of 100,000 steps per run. **DECISION** (lead): it runs
  in JS on the page's graph, not in the kernel wasm. Bindings become
  getters that Solid tracks, as compiled QML's are. One evaluator for
  every platform is left for when tier-1 runs natively as well.
- **Carrying state.** Blocks are the site's: a use of a block written in
  a shell, with `liveShell`, is held (`held.js`), so there is one instance
  per page for each name a shell gives it and each use of that name
  (`Basket#basket`), which every shell that names it shows. A page with
  two live shells shares them too. All else a use says lasts as long as
  the use: what it sets is a layer over the block, what it handles is
  connected, what it writes inside it is put where the block's file puts
  children, what it declares (properties, signals, aliases, functions)
  is kept on an object of its own and reached through the instance, and
  what it attaches is the instance's until the shell goes. A use that
  says what the block has no member for is warned of. The block's state
  is the block's. What comes and goes while the page runs (a Repeater's
  rows, a Loader's item, `createObject`) is not held: it is made anew
  and goes when it goes, and survives a new shell only as a plain item
  does. A plain item is carried by `reload` (A13): it is matched by
  `id` or `objectName` and keeps what the program gave it while it ran.
- **Errors inline.** Compile errors keep the old shell and say
  `Shell.qml:line:column: message`. When a program throws or runs out
  of budget at run time, the evaluator warns
  `Shell.qml:L:C: the binding of text ran past its budget of 100000
  steps and was stopped`, and the binding keeps its last value.
- **Publish hook.** It is an interface only:
  `publish(text, { blocks, hash }) => Promise<{ url? }>`. ljos-web
  calls it when the visitor presses Publish, and shows the url or the
  error. Endpoint, auth and storage are the site's.

**Security: a shell has no more power than the site's blocks.** Each
item holds by construction in the compiler. The evaluator checks it
again at run time, in case a program says more than the compiler let
it.

1. *No code but IR.* A shell never becomes JavaScript: there is no
   `eval`, no `Function`, no `import()` of its text, no Blob URL and
   no `<script>`. The page's CSP `script-src` needs neither
   `unsafe-eval` nor `blob:`.
2. *Closed scope.* There is no global object: `window`, `document`,
   `eval`, `fetch`, `XMLHttpRequest`, `Qt.openUrlExternally` and
   `Qt.createQmlObject` are all refused, and so are `this`, `new`,
   functions, arrow calls and object literals. A shell may import only
   `QtQuick` and the block modules the entry uses, without `as`.
3. *No reflective escape.* A member is read by its name only;
   `x["constructor"]` is refused. At run time, a read never yields a
   function, the page or a DOM node; names starting with `$` or `__`
   and `constructor`/`prototype` are refused; an index is only into an
   array or a string.
4. *Nothing leaves for another site.* A shell cannot write an address:
   `Image.source` takes only a URL that a block gives (a block's `url`
   state). A literal, or a URL built by concatenation or added to, is
   refused, and a shell declares no `url` property, nor anything over a
   member its object's type already has. Rich text would load what its
   `<img>` names, so a shell's `Text` is plain: `textFormat` is refused
   and forced to `PlainText`. But a shell can give a block any string,
   and a block can pass it on by a way nothing can follow, so the page
   enforces this where an address is loaded (`guard.js`). While a dropped
   shell is shown in any live shell on the page, an `Image`, and every
   other thing that loads an address (pictures, fonts, shaders, models,
   media, map tiles, `XMLHttpRequest`, sockets, `Qt.openUrlExternally`),
   fetches only from the page's own origin, the runtime's, `data:` and
   `blob:`, or a host every shown shell's `allowedHosts` names. Anything
   else is not asked for: it fails as a failed load does, and is warned
   of once. A style is an address too: `background` takes a picture as
   readily as a colour, so a colour must be all colour and a style made up
   of colours may call only what is known to load nothing; anything else is
   not used, and is warned of once. The site's own blocks are under the same
   rule while the shell is shown, as a block cannot tell whose string it has. No markup on the
   page loads a picture or links anywhere at all, the hosts allowed
   included. The guard is not lifted while the page lasts, by a
   `dispose` either: a block keeps what a shell hands it, in its state, a
   model, a closure or a timer, and no string says whose it is. Reset
   forgets the shell and reloads the page, which is what takes all of it
   away: the site's shell comes back as on a first visit, and block state
   that only the page held comes back as the block starts. Between one
   dropped shell and the next the blocks keep everything; the guard is up
   all that time. Settings and `QtQuick.LocalStorage` written while the
   guard is up last as long as the page, so the next page, which has no
   guard until it shows a shell, has none of the shell's strings; the
   first such write warns once, and `LocalStorage`'s `saved()` answers
   `false`. A kept shell is shown again on each visit, so see *What a
   kept shell costs a site* below. What this does not reach: storage or a server of the site's own that its
   scripts write without those types (`localStorage`, `indexedDB`, a
   request to its own origin). A string a block sends there comes back
   unguarded when the site reads it back and fetches it: a site whose
   blocks do that treats it as anything a visitor typed.
   A refused `XMLHttpRequest`
   tells a program what one that failed on the network tells: `DONE` with
   status 0, then `error` and `loadend`.
5. *Bounded work.* Each run has a budget of 100,000 steps. A runaway
   binding is stopped and warned of, and the page keeps running.
6. *Storage scoped.* Only the shell text is stored, under
   `ljos-shell:<site>`, and Reset deletes it. A stored shell is
   compiled and checked again on every load, by the compiler the page
   ships that day.

A block's state is written only by the block: when a shell assigns or
binds `count`, it is told "`count` is a state of Basket: only the block
writes it". A shell calls only its blocks' actions: `basket.destroy()`
is refused.

**What a kept shell costs a site.** A kept shell is shown again on every
load, so the guard is up on every page that visitor opens, from just after
the page starts. Until they press Reset, what any block writes to `Settings`
or `QtQuick.LocalStorage`, the site's own blocks included, reads back on
that page and is gone on the next, where the last value kept comes back.
The first such write on a page warns once (`console.warn`), and
`LocalStorage`'s `saved()` answers `false`. A site whose data must outlive
the page sends it to its own server while a shell is shown (rule 4 says what
that leaves it to treat with care). Shells are kept even so: not keeping them
would take the feature away.

**CSP.** The page runs under `script-src 'self'`. WebAssembly cannot be
compiled under that policy, so the compiler runs in a dedicated module
worker. A worker gets the policy of its own response, so the host
serves `shell-worker-*.js` with `script-src 'self' 'wasm-unsafe-eval'`
(or with no CSP header). Nothing the worker makes reaches the page but
the JSON it posts. `site-tests/live.spec.js` serves a built site that
way. The same test with the worker under the page's policy fails, so
the header is what lets the drop work.

**Size.** A page built without `liveShell` does not move: 149,629 B
gzip, as before. A site built with it carries 4,935 B gzip more
(`live.js`, `held.js`). The first drop also fetches `shell.js`
(3,033 B gzip), the worker (458 B) and the compiler (1,142,198 B gzip,
the same file as A15).

**DECISIONs as built.**

- The ADR 0003 terms replace the working names. There is no
  `registerBlock`: the `qmldir` line is the registration, and
  `packages/runtime/shell/` became `Ljos/Blocks/{live,held,shell,shell-worker}.js`.
- The module is exported as `ljos-web/live`, lowercase like
  `ljos-web/object`. It is no QML module, so it is not in
  `modules.json`.
- A shell declares only `int`, `real`, `double`, `bool`, `string` and
  `color` properties. Aliases, `var`, lists, `url`, signals,
  functions, inline components, enums and value sources (`on`) are
  refused.
- Blocks are held per name, not as page-wide singletons. Two shells
  that give a block the same id show one instance; a new id is a new
  one.
- A shell whose root is of another type than the shown one is a new
  tree, as any reload is (A13). Its plain items start anew, while its
  blocks keep their state.
- `buildSite` gives no publish hook, since a bundle has no code of its
  own. A page that mounts itself passes `publish` to `liveShell`.
- Only shell text is stored and published, never IR.

**Scenarios.**

- `packages/runtime/tests/drop.spec.js` (both kernels, 16):
  - a dropped shell is shown and keeps the block and a plain item's
    state;
  - opened from a file with the keyboard;
  - dropped as a file;
  - a broken shell says `Shell.qml:4:…` and the page runs on;
  - six refusals, one each: `window`, `eval`, `Qt.openUrlExternally`,
    `x["constructor"]`, a URL literal for `Image.source`, an import of
    `QtQuick.Controls`;
  - a block's URL is one a shell may show;
  - a runaway binding;
  - a reload of the page restores the shell;
  - Reset;
  - publish, and a publish that fails.
- `site-tests/live.spec.js`:
  - a site built without `liveShell` has no drop and fetches nothing
    of it;
  - a site under `script-src 'self'` runs a dropped shell.
- `crates/ljos_web/tests/shell.rs`: contracts, the IR, and every
  refusal.

### A10. Where 3D plugs in

`View3D` stays a Solid item whose DOM is a `<canvas>`: Solid owns the
element, its size and its place in the tree; **the wasm side owns the
canvas's contents** — the Quick3D track's one wgpu crate renders into
it (WebGPU, WebGL2 fallback) from the scene nodes, whose properties
are graph nodes like any other (seam K), so a QML binding on a
`Model.position` is a graph edge, and a change bumps a scene-side
watch that schedules a frame (no polling, A8). Input on the canvas is
delivered by the runtime's pointer code and picked in wasm. ljos-web
builds nothing 3D; it provides the canvas, the frame clock and the
graph.

As built so far (A25): the wgpu crate is reached through
`crates/ljos_web_3d` and is opt-in per page, `?view3d=wgpu` or
`VITE_LJOS_VIEW3D=wgpu`; the default is still `QtQuick3D/render.js`.
Picking stays in JavaScript (`pick.js`), not wasm.

### A11. Decisions taken in phase 1 (summary)

Each is stated where it is argued; listed here for review:

1. Build-time kernel choice via `#kernel` + `ljos-wasm-kernel` (A2).
2. `ljos_web_kernel` moves to ljos-ui as `ljos_web`; one wasm per page (A2).
3. Move by semantics, gated by `@web` scenarios on both kernels (A3).
4. Values stay in JS; the graph holds versions; u32-only raw imports, no wasm-bindgen for the kernel (A4).
5. JS throws are stashed and rethrown, never unwound through wasm (A4).
6. Runtime Solid signals migrate to `#kernel` `signal()`/`version()` (A4).
7. `@web` starts from what ljos-web already passes (A7).
8. Loop divergences go into ljos-ui `features/` and `ljos_reactive`, not JS glue (A7).
9. Blocks take ADR 0003's terms: a `# block` qmldir line, state = read-only properties, actions = functions, events = signals (A9).
10. Shells compile to tier-1 IR, never JS (A9).
11. A block is held per page, one instance per name a shell gives it; shells show that instance (A9).
12. Only shell text is stored/published (A9).
13. A graph evaluation owns what it makes, ended after the next one (A4).
14. The module list is a committed file kept equal to the package by a test, not derived where it is read (A12).
15. A reload remakes the tree and carries state onto it; `Component.onCompleted` runs again (A13).
16. Same text is the same compiled declaration; an edited one wins over a run-time value (A13).
17. Only a root mounted `reloadable` records its tree; on by itself in a dev server (A13).
18. `reload(root, Component)` knows no build tool; Vite and the live drop both call it (A13).
19. The compiler in the page is `qmlc`'s, with the full type table; compiled files link as blob modules, through stand-ins only around a cycle (A15).
20. Shell mode is part of the in-page compiler's front end: names resolved against a closed scope, `ljos_ir` out, a JS evaluator with a step budget (A9).
21. The shell compiler runs in a module worker served with its own CSP (`'wasm-unsafe-eval'`); the page keeps `script-src 'self'` (A9).
22. `liveShell` is opt-in; a page without it does not move and fetches nothing of it (A9).
23. A shell declares only value properties; its text is plain; `Image.source` takes only a block's URL (A9).

### A12. A site from a directory, and the modules a commit provides

A program that writes a site's files (a designer's export, a script)
need not know how ljos-web compiles or bundles them. It writes a
directory and `ljos-site.json` (format `ljos-site`, version 1, target
`web`: the entry, its theme, every file with its size, the project's
modules with their qmldirs, the modules it imports), and
`ljos-web build-site DIR` (`buildSite({ dir, out })` of
`ljos-web/site`, `mise run site:build DIR`) writes `index.html` and
its assets. The manifest is held to its words before anything is
compiled: an unknown field, an unlisted file, a listed one missing or
of another size, a path out of the directory, a link, a module
without its qmldir and an import ljos-web does not provide are each
refused with what was wrong. The entry is compiled with the directory
as the project's root; a site's controls are Ljós's own style (A20),
so Qt is needed only for a style Ljós has none of (Imagine) or with
`--styles qt`, and Ljos.Design's QML is given with `--with`. A site it
built is replaced (it leaves a `.ljos-site-build` stamp); any other
directory is not. The theme is checked, applied (A14) and carried
into the site as it is.

What a commit provides is `packages/runtime/modules.json`
(`ljos-web modules --json`): each module, where its types come from
(`runtime`, `qt`, `ljos`), and what building with it needs (`qt`,
`with`). It is committed, so a program pinned to a commit reads it
without running anything, and a test keeps it equal to the package's
exports.

### A13. A reload that keeps state

`reload(root, Component)` (`ljos-web/reload`) gives a mounted root a
new component and keeps its state where it can, by desktop Ljós's
rule (ljos-ui ARCHITECTURE.md §12.1). Each object of the new tree that
is an object of the old one is found by its key: its `id`, within the
component it is written in, wherever it moved there; else its
`objectName`; else its row, for a view's delegate; else its type and
how many siblings of that type without an id or a name come before
it. An `id` renamed is a new object. One whose type changed is made
anew, and so is everything below it. Two old objects with one key
(two Repeaters of one delegate type in one parent) give neither: the
new ones start from the file. A matched object keeps what was
assigned to it while the program ran — by a handler, by the user
(typed text, with its selection), by a script — and the keyboard
stays with it; a value that was an object of the old tree is that
object's match, or `null`. Bindings and handlers are the new file's,
so a binding the program replaced by a value stays replaced only
while its text is unchanged.

**DECISION:** what the file says of a property is the same when the
compiled declaration is: the same literal, or a binding whose
compiled function reads the same. An edited declaration wins over a
run-time value, as on the desktop ("a declaration that was edited
wins"). The compiled text names objects by handles (`$1`) that an
edit elsewhere can renumber; such a binding counts as edited, and the
file wins — never a value that should have gone.

**DECISION:** the web makes the whole new tree and carries state onto
it, then puts its root where the old one was and disposes the old
one; the desktop keeps a matched object and rebinds it. So
`Component.onCompleted` runs again for every object, where the
desktop runs it only for new ones, and a running animation or timer
starts again from what was carried. Keeping objects would need every
type of the runtime to take a new set of props in place, which no
type of it does today.

**DECISION:** the tree is recorded (each object's creation parent,
its `id`, its view row) only for a root mounted with
`{ reloadable: true }`. A dev server turns that on for every root once
a compiled QML module is loaded; a production page never imports
`reload.js` and pays a few hundred bytes for the hook. The compiler
gives an object its `id` as it makes it (`$object("field")`).

**DECISION:** a component that throws as it is made is a
`ReloadError` and changes nothing: the last good mount stays. A save
that does not compile never reaches the runtime: Vite answers its
500 with the compiler's message, and the plugin leaves the mount as
it was.

**DECISION:** `reload` knows no build tool. The Vite plugin's `.qml`
modules accept their own update and call it for each root mounted
from the old component (a file nothing mounted makes its importer
run again); the live drop (A9) calls it with what the in-page
compiler made of the shell. Not carried yet: objects a script made
(`createObject`) and a Loader's item are made again by what makes
them; a ListModel's rows are what its text says; a StackView's
stack is its initial item.

### A14. The theme on the web

ljos-ui's `docs/theme.md` (at 0cd3287c) is the contract, and ljos-web
reads a theme as it says. **Which file:** a named one wins (the Vite
plugin's `theme` option, a site manifest's `theme`), and a named file
that is not there is an error; otherwise the `theme.json` nearest the
entry, from its directory up to the project's (the plugin's `root`, the
`--root` it compiles with, else the entry's own directory) and no
further. One file, never merged. **Checking:** `ljos_web::theme` is
`ljos_design::theme` (git, rev 0cd3287c, beside the other ljos-ui crates
at their own pin: the two revs coexist), with no filesystem, so it builds
for wasm32; `qmlc --theme FILE`, `--theme-for ENTRY --root DIR` and
`--seed-hue N` print the checked overrides as JSON (`null` for none), or
each refusal as `file:line:column: message`. A refused theme is refused
whole. **Applying:** `override(object, key, content)` in the runtime puts
a value or a binding over any property, and taking it off gives the
property what was under it, its binding included; `ljos-web/theme` puts
a checked theme on Ljos.Design's singletons as such overrides. Nothing is
made again, so a change keeps all state.

- DECISION: singletons are found by their module's name
  (`$singleton(…, "Ljos.Design.Colors")`, which the compiler now emits for
  a file that is a module's type), so the runtime needs nothing of
  Ljos.Design itself and a singleton made later takes the theme as it is made.
- DECISION: a colour's variants are one binding on `Colors.dark` and
  `Colors.highContrast`; a variant the theme does not give reads what is
  under the override, the module's own.
- DECISION: a write to an overridden property goes to the override, as in
  Ljós; removing the override gives back what was under it.
- DECISION: one theme per page, the last mounted entry's. The plugin gives
  each entry (a QML file something other than QML imports) a theme module;
  `mount` applies it, and in the dev server a change of the file reloads
  only that module, which applies it again. A refused change shows Vite's
  error and leaves the page's theme.
- DECISION: the theme is checked when the entry loads too, so a host that
  compiles through Vite (`transformRequest`) hears the refusal as the
  entry failing, with the diagnostics.
- DECISION: the site builder searches the manifest's listed files (the same
  search, `findTheme`), checks with `qmlc --theme` before Vite runs, and
  refuses the site on a refusal.
- DECISION: a host holding files in memory calls `applyTheme(text, { file,
  check })` → `{ ok: true }` or `{ diagnostics }`, and `removeTheme()`. The
  check is the host's compiler (`qmlc --theme`, a server, or the compiler in
  the page once it runs there); the runtime writes no second checker.
  `findTheme(names, entry, { project })` is the search for such a host.
- DECISION: contrast is held at the module's seed hue unless the theme or
  the plugin's `seedHue` says another.
### A15. The compiler in the page

`ljos-web/compiler` compiles QML in the page and runs it on the modules
the page already has: what a program that edits QML as it runs needs
(an editor's preview, a reload, a file opened that was never built).

```js
import { compile, createCompiler, translate } from "ljos-web/compiler";
const made = await compile({ files: { "Main.qml": text, "Panel.qml": other }, entry: "Main.qml", aliases: [] });
// { component, module, warnings } or { diagnostics: [{ message, file, line, column, endLine, endColumn, severity, code? }] } (A31)
mount(made.component, element);
```

`files` maps a path of the project to its text; `entry` is the file to
compile, with every file of the project it imports; `aliases`
(`[{ module, dir }]`) make a module the directory of the project it
names, as `ljos run --alias` does (a file directly in `dir` is the
module's, and an error in it names it by the path it was given as).
`createCompiler({ modules, base })` is the same with the page's modules
(`{ "ljos-web/QtQuick": () => import("ljos-web/QtQuick"), ... }`;
the default is every module the runtime package exports, and
`solid-js`) and the address the files are at (default
`document.baseURI`). `translate` answers each file's module as `qmlc`
prints it, unlinked.

**Pieces.**

- `ljos_web::files`: a project's files through one interface
  (`Files`), from the disk in `qmlc` and as texts (`Memory`) in a page.
  Its discovery is `qmlc`'s, moved out of the binary: the root, import
  paths, `qmldir` modules, `# block` lines, file selectors and the
  "not installed" error.
- `ljos_web::given`: compiles the entry and every file it reaches,
  each as `qmlc --root DIR` compiles it, and says how they link: the
  UTF-16 spans of each specifier and of each `import.meta`, and each
  file's exports (`export *` of a sibling followed). A file that does
  not parse is left out of the project, so what imports it is told the
  type is unknown; when a compile fails, every syntax error of the
  project's QML comes first, as that is why.
- `crates/ljos_web_compiler`: that, as wasm. A JSON text each way
  through memory the page asks for (`alloc`, `compile`, `answer_len`,
  `free`), no wasm-bindgen: a compile is one call and its texts are
  the bulk of what crosses. A panic aborts; the next compile starts a
  new instance of the module fetched once.
- `packages/runtime/compiler/`: `index.js` (what a page imports, 638 B
  gzip), `modules.js` (the default modules, each a dynamic import, kept
  equal to the package's exports by a test) and `link.js` (the loader
  and linker, imported on the first compile with the wasm).

**DECISION: the type table is `qt_types`.** The compiler is the one
`qmlc` is, `qml_front` included, and `qml_front` reads Qt's types
from `qt_types`: the same table is what makes the same output (property
types, enums, defaults, which module has what), which the scenarios
hold it to. `qt_signals` (ljos-ui main `0cd3287c`, 26.7 kB gzip
measured there) has the signals only and is not on the revision
ljos-web pins, so output from it would differ. In this wasm Qt's table
is 614,411 B (110,751 B gzip) and Ljós's own (`ljos.txt`) 298,733 B
(49,762 B gzip): about 160 kB of the 1,085 kB gzip. The rest is the
compiler: oxc's parser (twice, the QML fork and crates.io's, each with
its regular-expression parser), semantic and codegen, the Solid
compiler and the `html5ever` it validates templates with. Those are
where it gets smaller.

**DECISION: the size.** The compiler's wasm is not part of the page
budget (A8): a page that never compiles never fetches it (`index.js`
imports `link.js`, which fetches the wasm, only inside `compile`), and
`test:size` fails a page bundle that has it. It has its own line,
1,300 kB gzip for the wasm and 5 kB for its JS: what it is, with room
for Qt's table to grow, so that what would add to it (another parser,
a table twice) is seen when it comes. It was 1,200 kB until the Ljós
dialect (A31): ljos-ui's front end at its pin is 29 kB more (1,185 kB
to 1,214 kB), and the dialect 32 kB (the TypeScript erasure and checks,
and the table of where Qt's members went, which the `Qt` error names). `opt-level = "z"` (its own
profile, `compiler`): 1,084 kB gzip against 1,251 kB at "s" and
1,366 kB at 2; a compile runs once per edit, off any frame's path.

**DECISION: how compiled modules link.** Each compiled file becomes a
module at a blob URL with its specifiers rewritten.

- An import map cannot be added to once a page has loaded a module,
  and a registry the runtime gave would make compiled QML other code
  than `qmlc`'s.
- A project's files import each other in cycles, and a file may import
  itself (a component that names its own file). A blob URL is made
  from a finished text, so two files cannot name each other's. So a
  file is made after the files it imports and imports their blobs, whose
  exports stay live (an `export let` the file reassigns is read as it is
  now). Only an import back into a cycle, of a file not made yet, goes
  to that file's **stand-in**: a module with no imports that exports
  the file's names as bindings, set once the file has run. The linker
  runs the files in the order they import each other (cycles aside) and
  sets each stand-in before the next runs, so what a file does as it
  runs (`Object.setPrototypeOf(Panel, Base)`) has the files before it.
  Bindings through a stand-in are set once, so a reassigned export is
  read live everywhere but across a cycle's back edge.
- A module of the page's (`ljos-web/QtQuick`, `solid-js`) is a
  **bridge**: a module that re-exports what the page's own import of
  it gave. Compiled QML and the page's QML share one instance of each:
  one `Item`, one clock, one kernel (a `flush` of the page's runs what
  the compiled bindings wait on).
- `import.meta.url` is the file's address (`new URL(file, base)`), not
  the blob's, so a path a file names (`images/logo.png`,
  `../assets/boxes.ttf`) is taken from where the file is.

A second compile is new modules: the old ones stay as long as
something holds what they made.

**DECISION: Qt Quick Controls.** A style of Qt Quick Controls is QML of
Qt's own (README, "Use"), which a page has only when it was built with
it (requests 13 and 36). A compile that imports a module the page did
not give is refused at the import, as one nobody has:
`Main.qml:2:1: module "QtQuick.Controls" is not in this page: the
styles of Qt Quick Controls are QML of Qt's own, which a page has only
when it was built with them (ljos-web requests 13 and 36)`. A page
built with them gives them: `createCompiler({ modules: { ...modules,
"ljos-web/QtQuick/Controls": () => import("ljos-web/QtQuick/Controls")
} })`, and what it compiles uses the controls the page has. A module
given under `ljos-web/Q…` is installed for the compile too, so the
page's own build of a module of Qt's (`Qt5Compat.GraphicalEffects`)
is imported as it is in the page.

**And A9.** The same wasm answers A9's live shell, in another mode. A
`{ shell: { text, blocks } }` request resolves every name against a
closed scope and answers `ljos_ir`, never JS, so a dropped shell has no
more power than the site's blocks. The mode in this section is for a
program that compiles its own QML (its author's, not a visitor's) and
wants exactly what `qmlc` makes of it. It links blob URLs, so a page
with a CSP needs `script-src blob:` for it. The shell drop needs
neither `blob:` nor `unsafe-eval`: it runs the wasm in a worker served
with `'wasm-unsafe-eval'`, and the page runs only data.

**Scenarios.** `packages/runtime/tests/compiler.spec.js` (both
kernels): a compile in the page is what `qmlc` makes of the same files
(four scenes with project imports and a singleton), it mounts on the
page's modules, a singleton is one object for every file, a syntax
error and an unknown module are diagnostics with file, line and column,
Controls a page was not built with names requests 13 and 36, an
aliased module is its directory, a page that never compiles fetches no
compiler, and a second compile reuses the one the first loaded.
`crates/ljos_web/tests/given.rs` holds `given` to `qmlc` from the
disk on the module fixtures.

### A16. A mounted root, inspected and driven

`inspect(root)` of `ljos-web/inspect` answers what Ljós's own
inspector answers of the same file, in the same shapes, so that a
host (a test, a devtools panel, a designer's preview) maps one onto
the other without translating:

| `inspect(root)` | native |
|---|---|
| `read(id, names)` → `{ name: value }`, null for no such id | `app_get_property` |
| `write(id, name, value)` → whether there was an object; the property's binding is gone, as an assignment's | `app_set_property` |
| `click(id)`, `click({ at: [x, y] })` → `{ at }` or `{ error, message }` (`not_found`, `not_actionable`) | `app_click` (`target`, `at`); it answers with a snapshot delta, this with the point |
| `outline()` → `{ objects: [{ depth, type, id, object_name, item, children }], text }` | `app_objects`, with objects for its `@handle`s and no bytes |
| `pick(x, y)` → `{ object, type, id, source: { file, line, column } }` or null | `app_inspect`'s source location, of the object on top at the point |
| `logs(since)` → `{ entries: [{ level, category, message, file, line }], next_since }` | `app_logs` |

Where things are written comes from the compiler, and only when it is
asked: `qmlc --inspect NAME` (the Vite plugin's `inspect`, true or a
function of the file) puts `$at` (`[file, line, column, type]`), `$id`
and, on a file's root, `$ids` among an object's props; it makes each
free `console` `$console([file, line, column])`, and wraps each binding
that can fail in `$bound([file, line, column], () => value)`. A file
compiled so imports `ljos-web/inspect` before it makes anything. A file
compiled without it has none of this, and the runtime has no code for
it: `mise run test:size` is the same to the byte with and without this
module in the tree.

- DECISION: places are put in by the compiler, not looked up from a
  source map. A source map says where generated code came from, not
  which object or binding it is, and a page built for use has none.
- DECISION: the runtime pays nothing. A binding's warning gets its
  place from what the binding throws (`$bound` gives the error a
  `toPrimitive` that says where it is, used when the runtime makes the
  `key: error` line), not from a hook in the runtime. So `Unable to
  assign …` and an alias's refusal, which nothing throws, are logged
  with no file or line; so are `Qt.binding` and what a `.js` script
  logs.
- DECISION: a file is named by its path from the project's root (from
  Vite's root for the plugin), not by a URL.
- DECISION: ids are a file's own. `read`, `write`, `click` and `find`
  name the root file's ids; a component's are reached through
  `inspect(theObject)`. An object is listed with the id and type written
  where it is used (the type without its import's qualifier), and a
  delegate's objects where the delegate is written.
- DECISION: the outline lists objects in the order of Qt's `data`
  (what is not an item first, then the children, a Repeater's rows
  before it, a Loader's item inside it), with the objects themselves
  instead of the native handles and sizes.
- DECISION: a point is in the root's logical pixels; its right and
  bottom edges are outside it. A click is the pointer and mouse events
  a real one makes, dispatched where the page draws on top at that
  point (`isTrusted` is false: what checks it does not see them). An
  object is clicked at its centre, so what covers that centre gets it.
- DECISION: one log for the page, the last 1000 lines, kept from when
  the module is first imported.

Where the web cannot answer as natively: bindings are lazy here, so a
binding nothing reads is never evaluated and never warns, where qml6
warns of it as the object is made. A picture of the root is A17.

### A17. A picture of a mounted root

`inspect(root).screenshot({ target, scale, max_size })` is
`app_screenshot` of a window or an object: a PNG of what the page draws
of the root, `{ png, width, height, scale, bytes, area }` (`png` the
bytes, `width` and `height` its device pixels, `scale` device pixels to
a logical pixel, `area` the part of the root as `[x, y, width, height]`
in logical pixels). `target` (an id or an object) pictures the part of
the root it covers; `scale` is the page's `devicePixelRatio` unless
given; `max_size` makes the scale smaller when the longest side would
be longer. It is `ljos-web/picture`, imported the first time a picture
is asked for, so a page that takes none loads none of it
(`mise run test:size` is the same to the byte).

A browser gives a page no pixels of its own DOM, so the picture is
drawn again: the root's elements are copied, each with every style the
browser computed for it that a document with no style sheet would not
give it, into an SVG `<foreignObject>`, drawn into a canvas, read back
as a PNG. What the copy cannot carry is given to it as data: a
canvas's drawing, a video's frame, each image and each font (a
`FontLoader`'s file or a style sheet's `@font-face`), and a scrolled
element's offset as a shift of what it holds. The root is put at the
picture's origin, so where it is on the page (scrolled, moved, scaled,
turned) changes nothing.

- DECISION: the DOM, copied with its computed styles, not the runtime's
  own description of what it draws. Solid draws with the browser's
  engine (text shaping and wrapping, borders, gradients, clips, filters,
  Shapes as SVG); a second drawing of the scene would be a second
  renderer to keep alike, and would differ from the page where the page
  is right. The copy is laid out and painted by the same engine. The
  tests compare the picture with Playwright's screenshot of the page
  pixel by pixel, at device pixel ratios 1 and 2, on both kernels.
- DECISION: what a picture cannot show refuses it, `{ error:
  "not_supported", message }`, naming the object (`` `Image#flag` shows
  http://…, which is from another origin that does not let this page
  read it ``), rather than leaving it out. Refused, when shown inside
  the area: an image or font from an origin that does not let the page
  read it; a WebGL canvas without `preserveDrawingBuffer`, a WebGPU
  canvas; a frame (`iframe`, `object`, `embed`); a shadow root; a
  scrolled text field; a `::before` or `::after` that is not text; a
  font a script made from bytes (`new FontFace(name, bytes)`), whose
  bytes the page does not keep. Safari will not read back a canvas that
  had HTML drawn into it, so there every picture is refused.
- DECISION: where the root draws nothing the picture is transparent,
  as a picture of an object is; the page's own background behind the
  root is not the root's.
- DECISION: an animation or transition is pictured where it is now:
  the copy carries the computed values and none of the animations,
  which would start again from their beginning in the copy.
- DECISION: nothing is kept between two pictures. A frame with no style
  sheets, which says what a style is by default, is made for each
  picture and removed after it; nothing waits or watches (0 % CPU when
  idle, a test counts every timer and observer made).

Unlike native: there is no `max_size` unless asked (native's is 1280
pixels), and a picture is of what the page shows, so a field that hides
its text is pictured as the page hides it, with no secrets painted over
(`--mcp-redact`).

### A18. Types written in Rust, standing in

A program that registers types from Rust describes them in
`ljostypes.json` (format 2), which native `ljos types` writes. Natively,
`ljos run --types` makes a stand-in of each: a QML type with the dump's
properties at their defaults, its enums, its signals, and methods that
do nothing, so the project's QML previews with no Rust behind it.
`qmlc --types FILE.json` (repeatable) does the same, and so do the Vite
plugin (`types`, a list or a function of the file) and `ljos-web/compiler`
(`types` among `{ files, entry, aliases }`). Without one named, the
plugin reads every `ljostypes.json` under the project's root (its
`--root`), and the in-page compiler every one among its files; the dumps
read run as one. A dump that does not read stops the compile with its
`file:line:column` and the reason; nothing is drawn from the others.

With the types known, a member a type does not have is a compile error
where it is written, in native Ljós's words: `` `volum` is not a
property of `Player` ``, `` `onEnded` handles the signal `ended`, which
`Player` does not have ``, `` `font.weigth`: `font` has no property
`weigth` ``. Types whose members are not all known (a module that is not
described) are not checked.

- DECISION: stand-ins are never written to disk. They live under a
  virtual `.ljostypes` directory of the root, which qmlc and the plugin
  resolve, so a project's tree is the one its author wrote.
- DECISION: a project's own QML or a mock (`-I mocks`) of the same
  module and type wins over a dump's, as natively in the mocked state.
- DECISION: every `ljostypes.json` under the root, not only the root's
  own (which is all native reads): a project made of crates has one per
  crate. Dot, `+` and `node_modules` directories are not looked in.
- DECISION: `--types` names a dump only when its argument ends in
  `.json`; otherwise it is the old `--types MODULE` (Qt's C++ types of a
  module).
- DECISION: a site build (`buildSite`) takes no dumps and still refuses
  `ljostypes.json`: stand-ins are for previewing, and a built site has
  the real types or none.
- DECISION: an edit to a dump is followed as the dev server follows any
  file a compile read; the dumps are walked again on each compile, which
  is a cost on a very large root.
- DECISION: what is given a stand-in is ordinary state: it shows at
  once, as any property's change does.

### A19. Ljós's own modules: `Ljos.Models`, and `Ljos.Observer` refused

`import Ljos.Models` is `ljos-web/Ljos/Models`, a module of the runtime
that only a page importing it carries. Its `JsonListModel` is the native
one's, member for member (`json`, `source`, `count`, `roles`, `status`
of `Null`, `Loading`, `Ready`, `Error`, `error`, `reload()`, `get(row)`):
the rows are the objects of a JSON array, the roles their keys in the
order first seen, and a change says only what differs, so the delegates
of the rows that stayed are kept. Text it cannot use leaves the rows as
they were, sets `error` to where and what (`3:7: …`) and warns
`QML JsonListModel: …`. ljos-ui's `features/models/json-list-model.feature`
is the specification; `tests/jsonlistmodel.spec.js` is it in Playwright,
on both kernels.

Where `source` is read from, and when it is read again:

| Where the page runs | First read | Read again |
|---|---|---|
| Vite dev server | `fetch` | on a save of the file: the plugin sends `ljos-web:file` over HMR for a file no module imports; nothing polls |
| a built site | `fetch`, once | on `reload()`, and only then |
| `ljos-web/compiler` | the files given to `compile`, never fetched | when a compile gives the file another text |

`ljos-web/files` is what the three share: `watch(url, read)` and
`changed(url)`, and `provide(url, text)` for a text a host has without a
server. A compile's files that are not code (QML, scripts, a `qmldir`) are
provided at their address, so a page that compiles QML reads them as it
was given them.

`import Ljos.Observer` is refused by qmlc with why: its `InspectorClient`
calls an inspector a token file on disk names. A page has neither; it
inspects itself with `inspect(root)` (A16).

- DECISION: `Ljos.Observer` is an error, not a type that fails at run
  time. It is no module of Qt's type table, only of the `ljos observe`
  window, and what it does (read a token file, call a process over the
  network) is what a page cannot; an error at compile time names that,
  where an empty type would fail later and say less.
- DECISION: a move is said as the rows between its ends changing. Finding
  moves pairs rows by a guess at what identifies one, which JSON does not
  say.
- DECISION: the dev server tells of a save again 60 ms later if the file
  is not as it was when it was told of. Vite's watcher drops a second
  change to a path within 50 ms of the first, and two quick saves (broken,
  then whole) would leave the broken one shown.
- DECISION: a dev server's answer of an HTML page for a file that is not
  HTML is "not there": that is its fallback for a path it does not have.
- DECISION: where broken JSON stops is found by the module's own scanner,
  run only on text `JSON.parse` refused. Browsers say it each their own
  way (an offset, a line and column, a piece of the text, or nothing), and
  `error` is the same whichever browser said it.
- DECISION: a site keeps a file a program reads as data (`.json`, `.txt`,
  `.csv`, `.xml`) as a file however small, unless the site sets its own
  `build.assetsInlineLimit`. Inlined as a `data:` address it could not be
  fetched again, and `reload()` would read what was built.
- DIVERGENCE: a relative `source` on the root of a component file is read
  beside the component, as `Qt.resolvedUrl` would. Ljós resolves it at run
  time against the file that uses the component; qmlc resolves a url when
  it compiles, against the file it is written in.

### A20. Controls without an installed Qt

`import QtQuick.Controls` compiles on a machine with no Qt. The
runtime has the C++ half of the controls (`QtQuick.Templates`, the
painters of `QtQuick.Controls.impl`); the QML half, a style, is
Ljós's own: ljos-ui's `crates/ljos_controls/qml` (Basic, Fusion,
Material, Universal and their `impl` modules), copied into
`packages/runtime/controls/` with a `qmldir` per module, which Ljós
does not write. So a control on the web is what it is in a native
Ljós application: a Button is 100×40 with padding 6, a CheckBox's
indicator 28×28, a Slider and a TextField 200×40, a ComboBox 140×40,
as ljos-ui's `features/controls` say of the same QML.

- DECISION: the style is copied, not depended on.
  `controls/LJOS_UI.json` names the repository, the path and the
  commit (the one `ljos_design` is pinned at in
  `crates/ljos_web/Cargo.toml`), and a sha256 of every file;
  `mise run controls` copies it again from a ljos-ui checkout
  (`LJOS_UI`, `../ljos-ui` by default) and a test holds the copy
  to its hashes and its commit to the pin. A git dependency would
  have the plugin fetch at build time; QML compiled ahead would
  hide which commit it came from. A page that does not import the
  controls carries none of it: a style is only ever compiled from
  the importing file. `mise run test:size` moves 11 B gzip, the
  runtime's hook for parts (below).
- DECISION: a site's controls are Ljós's whether or not the machine
  has a Qt, so a site draws as the native application does and builds
  the same anywhere. `--styles qt` (`buildSite({ styles: "qt" })`)
  takes the installed Qt's style instead. The Vite plugin takes Qt's
  where an installed Qt 6 has Qt Quick Controls and Ljós's where none
  does; its `styles` option, `"qt"` or `"ljos"`, says which. A style
  Ljós has none of (`QtQuick.Controls.Imagine`) comes from the
  installed Qt, and without one the site is refused with a message
  that says so.
- DECISION: only a Qt 6 is an installed Qt. The plugin and `qmlc` ask
  each of `qtpaths6`, `qtpaths`, `qmake6` and `qmake` for
  `QT_VERSION` first and skip one under 6, so Qt 5's tools on the
  path neither break the build nor give it Qt 5's QML.
- DECISION: a part a style gives as a `Component` (`background:
  Component { Rectangle {} }`, as Ljós's styles write it) is made by
  the control, once, as its own child; the property holds the item.
  One the application gives in its place is all there is: the style's
  is never made. The kind is `parts` of
  `QtQuick/Templates/parts.js`, so `object.js` has only a hook a kind
  may use to make its value inside the object.
- DECISION: where the runtime has a type natively that Ljós's style
  writes in QML because the native engine has none of it
  (`BusyIndicatorImpl`), the runtime's wins: it is what the runtime's
  painters draw.

What a reader is told holds (A7's `speaks`): Ljós's Button says
`button` and its text, CheckBox `checkbox` and `aria-checked`, Switch
`switch`, Slider `slider`, ComboBox `combobox` and its current text.
A TextField's text box is the input inside it, not the item.

### A21. Ljos.Blocks: slots, contributions, a user's shell

`import Ljos.Blocks` is `ljos-web/Ljos/Blocks`, Ljós's own module as
ljos_quick builds it natively (ljos-ui ADR 0003), held to the same
scenarios: ljos-ui's `features/blocks/slots.feature` and
`shell-loader.feature` at 0cd3287c, ported scenario for scenario to
`packages/runtime/tests/blocks.spec.js` on both kernels.

- **`Contribution`** (`slot`, `mode`: `Append`/`Replace`/`Prepend`,
  `delegate`, `order`) joins a registry of the page's by its slot's
  name while it lives. A Slot it is given in a list (`contributions`)
  shows it too, whatever its name.
- **`Slot`** (`name`, `contributions`, `delegate`, `count`) makes one
  item of each contribution's delegate beside itself in its parent, as
  a Repeater does, so a Row or a layout around it lays them out:
  prepended ones by `order` then the order they were made, its own
  delegate, then the rest the same way; a `Replace` takes the place of
  all before it. An item is kept while what it was made of is still
  shown. A handler of a contribution's item that throws is warned of
  (`Contribution: …`) and takes that contribution out of every Slot;
  the page goes on.
- **`ShellLoader`** (`source`, `fallback`; `error`, `item`, `status`:
  `Null`/`Ready`/`Fallback`/`Error`; `reload()`) shows `source`, or
  `fallback` when it does not work, and says why in `error` as
  `file:line: message`, as natively. A source that is a file of the
  build is compiled QML like any other. One that is not (a URL, a
  user's own `Shell.qml`) is fetched and compiled in the page with
  `ljos-web/compiler`, which is imported only then (one of a live code
  block's example is one of the example's files, or not there: A27); its objects are
  placed (`$at`), so what a handler of it throws is said at the line of
  the object it is written in. While a source is on its way (fetched,
  compiled, a module still to come) the stage is never empty: what is
  shown stands, and where nothing is yet the fallback stands in, with
  `status` still `Null` until the source has come or failed, so a page
  prerendered meanwhile is written with the app's own shell. The
  reader may use that shell meanwhile: a source that comes takes over
  as a reload does, keeping the state of what is in both (the two
  shells are of two builds, the app's whose files a minifier named and
  the one compiled in the page, so each object pairs by where it is and
  the type it is built on, whatever its file is called in either),
  and one that fails leaves the fallback, and what it holds, in place.
  A `reload()` that overtakes the first load (an edit made meanwhile)
  takes over from the fallback the same way, and a failed one leaves
  it standing with status `Fallback`. A fault while it is made, or in one of
  its handlers later, drops it and shows the fallback; a fallback that
  fails too gives `why\nfallback: …` and status `Error`; a fault in a
  fallback is the page's, as natively. `reload()` fetches and compiles
  the source again and answers why it failed or `""`: one that fails
  leaves the shell that runs; one that works takes its place and keeps
  the state of what is in both (`reload.js`'s `carry`, by id, name,
  row, or type and place, A13).

DECISION: where a throw in a shell compiled in the page is said is the
line of the object whose handler threw, not of the `throw`: compiled
QML has no map back to its statements, and the compiler places objects.

DECISION: a handler's throw goes to the boundary of the object it is
an object of (`$fault`, set by `bounded(boundary, make)` in
`object.js` and inherited by what is made inside it), else the page's
`reportError` as before. The boundary costs a page that never imports
Ljos.Blocks 53 B gzip (+103 B before gzip): it has to be where handlers
run.

### A22. The kernel at ljos-ui's graph, and what an editor asks of a page

The kernel's `ljos_reactive` follows ljos-ui (rev cb4a991a), whose graph takes a
mark for a value a type places: a loop through such a value goes on to the next
binding instead of ending there. `placed` in both kernels is that mark; Solid's
has nothing to mark.

`import App.Media as M` of a module the project has is its files: each member a
default import, the name a `$namespace` of lazy getters, because the files may
import each other. A script is compiled without its project, so
`.import App.Media as M` in a `.js` is refused with that reason rather than
compiled to a package path that answers 500.

`inspect(root).placed(ids, types)` answers where objects are: each copy when a
delegate has the id, those of a type only when they have no id, in the parent's
coordinates and the root's, where written, and the type's lineage. The place is
worked out from the object's numbers, so a hidden object keeps one; the box
around the corners when it is rotated. An editor's host puts this behind its own
interface.

`mount(Component, element, props, { fill: true })` sizes a root that is not a
Window to the element and follows it through a ResizeObserver, assigning the
root's `width` and `height` as QQuickView's SizeRootObjectToView does: what the
file bound them to is gone. Without the option a root keeps its size. A Window
already fills, and takes `{ fill: false }` to do otherwise, so one word means
one thing for both.

### A23. The generated face: the seam an application's Rust crosses

An application's `#[derive(QmlObject)]` type runs on the web from its own
source, unchanged. The engine does not run there (R4), so what the source
names has to mean something else on wasm32, and the seam is where that
happens. It is the smallest one that keeps the source as it is:

**The seam is the `ljos` facade on wasm32.** `use ljos::prelude::*`,
`ljos::item` and `ljos::module!` resolve to a crate of ljos-ui's,
`ljos_web` (no relation to this repository's compiler crate of that name,
which no application links): an `Engine` that is a handle, an `ObjectId`
that indexes a store of structs, a `Cx`, `Prop<T>`, `QmlValue`, an `Item`
whose properties are names of the runtime's slots, and the hooks of
`ljos::item`. Natively nothing changes. No crate's API forks, no
application line has a `cfg`.

- DECISION: `ljos_render` is the display list on both. It builds for
  wasm32 without B0 as it is; a hook paints into the same
  `DisplayListBuilder`, and the raster code nothing calls is gone by link
  time. egui stays out: B0 is off and `ljos_web` names no egui.
- DECISION: the web's `TextEngine` is the browser's text. It measures with
  a canvas (`measureText`), breaks lines at spaces, and gives the shape
  `ljos_text` gives (`lines[].runs[]` with `glyphs`, `advance`,
  `content_height`), so a hook that lays text out compiles unchanged and
  linking `ljos_text` (a shaper and fonts, megabytes) never happens. Fonts
  are not embedded, which section 10 already says of the web. What is
  different: a `GlyphRun` here has no real glyph ids. Its `font` carries
  the CSS font and the string, which replay hands to `fillText`, and only
  replay reads it. A hook that reads glyph ids itself cannot work unchanged
  on the web, and none in the tree does.
- DECISION: `ljos_macros` gets a `web` cargo feature, on through the
  application's `web = ["ljos/web"]`. Off, the macro's output is what it
  was, token for token, and the desktop tree has no wasm-bindgen. On, it
  gives both, each behind `cfg(target_arch)`, since a proc macro runs on
  the host and cannot ask about the target.
- DECISION: `ljos_web` has wasm-bindgen and js-sys under a wasm32 target
  table, so even a workspace build on the desktop does not compile them.

**The application's manifest** changes by one line, as a `dev` or `render`
feature would: `[features] web = ["ljos/web"]`. Its Rust does not.

**The struct owns; a read is lent.** The store (a table of
`Rc<RefCell<T>>`) lends the struct for the length of a closure, and no
borrow is held across a telling. This drops what the spike needed
(section 4's hold on a telling and its microtask): a handler that writes
back in the middle of a telling just runs, re-entrantly, as a direct
connection does in Qt.

- DECISION: tellings are collected by the outermost call into Rust and
  made when it returns, in one call to the face's one listener:
  `[key, value, …]` (section 5), property changes before signals, a
  property changed twice told once with where it ended. A key is the
  property's number (its place in the type), which a group has too and is
  told whole under, or a string, which is a signal. No listener, no array.
- DECISION: what a hook reads. Inside a paint item's `read`, `item::prop`
  and `engine.get` read the face's slot (`self[name]`), so the runtime's
  tracking sees them, and a base's property (`Item::WIDTH`) is a slot in
  any case. Everywhere else an own property reads the struct, which is
  what holds it.

**Metadata** goes to the build in the binary, not by parsing Rust. The
derive and `#[qml_impl]` each write a JSON line into a custom section of
the wasm (`ljos_web_types`). The tool reads the section from the linked
`.wasm` before wasm-bindgen does and writes what follows. It runs nothing of
the application's, with one exception: a type with `#[qml(enums = …)]` has its
keys in a function, so Node loads the wasm and asks, for those types only.

- `faces/<Module>/index.js`, items 8–11 and 12: `await init()`, then one
  `defineType` per type through `ljos-web/web/face`;
- `faces/<Module>/<Type>.js`, what a compiled import resolves to;
- `ljostypes.json` (format 2), so that `qmlc` learns the types as A18 has it
  and no stand-in file is written by hand. A type with no module (an attached
  type) is under `+unnamed`, as on the desktop QML cannot name it; a type QML
  names needs `#[qml(module)]`. A group's type has no face of its own.

The Vite plugin's `faces` option says where those are: a dump's stand-in
that a generated face exists for resolves to that face instead of the
stand-in that does nothing. Everything else A18 said stands.

- DECISION: a kind comes from how a field's type is spelled: `i32`, `f64`,
  `bool`, `String` and the like get the kernel's kind (item 9), anything
  else is `var` and is converted by `QmlValue` when it crosses. A macro
  sees no type aliases; a field whose alias hides an `i32` is a `var`
  property, which still works, without Qt's wording for a refused write.

**`register` is the entry, unwritten by the application.** The hooks are
registered by `pub fn register(engine: &Engine)`, the function a desktop
host already calls, so a type's hooks must reach the web without anyone
writing `#[wasm_bindgen]`. `ljos-web faces` generates a small crate that
depends on the application with `features = ["web"]` and exports one
function calling `app::register`. It names no `ljos`: the argument is
`&Default::default()`, so its type comes from `register`'s own signature
and the crate cannot disagree with the application over which `ljos`.

- DECISION: an application's crate needs a `pub fn register(engine: &Engine)`.
  Every host needs one (MIGRATION.md §6), so that is not a web change;
  `--register path` names another. It also has to be buildable as an rlib,
  the default.

**Paint.** A visual type (`extends = Item`) has a `<canvas>` in its node, as
`Canvas` does, sized by the item and the device pixel ratio. An `effect`'s
compute calls the type's `read`, tracked, with the size and a `repaint`
version it also reads; its apply paints the returned `ItemPaint` into a
`DisplayListBuilder` and replays the ops on the canvas's 2D context.
Nothing polls and nothing runs per frame: only a change to what `read` read,
to the size or the ratio, or `item::repaint`, reaches the effect.

- DECISION: replay does `Rect` (radii, border, gradient), `Shadow`,
  `Image`, `Glyphs`, `Text`, `Path`, `Shape` (linear, radial and conical
  brushes where the context has them). `NinePatch` and tiling are left out
  and warn once by name, as do `Shader`, `View3d` and `Embed`, which
  need a device or a host this path does not have.
- DECISION: pointer, key and wheel go through the runtime's delivery
  (`receive`, `$press`, `$move`, `$release`, `$hover`, `$wheel`,
  `$keyPressed`, `$keyReleased`), registered only for a type that has that
  hook, so stacking, grabs and focus are the ones everything else obeys.
- DECISION: `item::load_image` on the web decodes with the browser
  (`Image`, `decode`, then `getImageData`, as `createImageBitmap` cannot
  give straight pixels everywhere), and gives a real `ImageHandle`, so the
  hook's reply is what the desktop's is.
- DECISION: the hooks live behind function pointers stored by
  `register_paint_item` and its kin, called through one exported
  dispatcher. An application with no visual type never calls those, so
  link-time optimisation removes replay and the text engine from its wasm.

**What cannot be unchanged.** Each is a compile error naming the field or
the type, on the web only, rather than a face that misbehaves:

- DECISION: `#[qml(list)]` with its `QmlList`, `append`, `insert` and `remove`,
  because a list of objects has a meaning in the engine's ownership that has no
  web counterpart yet. The application's alternative is a `Vec<T>` property,
  which crosses as an array.
- DECISION: a native type as the `#[qml(base)]` of another: only `Item` and
  `QtObject` can be bases. A face would have to be two wrappers over one
  struct, and nothing in the tree needs it yet.
- DECISION: what is named in the prelude but is the desktop's only (a
  model's `QmlListModel`, `Platform`, `Timer`, `task`) does not exist in the
  web prelude; the error is rustc's "not found", on the use. Those are
  sections 7 and 8, not this.

**As built, what differs from the desktop.** None of these needs a line of the
application changed unless it says so:

- A value Rust gives wins over QML's assignment, and a binding stands: a face
  writes a slot already assigned rather than providing under it. A `write` hook
  runs inside the slot's write (`slot.kind`), so a read straight after sees it.
- The wrapper class goes by the Rust name, inside a hidden module, because
  wasm-bindgen's struct derive names a bare `wasm_bindgen` whatever path it is
  given. So `#[qml_impl]` has to see `__LjosWeb_X`: the same module as the
  derive, or a glob import of it.
- DECISION: an uncreatable type that has `Default` is made, as an attached one
  must be; one without it is refused when made.
- DECISION: an engine-scoped and a window-scoped singleton are one object of the
  page: a page is one window.
- Not honoured on the web, and no error: `#[qml(reset)]`, a group member's
  `write` hook, and the reason `forceActiveFocus` is given, which the runtime
  has nowhere to keep. Objects made by `hand_off` have no face.
- A `QmlValue` an application implements by hand has to give its wire form on
  wasm32 too, so that impl does need a `cfg`. The derive's don't.
- `ljos` on wasm32 without `web` is an empty crate: the error is rustc's on the
  first `use`, which names what is missing.
- Reading an attaching type's property from QML (`Shelf.weight`,
  `other.Shelf.weight`) is not yet recognised by this compiler for a dumped type
  (`crates/ljos_web/src/quick/names.rs` asks Qt's table only); writes and
  handlers (`Shelf.weight: 3`, `Shelf.onTallied:`) work.

**Sizes**, measured by `mise run test:faces-size` (`size/faces.js`):
an application with no native types imports no face module and links no wasm of
its own, so it pays nothing: the check fails if its bundle names any of the
faces. FACE_SIZES, gzip:

| | now | budget |
|---|---|---|
| A page with no native types, over itself | 0 B | 0 B |
| Face and visual runtime, once, over that page | 1,852 B | 2,500 B |
| One non-visual type (`wasm-counter`): wasm | 20,988 B | 25,000 B |
| ...its wasm-bindgen JavaScript | 3,659 B | 5,000 B |
| Six types, visual ones painting all of replay (`wasm-gauge`): wasm | 71,777 B | 85,000 B |
| ...its wasm-bindgen JavaScript | 7,444 B | 9,000 B |

DECISION: A8's 250 kB is the runtime's budget and an application's own wasm is
outside it, as its QML and assets are. It has to be: the gauge page is about
231 kB on the Solid kernel but about 260 kB on the wasm kernel (179 kB page, 2 kB
faces, 72 kB wasm, 7 kB JavaScript). The counter's is about 176 kB and 205 kB.


### A24. 3D without an installed Qt

Qt writes part of QtQuick3D.Helpers and QtQuick3D.Effects in QML, so a page
using those needed Qt's QML modules on an import path. `packages/runtime/quick3d/`
now holds Ljós's own, a module root like `controls/` (A20). `vite.js` puts it
**last** among the roots: a Qt that has those modules has all of them, and wins.

| Module | Type | From |
|---|---|---|
| Helpers | AxisHelper, DebugView | ljos-ui at the pin in `quick3d/LJOS_UI.json`, verbatim |
| Helpers | OrbitCameraController, WasdController | the same, then changed (see below) |
| Helpers | ExtendedSceneEnvironment, LodManager, RenderStatistics | written from Qt's documentation |
| Effects | ColorMaster, Vignette, HDRBloomTonemap | written from Qt's documentation, own shaders |

`check()` in `quick3d.js` holds every file to its hash: `files` for what is as
the pin has it, `changed` for what is not, with the hash at the pin and why.

The two controllers changed because they did not do what Qt's does when run. The
pin's pitch goes the opposite way, its turn is about 1.4 times too slow, its zoom
and clip planes follow another law, and its Wasd moves at 300 units a second where
Qt's moves 500. The numbers come from driving Qt's module in a browser, not from
reading it. ljos-ui has the same differences at the pin.

The rate is one measured constant (`turnRate`), and Qt's pan across the view is
not matched exactly. The wheel keeps a floor, so a very large wheel step cannot
take the camera through its origin.

`DragHandler` gained `minimumPointCount`. Without it the controller's two-finger
handler took a single mouse drag. A handler of several points only watches and
takes no exclusive grab, so a pinch on the same item still works.

ExtendedSceneEnvironment holds all its documented properties. Glow, depth of
field, LUT, lens flare, SSR and SSGI are held and not drawn, which is also what the
runtime does with Qt's module. HDRBloomTonemap's `channelThreshold` is our own
design, because the documentation says little about it.

The remaining QML types of QtQuick3D.Effects are not written, as the corpus uses
none of them: AdditiveColorGradient, Blur, BrushStrokes, ChromaticAberration,
Desaturate, DepthOfFieldHQBlur, DistortionRipple, DistortionSphere,
DistortionSpiral, EdgeDetect, Emboss, Flip, Fxaa, GaussianBlur, MotionBlur,
SCurveTonemap, Scatter, TiltShift. Using one is an error naming the type and its
module, as before.

`tests/qtless.spec.js` runs on a second server with no Qt on any path, and
`site-tests/quick3d.spec.js` does the same for a built site. A page that imports
no 3D carries none of this.

### A25. View3D drawn by the wgpu crate: where it stands

Partial. `crates/ljos_web_3d` implements `ljos_3d`'s `SceneSource` over
the page's objects, through a `Host` that `QtQuick3D/wgpu.js` provides.
`mise run build:wasm-3d` binds it into `QtQuick3D/wgpu/`, which is not
committed. Without that directory the switch has nothing to load.
`size/check.js` holds the budgets below, and fails a page with no
View3D that has either renderer in it.

DECISION: the default stays `"js"`. The mapping does not yet reach
`pickable`, pivot, `depthBias`, scope, morph targets, fog, reflection
probes, clearcoat, subsets, `DefaultMaterial`'s emissive and opacity, or
mesh-file sources, and `render.js` goes only once `tests/quick3d.spec.js`
passes on wgpu.

DECISION: `pick.js` keeps picking. QML's `pick` answers at once with
JavaScript objects, which a renderer that loads and draws
asynchronously cannot do, and the answer does not depend on who draws.

DECISION: the 3D wasm's budget is 1,400 kB gzip and its glue's 30 kB,
against 1,313 kB and 21 kB measured. A page without a View3D on wgpu
fetches neither.

DECISION: `QtQuick3D.AssetUtils`' `RuntimeLoader` is a type on both
renderers, but only wgpu reads the file: the JavaScript renderer draws
what is declared and has no glTF reader.

Known gaps: a live `sourceItem` texture and a `TextureData` that is not
RGBA8 give no picture; a `.tga` is a picture on both renderers, a `.ktx` only
on the JavaScript one, since `ljos_3d` has no KTX reader. A `Geometry` with an `I32Type` attribute is not
drawn, and the console says so once: the renderer reads no signed integers.
A shader that does not translate leaves its model without that material,
and the console says why once. `RuntimeLoader` says `status` and
`errorString` only on wgpu, and only of a loader the build reached: one
inside something invisible says them when it is next shown. While its file
is on its way it says `Empty`. A file that failed is read again when a
loader or a model comes to name it again, not on its own.

What a view keeps is one revision of each shape, picture and table, the one
it draws. A `Geometry` committed every frame stays level
(`tests/view3d-wgpu.spec.js`, "is let go"); on the build before that, a
hundred revisions took wasm from 27 to 97 MB and live GPU objects from 102
to 402. Programs are kept by their text until the view goes.

What it reaches today, built with the `ljos_3d` that has the corpus's fixes (the
pin in `crates/ljos_web_3d/Cargo.toml` has to reach them; this crate does not
compile on an older one): a lit scene of built-in shapes is the native renderer's
picture to the pixel on WebGPU and on WebGL2 (`tests/references3d`). Dice,
robotarm, toycustomizer, car-configurator and FX_Material_Showroom draw on both,
on both kernels. `tests/quick3d.spec.js` passes 39 of 51 on wgpu and
`tests/particles3d.spec.js` 15 of 16, none failing by timing. What fails: morph
targets in a CustomMaterial, KTX pictures, what a probe mirrors, a blurred sky, a
skin, Mask and Opaque with an opacity, a picture given as numbers by fractions,
affectors, and a view of very many nodes.

DECISION: JavaScript stays the default renderer of View3D until those specs pass,
and until a scene's rebuild and a view read back as a texture cost less than they
do: a View3D drawn into another's scene reads back every frame.

### A26. A page written at build time, and taken over when it runs

A page of ljos-web is made by its script, so a reader with no script —
a crawler, a reader's first paint, a screen that has not run it yet —
had nothing. A site may be built prerendered (`buildSite({ dir,
prerender: true })`, `ljos-web build-site DIR --prerender`, `mise run
site:build DIR -- --prerender`): the build writes the page's own HTML
into `index.html` — its text, its links and its structure, in the
markup the runtime itself makes — and the page's script then
*hydrates* it, taking those elements over instead of making the page
again. Any site may: nothing of a particular site is in it.

How it works. What `qmlc` emits names no DOM: a compiled file is
`createComponent` over this runtime's types, and the DOM is made by
the types when the page runs (A2, A5). So there is no second,
server-shaped output of the compiler to keep in step; a prerender is
the same compiled components over the same runtime, made in Node
instead of in a browser. The build makes a server bundle by the same
Vite build with an SSR target (`server-entry`, beside the page's own
bundle in the build's stage), and renders it in a Node process of its
own (`packages/runtime/server/prerender.js`) over a document made for
the purpose (`packages/runtime/server/dom.js`): enough of a DOM for
the runtime's types to make their elements and be written as HTML.
The kernel is the build's own — Solid's, or Ljós's graph where
`LJOS_KERNEL=wasm` (A22) — in the prerender as in the page, so what a
binding decides at build time is what it decides in the browser.
Solid draws and Ljós decides on the server exactly as on the client;
only the document under them differs. The server bundle resolves its
packages under a browser's conditions (`server/conditions.js`), not
Node's: under Node's, Solid is its server build, where a write tells
no one and nothing settles, and the page would be written as its
bindings first read it — before a Repeater's rows reached the Column
they are in, before `Component.onCompleted` changed anything — and
then hydrate into another page. A host that builds its own server
bundle (below) resolves under the same conditions. What comes only
later — a `ShellLoader`'s source, compiled in the page — is written as
it stands meanwhile: the loader's fallback, standing in.

Each element the prerender makes is numbered as it is made, with
the type whose making made it, and carries the two in the HTML
(`data-hk="12:Text"`). `hydrate(Component, element)`
(`ljos-web/object`, beside `mount`) makes the page over an element
that holds such HTML: while the root is made, an element a type asks
the document for is answered with the prerendered one of that number
and type, and the effects that then run write to it as they always
did — its listeners, its measured styles, its painted faces are the
browser's own, settled in place. The nodes a reader was reading are
the nodes that then behave. An element of another tag or for another
type than the page asks for, or one no making asks for — the page
made differently here than it was prerendered, an element more or
fewer from what only the browser measures — is a mismatch: it is
told of once on the console, no element after it is taken over
either (from where the makings part, no number can be trusted to
name the same making), what was not taken over is taken out and
told of, and the page goes on as a mount would have made it. What the page says as it is made
(`console.log`, QML's `print`) a prerender sends to the build's
stderr, never into the HTML. That the page is live, the element it
was hydrated into says (`data-ljos-hydrated`). With nothing
prerendered in it, `hydrate` is `mount`.

What a prerender has, and what it has not:

- Everything a page's first making puts in its DOM is in the HTML:
  text (plain, styled and rich, links as the runtime writes them),
  the items and their order, colours, sizes and placing as the
  runtime computed them, a model's rows made from what the file says.
- Measurements a browser makes of real fonts are made on the server
  by a canvas that measures by the font's size, not by its glyphs:
  the first paint is the page's shape, and hydration settles the
  exact numbers in place. A line height in pixels
  (`lineHeightMode: Text.FixedHeight`) is the browser's exactly, in
  plain and rich text, with a rich text's `<br/>` a line: a page
  whose code must not move when it hydrates sets its lines that way
  (A30). A site may say the size its page is made
  at (`prerender: { width, height }`, 1280×720 by default).
- What paints is not in the HTML: a `Canvas`, a `ShaderEffect`, a
  `View3D` and the other GPU faces prerender as the element they
  paint into, of the size and place the page gives them, and paint
  when the page hydrates. Put the words that say what such a view is
  in the page beside it, as a site does for a browser with no WebGPU.
- What is fetched is fetched when the page runs: a picture, a model
  read over the network, a font. What a visitor's own browser holds
  (a `Settings` store) a prerender has empty, as a first visit does.
  The HTML has the page in the state it starts in, as a first load
  anywhere does.
- A live shell's page (A9) is its host's to make; `prerender` and
  `liveShell` together are refused by the build.
- The `import OpenTUI` dialect is drawn by Solid's own DOM templates
  (Part I's other target), not by the runtime's types, and is not
  prerendered by this: it is a page of terminal cells, not the site
  a reader is served.

**DECISION:** no `--emit ssr` in `qmlc`. Solid's server compiler
makes strings of JSX elements; of a QtQuick page there are none —
every object is a component whose type makes its own element. A
server output of the compiler would be a second tree to keep equal
to the first. The one compiled tree, run over the prerender's
document, is the single source both sides draw from.

**DECISION:** the prerender's document is ljos-web's own
(`server/dom.js`), not a browser driven at build time and not a
general DOM library: a build then needs nothing fetched and nothing
running but Node, and what the document cannot do (paint, load,
measure a glyph) is stated above rather than half-done.

**DECISION:** adoption is by the order elements are made in, held in
`data-hk` as that order's count and the type being made, not by a
structural walk of the tree: the runtime's types make their elements
where they make them (sixty-odd places), and the count of those
makings is the one thing both sides share; the type is in the key
because most elements are `<div>`s, and a count alone cannot tell a
shifted one from its own. Copies a type makes of an element
(`cloneNode`, a parser's) are not makings and carry no key; they are
made again in the browser over the elements that do.

A host that is not the site builder renders its own pages the same
way: it builds each page a server bundle whose default export renders
it (`export default (options) => renderToString(Entry, options)`,
with `renderToString` of `ljos-web/server` in the same bundle, so
that the entry and the renderer are over one runtime), in a Node
process per page:

```sh
node node_modules/ljos-web/server/prerender.js page-server.mjs '{"width":1280,"height":720}' > page.html
```

and puts what it prints in the element its page calls
`hydrate(Entry, …)` on. `renderToString(Component, { props, width,
height })` is also there for a host that runs in a process it has
already given the prerender's globals to (`installPrerenderGlobals`,
also of `ljos-web/server`, before any module of the page's is
loaded). The tests are `packages/runtime/site-tests/prerender.spec.js`:
the page read with JavaScript off, the very nodes kept through
hydration, a counter counting after it, on both kernels, and the
site builder's own project bundle beside them.

### A27. Live code blocks: every example runs, beside its code

A documentation page's examples are programs, and a reader learns more
from changing one than from reading one. `packages/runtime/codeblocks/`
turns a Markdown page's fenced blocks into live ones, for any site:

- **The fence contract** (`codeblocks/parse.js`, shared by build and
  page): `qml` is a whole app; `qml harness=<name>` is a snippet spliced
  into a small whole-app harness at its one `//! snippet` line, so a
  fragment still runs; `qml before` is the old half of a before/after
  and is labelled; `file=`/`group=` make one example of several files,
  scripts included, in folders as written (`file=user/Shell.qml`), so a
  `ShellLoader` example carries the user's shell, the app's fallback
  and its contributions as three editable files. Exempt tags (`sh`,
  `rust`, `toml`, `json`, `text`, `xml`, `gherkin`, `javascript`,
  `diff`) stay plain highlighted code; a bare or unknown tag is named,
  never quietly plain.
- **The build** (`codeblocks/build.js`, remark in `codeblocks/remark.js`):
  each example is checked with `qmlc` — the page's compiler, against the
  modules ljos-web provides, not an installed Qt's — and a block that
  claims to run and does not compile fails the build, saying why. What is
  written is static HTML: the code as code, beside the result as **the
  prerender wrote it** (A26): the examples are built once into a server
  bundle by the same Vite build and made in Node by `renderToString`
  (`ljos-web/server`), cached by content hash. Making an example runs
  it, so the prerender is also the run half of the check. There is no
  second, picture-shaped path: a block's static half is its own markup.
- **The page** (`ljos-web/codeblock`): hydration mounts each block only
  as it nears the viewport, and its first making takes the prerendered
  nodes over (`hydrate`, A26) — the nodes a reader had are the nodes
  that then behave. The code is highlighted at build time and is
  editable as it stands; the first focus, press or key brings the
  editor in over it (A30), and an edit
  compiles in the page (A15) and reloads (A13), so state is kept — a
  counter at 3 stays 3 when its colour changes, and a contribution a
  visitor's edited shell still places keeps the app's count. A broken
  edit shows `file:line:column: message` beside the code, squiggles
  the place in the editor, and the last good result keeps running. With JavaScript off, code and prerendered
  result are the page. Nothing polls; motion is CSS the page's
  `prefers-reduced-motion` stills. A page gives its controls or other
  modules to the compiler through `options.compile`
  (`createCompiler({ modules })`, as A15's pages do).
- **An example's files are its own.** Each block compiles as a project
  of only its files (`closed: true` to the compiler), at a root of its
  own (`ljos-example://<n>/`) that no server answers: a relative address
  it names (a `ShellLoader`'s `source` or `fallback`, an `Image`'s, a
  model's, an `XMLHttpRequest`'s) is looked for among its fences and its
  harness, wherever the page is, and is given from there. A request
  takes a relative address from beside the file that makes it, as
  natively: the link gives each of the example's files an
  `XMLHttpRequest` placed there (its static `beside`). One it does not have is not there,
  as a file not on disk is not there for `ljos run`: what loads it fails
  as natively (`shell.qml: No such file or directory`), the block says
  so beside the code at the line that names it (`Main.qml:4: shell.qml:
  No such file or directory`), and nothing is fetched. The choke points
  of `guard.js` (`guardedFetch`, `sourced`, `allowedUrl`, `mayFetch`)
  are where an address of such a project is answered, so every loader
  that goes through them behaves so; a socket to one is refused, as an
  example has no server. What paints a picture paints it from where it
  was given, so a picture the example has shows. A name is read as its
  file is called: a `%` that starts no escape is the name's own, and
  what the URL parser escaped around it is read back (`my 100%.svg`).
  What a compile's scripts ask for as they run is said of that compile:
  what the last project was told goes when the compile gives the example
  its files (`enclosed()`), so an edit that does not compile keeps the
  running example's lines. A block disposed takes its project with it:
  the addresses its files were given at and the text its files read
  (`release`). Disposed while a compile links, the files stay the
  example's until that compile is done with them, so what its scripts
  ask for is still among them, never asked of the server. Absolute URLs, and
  the page's own addresses outside code blocks, are as before.

**DECISION:** the feature is general, the site is its first user: the
Astro site wires the remark plugin and a small hydrator island, and
nothing of the site is in the package. A later ljos.dev built from
prerendered Ljós pages uses the same halves without remark — `assemble`,
`renderPrerenders` and `renderStatic` at build time,
`hydrateLiveCodeBlocks` in the page — and a block inside a prerendered
Ljós page is then a prerender within the prerender, hydrated by the
same `hydrate` either way. No server prerender of the editor chrome is
needed, because the static figure is already the readable page.

**DECISION:** a docs tree earns strictness. A fence that claims to run
(`harness=`/`file=`/`group=`/`before`) must compile or the build fails,
always. An untagged `qml` block that does not compile — a snippet whose
harness has not been written yet — stays plain code and is counted in
the build's output, until a site switches `strict` on; from then every
non-exempt block must compile and no tag may be unknown. The switch is
deliberate, never inferred from the docs tree's shape: a docs pin must
not by itself start failing a site build on examples this compiler
cannot run yet. A multi-file example's fences may spread through prose
(docs introduce each file); the figure stands at its entry file with
every file in its editor, and a group written as one run of fences is
replaced whole. The site never shows a block as live that is not, and
never breaks on docs that predate the tagging.

**Scenarios.** `packages/runtime/tests/codeblocks.spec.js`: the
contract (parse, splice, assemble, hash), the check naming a broken
block, a `ShellLoader`/`Slot` example assembling and checking, the
a prerender made by running each example (a throw is a failure, not
the end), static HTML carrying code + prerendered result + payload,
JS off reading them, hydration keeping the very nodes into an editor,
an edit keeping state, a broken edit keeping
the last good result, harnessed and grouped examples, editing the
user's shell keeping the app's state, lazy mounting, exempt code
plain. `packages/runtime/tests/examplefiles.spec.js`: a shell and a
fallback an example does not have said to be not there at their lines,
a shell named only at run time found among its files, a picture it does
not have not there, a picture it has painted under a name with a bare `%`
and a space, a file a script asks for while the example compiles said
to be not there, an edit that does not compile keeping what the running
example was told — none of them asked of the server — and a disposed block's
project gone, its addresses revoked and its text withdrawn, also when
disposed mid-compile, and while a compile links, once or twice. `site/tests/codeblocks.e2e.js` (its own config) holds the same
on a site built from fixture docs, strictly.

Known limits, as the pieces stand: a `ShellLoader` loads its shell as
it can (async, by design), so that subtree is made after hydration's
window and remade there — the app around it is adopted, and the
prerender still serves a reader without script; a `.ts` file a QML file imports by
name is refused by the compiler today (a `.mjs` script is not), so a
grouped example's scripts ride as files the editor shows and a `.ts`
import is the compiler's gap to close, not papered over here; an
example importing `QtQuick.Controls` runs on a page built with them
(the site is, so its compiler is given them, A15) and is reported at
its import and left plain on one that is not.

### A28. A site of many pages, and Markdown as a content source

A site is more than one page. A prerender may name the pages
(`buildSite({ prerender: { pages: [{ route, title, props }] } })`,
`ljos-web build-site DIR --pages FILE`): one build of the entry,
one set of assets, and the entry prerendered once per page — at its
route (`/` is `index.html`, `/docs/` is `docs/index.html`), under
its title, made with its `props` as the entry's own properties. A
route is a plain path below the site ending in `/`, each once, or
the build is refused before anything is compiled. Each page's HTML
carries the props it was made with (`<script type="application/json"
id="ljos-props">`), and its script hydrates it with the same ones,
so the page that stands up in the browser is the page that was
prerendered for that address. Without `pages` a prerender is the
one page at `/`, as it always was. A site of many pages is then
one shell that shows the page its route names — ljos.dev's own
55 pages are built this way (`site-ljos/`, beside the Astro site
it will one day replace; nothing serves it yet).

Where the words of those pages come from is a step of its own.
`ljos-web/markdown` reads a directory of Markdown as a site:
front matter (`title`, `description`, `section`, `order`) over a
body, read as blocks — headings with the anchor a reader links
to, paragraphs, lists, tables, quotes and admonitions, pictures,
rules, and fenced code kept verbatim with its fence contract
(`harness=`/`file=`/`group=`/`before`, the live code blocks'
words) and coloured for a reader whose page has not made it live.
Inline words become the rich subset this runtime's `Text` takes,
escaped first so what a page wrote as text stays text; a `.md`
link becomes the route of the page it names; an HTML comment is
the writer's note and no reader is shown it. `readMarkdownSite`
gives the pages in sidebar order with each page's headings, and
the sidebar those orders make. Nothing in it builds or draws: a
site writes the reading into its bundle as data its shell reads
(ljos.dev's build writes a `Content.qml`), and any shell that
shows blocks can stand over it. The tests are
`packages/runtime/site-tests/markdown.spec.js` (the reading held
to what the Markdown says, links resolved against the pages read)
and `pages.spec.js` (each page at its route with only its words,
read with JavaScript off, hydrated as the page its route names;
a page that carries its words as megabytes of data still builds —
the compiler is run with room for what it writes; a page with a
text editor prerenders, its text in the HTML; and a site that
imports `Ljos.Blocks` builds prerendered: the styles' own QML is
no project's, and is compiled under the root it stands in, not
the bundle's).

Live code blocks (A27) stand in such a page as the decision there
has it — the same halves without remark. The site's build
assembles each page's fences, holds every one that claims to run
to compiling and running (`checkExamples`, `renderPrerenders`),
and gives the shell's one code-block face the ones that do as
live blocks: an editor per file beside a stage. The stage as
first written holds a picture the build drew of the prerendered
result (an `<img>` in rich text, so it stands in the HTML for a
reader with no script); in a browser a `ShellLoader` compiles the
code in the page — through a script library that resolves it with
`ljos-web/compiler`, given this page's Controls as the Astro
site's compiler is given them — and takes the stage over, and
every edit reloads it with its state kept, a broken one saying
why beside the code. An example that does not compile or run and
never claimed to stays plain highlighted code and is counted in
the build's output (at the current pin: 138 live, 21 plain). A
text field made in a prerender holds a selection and writes its
text as a textarea's content, as a browser reads it
(`server/dom.js`).

What a page of many has that a page of one has not, stated plain:

- Every page carries the one bundle's data with it: a docs site's
  shell reads every page's blocks from the reading the build
  wrote in, so the script a reader loads holds the whole site's
  words (ljos.dev's is some 35 MB of assets, the in-page
  compiler's link table most of it). The HTML a reader without
  script gets is only the page asked for. A live block mounts
  when its page is made, not only as it nears the viewport as
  the DOM hydrator mounts its figures: a page's blocks compile
  as the page stands up.
- A link in rich text is the runtime's `data-link`, followed when
  the page has hydrated; with no script the words and the address
  are in the page, and the navigation is readable, but no press
  is taken. Search is a site's own to grow; ljos.dev's shell
  carries a placeholder that says so.
- The shell's size is the build's (`prerender: { width, height }`)
  until hydration settles it, as A26 has it; a root that would
  fill its window binds its width and height to its parent's —
  an anchor to the view an entry is mounted in settles before
  that parent stands, and a prerender would write it at no size.

### A29. Ljós's own API on the web: `Ljos.Ui`, `Ljos.Layout`, `Ljos.Core`

`import Ljos.Ui` is `ljos-web/Ljos/Ui`, and likewise `Ljos/Layout` and
`Ljos/Core`: the modules of Ljós's own API, as ljos-ui has them
natively (its `ljos_ui.rs` and `ljos_layout.rs`, and the three modules
of its type table, are the specification). The compiler's front end is
pinned to the ljos-ui main that knows them
(`2d725000e02f496072063adace4064c205fcb5cd`), so a file `ljos migrate`
writes compiles here as it checks natively, to these imports.

A type Ljós renames, or whose members it renames, is a *face* of the
runtime's type, as natively: the same object under the new names. A
face here is a type derived from the one it faces, in whose props the
dialect's names are put under the names the type has before anything
has read a property, and on whose objects the dialect's names are the
same slot (`slot(item, "fill")` is `slot(item, "color")`), so a
`Behavior on fill`, a state's `PropertyChanges` and an animation's
`property: "fill"` move what either name reads. Nothing is made twice
and no implementation is forked. The faces are `Rectangle` (`fill` for
`color`), `Text` (`align`, `wrap`, `format`), `PointerArea` (Qt's
`MouseArea`), the gestures `Tap`, `Hover`, `Drag` and `Wheel` (whose
`buttons`, `modifiers`, `devices` and `pointerTypes` are their
handlers' `accepted…`), `Loader` (`component` for `sourceComponent`),
`ListView`, and `DragSource` (Qt's attached `Drag`, the one attached
object by both names). `font.size` is a second name for `pixelSize` on
every font, as in Ljós's table; beside a Qt table, whose font has no
`size`, the compiler takes it as the member the runtime adds, and no
other added member. The rest of `Ljos.Ui` — `Item`, `Image`, the
shapes and paths, the animations, states and transitions, the views'
companions — Ljós keeps as they are, so they are the runtime's types
exported from this module too. `Ljos.Core` is `Timer`, `Binding`,
`Connections`, `Component`, `Locale` and `QtObject` likewise.

`Ljos.Layout`'s `Row`, `Column`, `Box` and `Grid` are ljos-ui's
arrangement (its `arrangement.rs`, `layouts/distribute.rs` and
`layouts/place.rs`, DIALECT.md §4.6), ported step for step to
`Ljos/Layout/index.js` and `distribute.js`, not the Qt layouts'
arithmetic with other defaults. The one rule, per axis: a child that
says nothing about an axis through `Layout` (no `fill…`, no
`preferred…`, `minimum…` or `maximum…`) keeps its size along it and
is never sized there; one that does asks for its `Layout.preferred…`,
else the size its file gives it, else its implicit size, held between
its minimum (0 unless given; for a child that is a layout itself, what
its own children need) and maximum, and fills from there only if it
says `fill…`. Where any shown child has a `Layout`, a size a child takes
from its content (its implicit size, where its file gives it no width
or height) is rounded up to a whole pixel, along both axes and whether
or not the child says anything through `Layout`, as ljos-ui measured
of Qt's `RowLayout`; a size the author gives is never rounded. When no shown child of a `Row`,
`Column` or `Box` has a `Layout`, they are packed as a positioner
packs them, along the axis from the padding and at the start of the
other, at the sizes they have, fractions and all; a child with no
width or height is left out. A child given its rounded implicit size
while a layout gets its implicit size back, unrounded, when the last
child with a `Layout` leaves. Otherwise the
rows and columns are planned: room is shared as `distribute` shares
it (stretch factors, then preferred sizes, then maximums), edges fall
on whole pixels with a half rounded up, a child sits at the start of
its cell unless `Layout.alignment` moves it, room nobody takes is left
at the end, and right to left mirrors it all. A `Grid`'s `columns` and
`rows` are 0 until given, and with neither it is one line along its
`flow`; a child that spans several columns or rows shares the room by
them, not by its stretch factor, as natively. The arrangement writes a
child's width or height only along a sized axis. One it wrote stays
when that axis stops being sized or the child leaves, as natively,
where the arrangement writes every child's whole geometry. The size a
file gives a child is the one the arrangement first saw, kept while it
stays a child, so placing a size never measures again and a binding
that later gives another is not asked for, as ljos-ui keeps the first
one it saw. `Pages` is a face of
`StackLayout`, `Flow` is `QtQuick`'s, and `Layout` is the layouts'
attached type.

`tests/ljoslayout.spec.js` holds the arrangement to ljos-ui, on both
kernels: each case of `tests/scenes/ljoslayoutrule.qml` (explicit,
preferred, minimum and maximum sizes, filling and stretch, padding,
margins, alignment, right to left, packing, `Grid` counts, flows and
spans) is placed to the pixel as `ljos test` places the same file
(`tests/fixtures/ljoslayoutrule.json`, ljos-ui 94770e9b2), and again
after a child that fills is hidden and shown, after a `Box` turns,
after a preferred width goes away, after a child that fills moves to
another parent, after a row whose child's bound width changed
measures again, after the only child of a row with a `Layout`
leaves, its width changes and it comes back, and after the only child
with a `Layout` of a row whose others take their size from their
content leaves, and after a child a row gave the width its content gave
it moves to another row that is a layout (it still follows its
content), to an item (it keeps its width) and back.

`tests/ljosui.spec.js` holds it, on both kernels: each face by its
dialect names, beside the QtQuick specs, and a whole dialect file
compiled by qmlc (`tests/scenes/ljosuidialect.qml`) drawing what its
compat twin draws, to the pixel. On the
site (A28) nothing changes in the count at the docs pin — the same
138 live and 21 plain (10 not compiling, 11 not running), checked
with the build's own gathering: none of the 21 is plain for want of
this module (each fails for a type, module or script the web has not,
in Qt's form too) — while a docs example `ljos migrate` writes in
the dialect (`ui/layouts`, a `Column` of `Rectangle`s by `fill` and
`Layout.fillHeight`) compiles and prerenders through the site's own
check, live when the docs are read at a revision that has it.

Not mapped, and said so rather than papered over: `Pointer` (the face
of Qt's `PointHandler`, which the runtime has not in `QtQuick`
either — a file that names it fails at its import) and `KeyEvent` as a
named type (a key event here is the object a handler is given, in
either API; nothing is made of the name); a `ListView`'s
`enter` and `exit` (the runtime's views have no `add`/`remove`
transitions in either API to rename); `Screen.points(…)` (not in
Ljós's API yet either: a file that sets `font.pointSize` is kept by
migrate, so none is written); and the dialect modules
beyond these three — `Ljos.Controls…` and a 3D module Ljós has not
yet — which no file can import here until they are carried as these
were.


### A30. The code editor: CodeMirror over code the build highlighted

Code a reader can change — a live block (A27), a site's own editable
shell — is first of all code to read. The build colours it, the page
shows it with no script at all, and the editor comes in only when the
reader goes to change it, over the code and in its place.

- **One grammar** (`packages/lezer-ljos`): a Lezer grammar of QML,
  of `.lts` scripts and of the Ljós dialect — TypeScript as the
  language of scripts and bindings, with TC39's `match` and `|>` and
  its topic — the editor's language and the build's highlighter both.
  `langOf(tagOrFile)` names the grammar of a fence tag or a file
  (`qml`, `lts`, `ts`, `js`, `mjs`; QML files read the dialect); one it does not read is plain.
- **Highlighted by the build** (`lezer-ljos/html`, `highlightToHtml`):
  `<span class="tok-…">` runs, written into the HTML by the codeblock
  build, by the remark plugin for every fence that stays code where
  the host asks (`highlight: true`, with `ljos-web/codeblock.css` on
  every page), and by
  `markdown.js`'s `highlight` (a site's own pages) — the grammar's
  languages by the grammar, the others by a rough colouring of
  strings, numbers and comments. Rich text keeps a span's `class`, so
  a QML page shows the same runs in a `Text`.
- **One theme, by class**: `tok-keyword`, `string`, `number`,
  `comment`, `typeName`, `propertyName`, `variableName`, `function`,
  `operator`, `punctuation`, `bool`, `null`, `regexp`, `meta`,
  `invalid` and `topic`. Their colours come only from custom
  properties a site sets — `--ljos-code-<tag>`, `--ljos-code-bg`,
  `-fg`, `-selection`, `-gutter`, `--ljos-code-diagnostic-error` and
  `-warning` — with neutral fallbacks in `ljos-web/codeblock.css`
  (each a mix with `currentColor`, so they read on light and dark).
  The static code and the editor carry the same classes: the editor
  coming in changes no colour.
- **The editor** (`ljos-web/codeblock/editor`): CodeMirror 6 over the
  grammar, `createCodeEditor(parent, { doc, lang, label, errors,
  onChange })` giving `{ view, text, setText, setDiagnostics, focus,
  destroy }`. The keyboard never traps (#14): Tab indents, Shift+Tab
  leaves, and Escape makes the next Tab leave too, until the editor is
  entered again — the field's description says so to a screen reader.
  Its words are 16px or more on a touch screen, so a phone does not
  zoom in as it focuses, and a long line scrolls in the editor, never
  the page.
- **Lazily**: the editor module is in no page's first load. It is
  fetched when the page is idle, or on the first focus, press or key
  if that comes first, and only then put in place — in the code's own
  font and line height, so no line moves. A page of a Markdown site
  does it with `hydrateLiveCodeBlocks` (A27); a page built from QML
  does it with `ljos-web/codeblock/attach`: `attachCodeEditor(item,
  { lang, label, like, errors })` puts the editor over a QML item
  holding the code as its `text`, in the look of the rich `Text`
  (`like`) it hides. The item stays the field as QML sees it: an edit
  writes its `text`, writing `text` (a Reset) is shown, a press gives
  it focus, and the keys the editor does not take (Tab after Escape,
  Shift+Tab) go on to QML's tab chain.
- **Diagnostics**: a compile's diagnostics are given to the editor as
  `{ message, file, line, column, endLine, endColumn, severity, code? }`,
  1-based, in the file's own text (`setDiagnostics`; a thin adapter
  over `@codemirror/lint`). They are squiggles under the place, their
  messages on hover and in the lint panel, and to a screen reader the
  field is `aria-invalid` with `aria-errormessage` naming the element
  that says the errors in words (`errors`).
- **No layout shift**: a code `Text` in a QML page sets its lines in
  pixels (`lineHeightMode: Text.FixedHeight`), which the prerender
  and the browser set alike (A26); the editor takes that line height,
  so the page the build wrote, the page hydrated and the page with the
  editor in it are one height.

**DECISION:** the editor is CodeMirror 6, not a textarea with an
overlay: it is the editor whose language support is a Lezer grammar,
which is also what highlights at build time, so the two cannot
disagree; and it is accessible (a real `contenteditable` text field,
labelled, with its own keyboard handling) and good on touch. Its size
(about 400 KB built, with the grammar) is why it is lazy.

**DECISION:** the static code is the field itself, not a picture of
it: it is readable and selectable with no script, has the field's
role and name, and the editor is put over it in place rather than
the page swapping one element for another.

**Scenarios.** `packages/lezer-ljos/test/` (the grammar: QML, the
dialect, `match`, `|>`, tasks, fetching, the demos parse with no
error), `packages/runtime/tests/codeblocks.spec.js` (static colours,
the editor fetched only when the reader reaches for the code and
taking over without moving a line, Tab and Escape, squiggles
and `aria-invalid`, no zoom at 390px, no horizontal page scroll),
`packages/runtime/site-tests/prerender.spec.js` (rich code as tall
prerendered as hydrated, coloured by class) and
`site-ljos/tests/site-ljos.spec.js` (a live block and the Pantry
edited in CodeMirror, a broken edit squiggled while the basket is
kept).

### A31. ERGO: compiler — the Ljós dialect in `qmlc` and in the page

`qmlc` and the compiler in the page (A15) take what `ljos check` takes
at the ljos-ui pin (`c2443e1593f56acfbf97d9f7f7fde921f3984f5d`), with its
meaning, its errors and its desugaring. Neither has a second parser: each
file goes through ljos-ui's `qml_syntax::desugar` before anything else
reads it, and every span is mapped back through its `SpanMap`, so an
error names the place in the text that was written, not the lowered one.

- **`match` (TC39) and the Hack pipe `|>` with `%`**, in a QML file's
  bindings, functions and handlers and in a `.lts` module. A match is
  lowered to what ljos-ui lowers it to; when that needs its helpers,
  `$is` and `$nomatch` are imported from `ljos-web/compiler/sugar`, which
  has them as ljos-ui's runtime does, so a match no arm fits throws
  ljos-ui's `TypeError` (``no arm of the `match` matches "huge"``). A pipe
  needs nothing at run time. An error of either is ljos-ui's, with code
  `syntax`: a body that never uses `%`, an arrow, conditional, assignment
  or `yield` as a body without parentheses, an extractor, a relational
  pattern, `and` and `or` mixed without parentheses.
- **`.ts` and `.lts` modules.** A QML file imports one by its path
  (`import "size.lts" as Size`) and modules import each other's values
  and types (`import { type Width, width } from "./width.lts"`). Types are
  erased by blanking, as ljos-ui erases them, so the JavaScript keeps the
  module's own lines and columns; an import read only as a type is
  dropped, as TypeScript drops it, and a side-effect import stays. What
  TypeScript cannot erase (an `enum`, a `namespace`, a parameter
  property, a default import or export, `export =`, `export *`, an import
  of a file not by its path) is ljos-ui's `ts-forbidden` error, which says what to
  write instead. `match` or `|>` in a `.ts` file is `ts-lts-syntax`, which
  names the rename to `.lts`, or says the `.lts` of that name is in the
  way. `qmlc size.lts` prints the module; `qmlc --out-dir` writes it as
  `size.lts.js`, and `qmlc --imports` lists what it imports. An import
  keeps the name it was written with (`./size.lts`), as a compiled QML
  file imports `./Foo.qml` that is written as `Foo.qml.js`: what serves
  the files (the Vite plugin, the page's linker) maps the one to the
  other.
- **No `Qt` global in `import Ljos.Ui` code.** In a file that imports
  `Ljos.Ui`, `Qt` is error `qt-global`, spanning the name, and the message
  says where the member went (`Qt.rgba` → `rgba` of `Ljos.Core`, a
  colour's name, or nowhere). A file that imports QtQuick keeps `Qt`. What
  `Ljos.Core` gives as globals (`App`, `Color`, `later`, `rgba`, `bind`, …)
  is imported from `ljos-web/Ljos/Core` only by a file that uses one, and
  a property of the same name is the property's.
- **TypeScript script blocks and handlers.** In a Ljós file whose script
  is TypeScript, a name nothing declares is `ts-no-any`
  (`` `x` has no type: it is not in scope ``), as it is in a module; other
  QML keeps JavaScript's `is not defined`.

Not here, and left to `ljos check`: what only its checker says (the
`tsconfig-lts` warning, `module-clash` for `size.ts` beside `size.lts`, and
type errors beyond the scope check). A page that compiles reports what
stops a compile; an editor runs `ljos check` for the rest.

**Diagnostics.** Every error the compiler in the page answers with is one
shape, which an editor puts on its text as it is (A30's
`setDiagnostics` takes it unchanged):

```ts
type Diagnostic = {
  message: string;   // ljos check's wording
  file: string;      // the project path; "" when the fault has no file
  line: number;      // 1-based, where the fault starts
  column: number;    // 1-based, in characters as ljos check counts them
  endLine: number;   // 1-based
  endColumn: number; // 1-based and exclusive: `Qt` at column 31 ends at 33
  severity: "error";
  code?: string;     // "syntax", "qt-global", "ts-lts-syntax", "ts-forbidden", "ts-no-any"; absent when ljos check has none
};
```

The span is the one `ljos check` prints, from the same `Span`. Columns
count characters (Unicode scalar values), so an editor that counts UTF-16
units shifts by one for each character outside the BMP before the column
on that line. A fault
the compiler cannot place (the wasm failing, a page module that does not
load, a module that throws as it runs) is at `1:1` to `1:1` of its file.
Warnings stay strings, as `qmlc` prints them. `qmlc` prints the same
errors as `{file}:{line}:{column}: {message}` on stderr, as it did.

**Scenarios.** `crates/ljos_web/tests/ergo.rs` holds ljos-ui's
`features/language` scenarios (`qt-global`, `pipe`, `match`,
`lts-modules`, `typescript-modules`) as compiles, with the text, line
and column `ljos check` prints, and `qmlc` on a module.
`packages/runtime/tests/compiler.spec.js` (both kernels) runs a match in
a `.lts` module on the page's sugar, gets the rename of a `.ts` module
as a diagnostic, and pins the shape above.

### A32. ERGO: runtime — Controller, Task, fetch and the homes of `Qt.*`

The runtime gives a file of Ljós's API what ljos-ui gives it natively:
the same members, the same order of what it is told, the same errors.
ljos-ui's features are the specification (`features/components/controller.feature`,
`features/platform/fetch.feature`, `features/language/no-qt-global.feature`),
and each has a spec here that walks its scenarios on both kernels.

**`Controller`** (`Ljos.Core`) is behaviour an item is given by declaring
it inside. Its `host` is the item it is declared in; a Controller inside a
Controller shares its host, one declared in a `Window` acts on the window,
and one held by something that is no item has none. It is `attached(host)`
once the host is complete, after the host's own `Component.onCompleted`
(or at once, when it is put into an item that is), and `detached()` once,
whichever comes first: the Controller destroyed, or what owns it ending (a
Loader that unloads, a view's delegate that goes). It is `updated()` once
after it is attached and then once at the end of each turn that changed a
property of the host. A change is a write, a binding that gives the host
something new, or what the host's type works out as it is read (an
anchored item's geometry), which is never written and so is followed for as
long as the Controller is. A property the host's file declares is followed
the same way, since it is written and bound outside the type's slots. Two
writes in a turn are one update. What a host's Controllers write in
`updated` arms none of them, as on the desktop: a Controller cannot keep
the page awake, and two Controllers of one host cannot keep arming each
other. Only a Controller that handles `updated` listens (one that
declares `onUpdated`, a module's `updated`, or a listener connected to
`updated` at any time, which hears the next change): a host with none pays
nothing for it.

A Controller written as a module is the same object with its lifecycle
given as functions:

```ts
import { controller } from "ljos-web/Ljos/Core";

export const Breakpoint = controller({
  properties: { at: 600 },
  bindings: { wide: (host, self) => host.width > self.at },
  attached(host) {
    const told = () => console.log(`${host.width} wide`);
    addEventListener("resize", told);
    return () => removeEventListener("resize", told);
  },
  detached: () => console.log("gone"),
});
```

A binding is a function of the host and the Controller, and what `attached`
returns runs as the Controller is detached, before `detached` itself. What
any of them throws is reported as a handler's throw is, and nothing else
stops for it: the rest of the page is still made, and a throw in `updated`
does not keep the next update away. A member it has not (`started`) is a
`TypeError` that names those it has.

The gestures (`Tap`, `Hover`, `Drag`, `Wheel`) are Controllers too: each
has a `host` and is attached and detached as a Controller is (destroyed,
it is detached and takes nothing more), and stays the handler it faces,
listening on its host's element. A gesture in a
Controller acts on the Controller's host; one in a `Window` acts on the
window's content item, since it needs an element to listen on.

**`Task`** (`Ljos.Core`) is a Controller that runs `run(...args, signal)`
and keeps what it gave: `status` (`initial`, `pending`, `done`, `failed`),
`value` (kept while a later run is pending) and `error`, with `done` and
`failed` told as it settles. A change of `args` runs it again at the end of
the turn, with the last `args` (two changes in a turn are one run), and
the run in progress is aborted through its signal: nothing a superseded run
gives is taken. A run that the aborted run's signal starts is asked for
last, so it is the run, and the call it interrupted is not made.
`autoRun: false` runs it only by `start(...)`; `abort()` fails the run in
progress with its signal's reason; and the run goes with the item it is
declared in.

```qml
Task {
    id: weather
    args: [root.city]
    run: (city: string, signal: AbortSignal) => fetch(`/served/${city}.json`, { signal }).then((reply) => reply.json())
}
Text { text: weather.status === "done" ? weather.value.sky : weather.status }
```

**fetch** is the page's own. `fetch`, `Request`, `Response`, `Headers`,
`AbortController`, `AbortSignal` and `DOMException` are the browser's, so
they answer as fetch.feature asks with no code of the runtime's: a reply is
a `Response` whatever its status, a body is read once, an unreachable server
rejects with a `TypeError`, an aborted request with an `AbortError` or the
signal's own reason, a timed-out one with a `TimeoutError`, and nothing polls
while a request waits. `tests/fetch.spec.js` holds each scenario, run
from a file of Ljós's API that `qmlc` compiles (`tests/scenes/fetching.qml`).

**The homes of `Qt.*`.** A file of Ljós's API has no `Qt`; what Qt's `Qt`
object held is each under its own name, imported from the module Ljós puts
it in:

| Qt | Ljós | Module |
|---|---|---|
| `Qt.point`, `size`, `rect`, `vector2d/3d/4d`, `quaternion`, `matrix4x4` | `point(…)`, `size(…)`, … | `Ljos.Core` |
| `Qt.rgba`, `hsla`, `hsva`, `Qt.color` | `rgba(…)`, `hsla(…)`, `hsva(…)`, `Color.of(…)` | `Ljos.Core` |
| `Qt.binding`, `Qt.callLater`, `Qt.resolvedUrl` | `bind(…)`, `later(…)`, `url(u, base)` | `Ljos.Core` |
| `Qt.application`, `Qt.quit`, `Qt.exit` | `App` | `Ljos.Core` |
| `Qt.locale()`, `Qt.locale(name)` | `Locale.current`, `Locale.named(name)` | `Ljos.Core` |
| `Qt.font`, `Qt.fontFamilies` | `Font.of(…)`, `Font.families()` | `Ljos.Ui` |
| `Qt.AlignHCenter`, `Qt.LeftButton`, `Qt.Key_Escape`, … | `Align.HCenter`, `MouseButton.Left`, `Key.Escape`, … | `Ljos.Ui` |

`url` takes the base the compiler gives it, the file's own. `Font.families()`
lists the families the page has loaded (`document.fonts`): the browser does
not tell a page what is installed. `App.exit(code)` warns that the code does
not reach a process, which a page has not.

**One fix on the wasm kernel.** The graph evaluates a binding as a write
reaches it, and a layout writes where its items go inside an effect's
callback. What each evaluation made was a root with no owner at all, which
Solid's development build refuses there, and the page stopped: a `Column`
in an anchored `Rectangle` was enough. Those roots are now held by one
owner that never ends; a root that ends is taken off it, so none piles up
(`tests/kernel.spec.js`, `tests/scenes/placing.qml`).

**Tests**, each on both kernels: `controller.spec.js`,
`controllerwindow.spec.js` (a Controller and a `Tap` in a `Window`),
`controllerfaults.spec.js` (what a module throws, a late `updated.connect`,
a gesture destroyed), the two in `controller.spec.js` that use
`tests/scenes/controllerpair.js` (two Controllers of one host that write
to it, and a declared property), `task.spec.js`,
`fetch.spec.js`, `ljoshomes.spec.js` (the names called from their
modules, and a compiled file, `tests/scenes/ljoshomesfile.qml`, that
reaches each with no `Qt`), and `ergoruntime.spec.js`, a card in
Ljós's API compiled by `qmlc` (`tests/scenes/ergoruntime.qml`) with a
Controller that keeps a label of its host's size as its anchors change it,
a `Tap` that counts, and a `Task` that fetches what the city names. Its
labels give their own `width`, which a `Ljos.Layout` `Column` keeps (A29).


## Part II — An application's own Rust types

## 1. The shape of a native type on the web

A type of the runtime's is a Solid component made by `defineType`
(`packages/runtime/object.js`): property slots behind accessors,
signals as emitter functions, methods on the prototype, enums on the
component itself, a `setup` that runs once per object. A Rust type
becomes exactly that, with a wasm struct behind it:

- `setup` makes one wasm struct per QML object and subscribes to its
  tellings.
- A property's slot is the face Solid tracks. The struct is the
  owner of the value; the slot holds what it last told (section 4).
- A method crosses once, with its arguments marshalled by
  wasm-bindgen; what it changed is told back before it returns.
- A signal the struct emits calls the kernel's emitter
  (`self.bumped(value)`), which runs the `onBumped` handler and
  whatever was connected, in the kernel's order.
- An enum is numbers on the component and in its `.enums`, as
  `defineType` already puts them; the values are the Rust enum's.

Nothing here interprets a `MetaObject` at run time. The kernel's
types are written out, not described, and a generated face is
written out the same way, so a binding to `counter.count` is one
accessor read and one slot, as a binding to `rectangle.width` is.

**DECISION:** the face is generated code per type — a wasm-bindgen
wrapper in Rust and a `defineType` call in JavaScript — not a
generic bridge that reads a type description at run time. The
kernel has no reflective path to hang one on, a reflective call
would cross the boundary per property read, and generated code is
what the desktop derive already emits (a property table and JS
thunks, ARCHITECTURE.md §5.5); only the target differs. Rejected: a
single `NativeObject` JS class driven by `ljostypes.json` at run
time (per-read crossings, and the dump would ship in the page);
hand-written faces per application (what the spike does, not what
an application should); Qt for WebAssembly (clean room, and it is a
second UI stack beside the DOM one).

## 2. What generates the glue, and what it generates

**DECISION:** a `web` backend of `ljos_macros` — the same derive and
`#[qml_impl]`, a second output beside the `MetaObject` — rather than
a separate generator that reads the type dump. The macro sees the
Rust types (an `i32`, a `String`, a `Vec<Row>`, a `Result`), which
the dump deliberately coarsens (`int`, `var`); the marshalled shapes
must be decided from the Rust side or the two builds of one type
drift. The dump still has its job: it is what the *compiler* reads
(section 3), and because both come from one macro over one struct,
they cannot disagree about names. Rejected: generating the face
from `ljostypes.json` alone (types too coarse; a second source of
truth); a build-time tool that runs the application's `register`
function (the dump exists precisely so no build runs application
code, MIGRATION.md §6).

Behind a `web` feature of the application's crate — the desktop
build must not pay for wasm-bindgen — the backend generates, for
each `QmlObject`:

In Rust, beside the struct (the spike's `mod web` in
`examples/wasm-counter/src/lib.rs`, hand-written):

1. A `#[wasm_bindgen]` wrapper struct owning the application's
   struct, named as the QML type is (`Counter`).
2. Per property: a getter, and for a writable property a setter
   that stores through the same path a desktop write takes (a
   field's `write =` function included) and tells its listeners
   with the new value when the value changed. A `readonly`
   property gets no setter; a `constant` one no listener.
3. Per `notify` property and per signal: a listener list
   (`Vec<js_sys::Function>`) and an `on_<signal>` registration.
   Signal emission from application code is the `emit_<signal>`
   the desktop macro already generates; on the web it tells the
   list after any property changes the same call made.
4. Per invokable: a method with marshalled arguments and return.
   A method the desktop writes against `cx: &Cx` gets a web `Cx`
   whose `get`/`set` work on the struct and collect the tellings
   to make when the call returns (section 5).
5. Per enum: the keys and values as constants the JS side reads
   once (or written into the JS by the build, below).
6. Singletons (`#[qml_singleton]`): one wrapper made lazily by the
   module's JS, its properties no different; `scope = "window"`
   is one per mounted root, which is the web's window (section 6).
7. `free` on drop of the face, and `Default`/the registered
   constructor as the wrapper's constructor. An `uncreatable`
   type's wrapper is made only by the code that hands it to QML
   (a return value, a context property, a model's holder).

In JavaScript, one module per QML module, written by the
application's build script next to the wasm-bindgen output (the
spike's `web/Counter.js`, hand-written):

8. An `await init()` of the wasm at module load: compiled QML
   makes objects synchronously, so the module must be there
   before any object of it is.
9. One `defineType(name, base, { properties, signals, methods,
   enums, setup })` per type. `properties` carries the kernel's
   kind for the Rust type (`typed(kinds.int, 0)` for an `i32`),
   so a QML write is converted and refused as it is for a
   runtime type, with Qt's wording, before it crosses.
10. In `setup`: the wrapper, its listener subscriptions wired to
    `slot(self, name).provide(value)` and to the kernel's signal
    emitters, `onChange` pushes for writable properties, and
    `onCleanup` freeing the wrapper.
11. Attached and group types: a group (`#[qml(group)]`) is the
    kernel's `group({...})` over the same wrapper — its members
    are properties of the one struct, told as `group$member`;
    an attached type is `defineType` with `attached`, its wrapper
    made per attachee as the kernel makes attached objects.
12. A visual type (`extends = Item`, a paint hook) is not a
    `QtObject` face: its `setup` also makes a DOM node, and its
    paint hook draws to a `<canvas>` in it from the display list
    the hook already builds. That is milestone W4, not the spike;
    until then a visual native type is a compile error on the web,
    naming it.

The build that ties it together is the application's, as its
desktop AOT build is: `ljos::build` gains a web entry that compiles
the QML (through `qmlc`), builds the wasm, runs the wasm-bindgen
CLI, and writes the JS module of item 9 from the same macro output
(a small JSON the derive's web backend also emits, so the build
script writes JS without parsing Rust). Section 13 lists the
ljos-ui changes.

## 3. How the compiler learns the types

Compiled QML must know at compile time that `Counter` has an `int`
`count`, that `bumped` names its argument `value`, and that
`Counter.West` is or is not an enum key — the same knowledge the
desktop compiler gets from `ljostypes.json`
(`Engine::type_dump().to_json()`, checked by the application's own
test, MIGRATION.md §6).

**DECISION:** the dump is the one input, read through the same
seam the desktop front end already has: `qml_front::TypeOracle`
(`crates/qml_front/src/oracle.rs` in ljos-ui). Its questions are
exactly the compiler's — `module_type`, `property`, `signal`
(argument names), `has_method`, `has_enum_key`, `default_property`,
`attached`, `required`, `is_singleton` — and a `DumpOracle` over
the parsed `ljostypes.json` answers them with
`members_checked` semantics: a member the type does not have is a
compile error, as it is in a desktop AOT build (`lable: 1`,
`onBumpd:`). The compiler now reads QML through
`qml_syntax`/`qml_front`, so `qmlc` can gain
`--types ljostypes.json`, which the Vite plugin passes; the output for a type of the dump is an import from the
module's JS (`import { Counter } from "ljos-web/Example"`), which
the application's Vite configuration aliases to the generated
module of section 2 — the same way `ljos-web/QtQuick` names a
runtime module today.

Rejected: generating `.qmltypes` from the dump and reading it back
(a second format to keep true, and `.qmltypes` has no enum
values); running the application under Node at build time to
introspect the wasm (the dump exists so builds run no application
code); QML stand-ins as the permanent mechanism (below).

**Until then** — and this is what the spike does — the compiler's
existing stand-in mechanism is the type entry: a QML file that
declares the type's properties, signals and functions, given with
`--with` (the Vite plugin's `standins`), as
`packages/runtime/tests/standins/Backend/Meter.qml` stands in for a
C++ type in the runtime's own tests. `qmlc` compiles against its
declarations and emits a default import of that file; the spike's
Vite configuration puts the wasm face where that file is asked
for. The stand-in is a second statement of the type and can drift
from the Rust; that is acceptable for a spike and is the first
thing the dump replaces (W1).

## 4. Reactivity across the boundary, without polling

There are two push-pull graphs and they meet at the slot:

| Ljós desktop (`ljos_reactive`, §6.2) | ljos-web (Solid, `object.js`) |
|---|---|
| A source node per observed property, allocated lazily | A signal per slot, made when first followed (`Slot.follow`) |
| A write marks observers, effects flush synchronously before the writer returns | `Slot.set` settles; `settle()` flushes and tells |
| A binding nobody reads does not run | A memo nobody reads is not evaluated |
| `batch` defers the flush | `gather`, and the tellings of one call settled once (section 5) |
| Writing an equal value does not propagate; `notify` always does | The wrapper tells only on a real change; the slot keeps the rest |

The rules at the seam, all of them in the spike:

- **Rust owns the value; the slot caches what it was told.** A
  binding reading `counter.count` reads the slot and is tracked.
  It never crosses the boundary. Nothing reads the wasm to find
  out whether anything changed.
- **A change in Rust is told at once, with its new value.** The
  wrapper's setter/method calls the property's listeners
  synchronously; the face puts the value in the slot with
  `provide` — the kernel's "a value the type gives, not an
  assignment" — so a QML binding on the property stands and wins
  as it does in Qt when C++ changes a bound property, while an
  unbound property simply has the new value. Then `settle()`:
  what depends on it is up to date before the wasm call returns,
  as §6.2's synchronous flush promises on the desktop.
- **Why the telling carries the value**, where QML's notify signal
  carries none: the listener runs while the Rust call that changed
  the value still holds the struct mutably, and reading
  `rust.count` from the listener is a second borrow, which
  wasm-bindgen refuses ("recursive use of an object detected which
  would lead to unsafe aliasing in rust"). This was the spike's
  first bug; carrying the value is also one crossing fewer.
  **DECISION:** generated tellings always carry the new value
  (and, for a change of several properties in one call, all of
  them, section 5). The QML-visible `countChanged` is the kernel's
  own, derived from the slot as for every type, and carries
  nothing, as Qt's does.
- **A write from QML crosses once.** A binding's new value or an
  assignment lands in the slot; the face's `onChange` pushes it to
  the wrapper's setter, which stores it (through the field's
  `write =` function, if any) and tells — and the face, hearing
  its own value back, does nothing: it keeps what the struct last
  told (`known` in the spike) and compares against that, which is
  also how a setter that corrects a value (clamps it) is heard
  exactly once, with the corrected value. The first value a
  property is given as its object is made is pushed the same way,
  through `onChange`'s `first` — `setup` itself reads no property,
  as the kernel requires.
- **Re-entrancy.** Ljós's rule is that the Engine never holds a
  borrow across a JS call (§6.1); the web's mirror is that no
  crossing into the struct happens while a telling from it is
  being settled. A QML write made in answer to a Rust change (a
  binding the change sets off) is held to a microtask and pushed
  then. It is the one place web timing differs observably from
  the desktop's fully synchronous flush, and it wants a
  `@qt-diverges`-style scenario when the suite runs here
  (section 11). **DECISION:** hold and say so, rather than make
  every wrapper interior-mutable and poll for what a handler
  changed (which is polling by another name).

Idle means idle: no timers, no `requestAnimationFrame` of this
seam's own, no dirty checking. The listeners are the only way
anything moves, and a slot's signal exists only once something
followed the property — an object nobody binds to costs its struct
and nothing else. Rejected: polling on a timer or a frame
(Ljós's §2.5, and a laptop fan); shared memory with
`Atomics.wait` (needs cross-origin isolation, blocks the main
thread — where it is forbidden — and still needs a wake-up
channel, which is the telling again); a Proxy that crosses on
every read (a binding over a model would pay it per delegate per
flush).

## 5. Batching, and what a crossing costs

Measured on the spike (section 11): one `increment()` across and
back, nobody watching, is **0.44 µs**; a whole click — hit test,
handler, crossing, telling, flush, DOM write — is a **0.3 ms**
median. A crossing of a scalar is not the cost to fear; the number
of crossings is. So the generated shapes are:

- Property read from QML: **0 crossings** (the slot).
- Property write from QML: **1** (the setter), plus 1 back per
  other property the setter's `write =` function changes.
- Method call: **1**, plus 1 back per property it changed and per
  signal it emitted — with the change telling below, 1 back in
  all, however much it changed.
- What an object is given as it is made: its given properties
  pushed once each at completion (`first`), never per binding
  evaluation.

**DECISION:** a method call, and a setter with side effects,
collects its tellings on the Rust side and makes **one** call back
with all of them — the web `Cx` of section 2 is the collector,
mirroring `Reactive::batch` ("component creation, model resets,
animation ticks and layout all run inside a batch"). The shape is
a small array the wrapper builds in its own memory:
`[propertyIndex, value, …, signalIndex, args…]` handed to one
registered listener per object, which provides every property,
emits every signal in order, and settles once. The spike tells
per property (two crossings back for `increment`: the change and
`bumped`) because one counter does not need the collector; the
collector is W2's work and changes nothing an application writes.

Costs by value kind, for the generator's table:

| Rust type | Crosses as | Cost driver |
|---|---|---|
| `i32`, `f64`, `bool`, enums | a JS number/boolean | the call itself (~0.1–0.5 µs) |
| `String` | a JS string (copied, UTF-8→UTF-16) | its length; the slot caches it, bindings don't recopy |
| value types (`Point`, `Color`, `Font`…) | the kernel's JS value (`color(...)`, a rect object) | one small object per change, none per read |
| `Vec<T>`, maps, `serde_json::Value` (`var` data, §6.1) | a JS array/object, deep-copied once at the crossing | its size; a `var` property the script holds is the script's own object and does not cross back until assigned |
| an object (`ObjectId`, a `list<T>` element) | the kernel object of that struct (a registry by wrapper pointer) | a map lookup; identity is preserved, as `===` must say so |
| a model page (section 7) | one call per page, an array of row objects | the page, read once; delegates read the cache |

Rejected: JSON text as the interchange (Ljós crosses structured
data "without JSON text", MIGRATION.md §6, and wasm-bindgen
already marshals); a generic `get(name)`/`set(name, value)`
surface (string keys per call, and no typed refusals on the JS
side).

## 6. Threads: what runs where

Ljós's rule is that threads talk to the Engine only through
`UiHandle`: bounded messages, coalescing by key, fail-fast or
wait-for-room, drained under a frame budget (§3.3). The browser's
threads are Web Workers, and its messages are `postMessage`. The
mapping:

| Ljós (§3.2) | ljos-web |
|---|---|
| UI thread: Engine, objects, graph, JS | The main thread: compiled QML, the runtime, the DOM — and the application's wasm types, which bindings must reach synchronously |
| tokio workers: network, SQLite, watchers — the *app core*, which outlives the window | A dedicated worker running the application's core as its own wasm instance; it survives a remount of the UI (hot reload, section 9) as the core survives an Android Activity |
| Compute pool: image decode, parsing, shaping | A small pool of workers; image decode is the browser's (`createImageBitmap`) more often than not |
| Pinned threads: WorkerScript, plugin runtimes | One worker each, its own wasm instance and its own JS realm — closer to §3.2's isolation than a thread is |
| Render thread (not in v1) | Not here either; the browser composites |

**DECISION:** two wasm instances are the default shape — the
UI-affine one on the main thread (the types QML names, created and
method-called synchronously) and, where an application has an app
core that Ljós would put on tokio, a core worker. They are the
same crates compiled once; which types live where is the
application's `register` split, as the desktop decides what is
Engine state and what is a service. Rejected: everything on the
main thread (a 200 ms parse in Rust is a frozen page, and §2.4's
one-owner rule exists to be kept); everything in a worker with the
UI as a thin shell (bindings are synchronous; every property read
would be a round trip — Qt for WebAssembly's shape, not this
one); wasm threads inside one instance (`wasm32` threads need
cross-origin isolation and a thread-support build of everything,
for less isolation than a worker per owner gives).

`UiHandle` on the web is a generated postMessage channel with
§3.3's semantics kept: a bounded queue on the receiving side
counted in messages, `send_coalesced(key, msg)` keeping the latest
per key (a state snapshot from the core is the natural payload),
fail-fast `Full` mapped to a rejected send the Rust side sees.
The first message wakes the receiver — on the main thread that is
the event itself; there is no `request_repaint` to call because
the telling into a slot settles the DOM directly. Window-scoped
singletons are one per mounted root; engine singletons one per
page. A core worker is supervised as §9.4 supervises: on its
error event or a missed answer to a ping the shell restarts it
from its registration and the UI keeps its last values — "let it
crash", with the boundary at the worker.

## 7. Models

A desktop application gives list data as a `QmlListModel`
(`row_count`, `role_names`, `data`, `set_data`, `row_key`)
attached with `Engine::set_list_model`, and reports changes
through `ModelSignals` (`rows_about_to_be_inserted` /
`rows_inserted`, `rows_removed`, `rows_moved`, `data_changed`,
`roles_changed`, `model_reset`). The runtime here already has the
receiving shape: `AbstractListModel` in
`packages/runtime/QtQuick/model.js` is what views follow — a
`$elements` array of row objects with a property per role,
`$roles`, and `$observe` telling of `inserted(index, count)`,
`removed`, `moved` and new roles, with per-role `track`/`touch`
signals made only when a delegate first reads that role of that
row.

**DECISION:** a Rust list model generates a face derived from
`AbstractListModel`, and the correspondence is structural, not
per-cell:

- The wasm side keeps the rows. The face's `$elements` is a
  **page cache**: row objects materialised a page at a time (the
  `fetchMore`/`canFetchMore` seam; 256 rows a page until measured
  otherwise) by one crossing that returns the page as an array of
  role records. A view asks only for rows near the viewport —
  virtualised views are §8.4's rule and the runtime's already —
  so rows nobody looks at are never marshalled. This is the lazy
  read; there is no crossing per delegate read.
- `ModelSignals` map one-to-one onto `$observe` tellings, with the
  two-phase insert/remove kept: "about to" tells the face to drop
  or shift cached pages without asking the model anything it
  cannot yet answer; the completion telling carries the range,
  and only the pages a view holds are refetched. `data_changed`
  with roles touches those roles of those cached rows (refetching
  a held page only where the changed range is held);
  `model_reset` clears the cache and tells removed-then-inserted,
  as the kernel's `reset` does.
- A delegate's write (`set_data`) crosses once and is told back
  as `data_changed`, not applied locally first: the model may
  refuse or correct it, as a property setter may.
- `row_key` is crossed with the page and used as the delegate's
  identity, so a moved row keeps its delegate, as on the desktop.
- Table models are the same face with `columnCount` and
  per-column roles over the runtime's table path (its `Grid`
  stand-in in the runtime tests is the QML-written shape of one);
  tree models wait until the runtime's views ask for parents
  (W5, said plainly).

Rejected: materialising every row at attach (a 100k-row log model
pays 100k records before first paint); a `get(row)` crossing per
delegate creation (a page is one crossing for every delegate in
it); keeping the rows on the JS side and treating Rust as a store
of record to sync (two owners again).

## 8. Async: fetch, timers, promises

The browser's async is the platform's, and Ljós already puts such
things behind a `Platform` seam (MIGRATION.md §6: `fetch` and
`request` answered on the Engine thread, `call_at` timers,
`ljos::task::spawn` answered likewise, panics reported and the
`done` still run). The web platform behind that seam:

- **Fetch** is the browser's `fetch`, through `web-sys`, awaited
  with `wasm-bindgen-futures`. An invokable that is `async` in
  Rust, or one taking the desktop's `done` shape, is generated as
  returning a JS `Promise`; a QML binding never sees a promise (a
  binding gives a value, the kernel's rule), so async results
  land in properties and are told, exactly as a desktop fetch
  lands through `UiMsg`. Cancellation is an `AbortController` the
  wrapper holds per call, aborted when the object is destroyed.
  The desktop fetcher's limits (30 s, 16 MiB) become the web's
  defaults too, so behaviour does not change with the target.
- **Timers** are `setTimeout`/`setInterval` behind `call_at`:
  one browser timer per armed Rust timer, none when none are
  armed — 0 % idle again. Time itself is the page's clock, and
  the runtime's virtual clock for tests (`clock.stop()` /
  `advance`, as the runtime's harness drives scenes) is what a
  Rust timer must also read in a test build (section 11);
  **DECISION:** generated timers go through one `ljos_web::clock`
  shim over `setTimeout` so the test clock can stand in, never
  raw `web-sys` calls scattered through generated code.
- **Heavy work** is `task::spawn` onto the compute pool of
  section 6: the closure crosses to a worker as its own wasm
  entry, and its answer is a `UiHandle` message. A panic there is
  reported and the `done` still runs, as on the desktop.
- No async runtime in the main-thread wasm: no tokio (it has no
  timers or net to drive there, and its multi-thread runtime
  cannot exist), one `wasm-bindgen-futures` executor on the JS
  microtask queue, which is the only queue the page has.
  `block_on` does not exist; desktop code that blocks a *tokio
  worker* belongs in the core worker, where blocking its own
  thread is as legal as it is on the desktop.

## 9. Crates: what must stay wasm-friendly, what never comes

| Crate (ljos-ui) | On the web |
|---|---|
| The application's own crates (types, models, logic) | **Yes — the point.** What they may use is below |
| `ljos_macros` | Host-side (proc macros always are); gains the `web` backend |
| `ljos_reactive` | Already wasm-able (slotmap, smallvec, thiserror only); core-worker code may use it for its own graph. The main thread's graph is Solid's — the crate is not in the UI path |
| `ljos_ir` | Already wasm-able (serde, postcard, blake3); not needed by the page (no IR at run time), used by tools if at all |
| `ljos_runtime` | Its inbox/clock/lane types yes, behind its existing shape; the `tasks` feature (tokio) no — it is already off by default |
| `ljos_engine` | **Not as it stands**: it depends on `ljos_js`. The parts application code names through the facade (`Value`, `Cx`, `Prop<T>`, `QmlListModel`, `ModelSignals`, error types) must be reachable without the JS host — a feature or a split (section 13) |
| `ljos_js` (rquickjs) | Never. The browser has its own JS; a second engine is weight and a second semantics |
| `ljos_egui`, `ljos_shell`, `ljos_render` B0, `ljos_quick`'s scene, `ljos_text`, `ljos_media`, `ljos_host` | Never. The DOM, the runtime's types and the browser's text/media are their counterparts |
| `qml_syntax`, `qml_front`, `qt_types`, `ljos_compiler` | Build-time only, on the host, as they already are for a shipped desktop app (§2 rule 5). They need not target wasm at all |

**DECISION:** "wasm-friendly" is a property of the facade's
surface, not a porting project for the engine. An application
crate that compiles for the desktop against `ljos::prelude`
compiles for `wasm32-unknown-unknown` against the same prelude
with the facade's `web` feature, or gets an error naming the
desktop-only thing it used (a paint hook before W4, a platform
service with no web counterpart). New web-only code lives in one
new crate, `ljos_web` in ljos-ui (the runtime half applications
link: the clock shim, the `UiHandle` channel, the collector),
plus the generated JS in this repository's runtime package
(`packages/runtime/web/` — a home for the shared half of every
generated face, so faces stay small). Rejected: cfg-gating half
of `ljos_engine` in place (the engine's object store has no work
to do where Solid owns the objects); a `std`-free rewrite of
anything (wasm32-unknown-unknown has `std`; threads and blocking
IO are what it lacks).

## 10. Bundle size, hot reload, errors

**Size.** The floor is the runtime, not the wasm. The spike's
bundle: wasm 39,120 B (11,866 B gzip) for one type with the
wasm-bindgen runtime in it, its generated JS 7,684 B (2,249 B
gzip), and 433 kB of JS (157 kB gzip) for Solid plus the parts of
QtQuick the page used — the runtime is not yet tree-shaken per
application beyond what Rollup does with its modules. Targets,
as budgets the milestones are held to:

- Marginal cost of a native type: **≤ 1 kB gzip of wasm and
  ≤ 0.5 kB of face JS** at the spike's shape (properties, a
  method, a signal). The first type pays the wasm-bindgen fixed
  cost (~12 kB gzip), the rest must not each pay it again — one
  wasm per application, never one per type or per module.
- A first useful page (runtime subset + an application's types):
  **≤ 250 kB gzip** before W3 is called done, measured on the
  spike grown to a model and ten types, so the number is about
  the mechanism and not about one counter.
- `opt-level = "z"`, one codegen unit, `panic = "abort"` in the
  application's release profile for the web (section below);
  `wasm-opt` is run by the build where it is installed, and the
  size is reported by the build either way, as Vite reports the
  JS.

Rejected as a target: matching a hand-written JS page byte for
byte. The comparison that matters is against the Qt for
WebAssembly download an Ljós application would otherwise ship,
and against staying on the desktop only.

**Hot reload.** The Vite plugin already recompiles a `.qml` file
and its directory on save (`hotUpdate`), and the root mounted from
it keeps its state (A13). Two more cases:

- *A type's shape changes* (a property added): the dump changes,
  the application's test that checks it says so, `qmlc`
  recompiles against the new dump, and the face is regenerated.
  Vite treats the generated module as it treats any module: the
  page reloads. This is §12's "a change to a singleton's shape
  forces a full restart", at module grain.
- *Rust logic changes, same shape*: the wasm is rebuilt and the
  page must take the new instance. **DECISION:** dev builds load
  the wasm from a generation-tagged URL (`?generation=N`, which
  §12 notes the desktop resolver already ignores in file URLs);
  on a rebuild the shell remounts the root against the new
  instance, carrying state by the desktop's own rules — assigned
  property values by `id`/`objectName` (`ObjectKey`), and Rust
  state through the `Migrate` snapshot a type already implements
  for desktop reload, taken to a plain JS value before the old
  instance is dropped. What does not migrate remounts with
  defaults and says so, as §12 says. Rejected: hot-patching wasm
  functions in place (no such thing in the browser); full page
  reload for every Rust save (loses the core worker too, which
  section 6 keeps alive across exactly this).

**Errors and panics.**

- A Rust method returning `Err` (the desktop's `EngineError`
  shape) is told as a QML warning naming the method, through the
  kernel's `reportError` path — the same place a handler's throw
  goes, so whoever called it goes on and the failure is in the
  console with the object's name, not a dead page.
- A panic in the main-thread wasm aborts that instance
  (`panic = "abort"`; the panic hook the build installs reports
  the message and the Rust backtrace to the console first).
  There is no catching it and carrying on with half a struct:
  **DECISION:** the shell treats it as Ljós treats a boundary
  fault — the root remounts from its component with defaults,
  the last good DOM stays until the new root stands, and the
  fault is reported with its file and line (the hook carries
  them). A panic in the core worker restarts the worker
  (section 6). `panic = "unwind"` across the boundary is
  rejected: unwinding into JS frames is not a thing wasm does
  soundly today, and a caught panic that leaves the struct in
  an unknown state is worse than a clean remount.
- A type the dump names and the wasm does not export (a stale
  build) is an error at module load naming the type, mirroring
  the runtime's `absent()` for a Qt type it does not have yet —
  never an undefined that surfaces three bindings later.

## 11. Testing: the Gherkin ledger on the web

Ljós's behaviour is written as Gherkin in `features/`, one
directory per area, surfaces as tags (`@headless`, `@desktop`,
`@android`, `@ios`, `@wgpu`), run through `ljos_bdd`'s `Backend`
trait (`load`, `set`, `get`, `call`, `advance(ms)`,
`click(role, name)`, `key`, `touch`, `a11y_tree`, `log`, `grab`)
with a backend per surface and the Qt backend as oracle
(ARCHITECTURE.md §18.3). Steps find interactive elements by role
and accessible name; objects by `objectName` path; time is one
injectable clock.

**DECISION:** the web is one more surface, `@web`, and one more
backend — not a second suite. The backend is a small Node runner
in this repository (`packages/runtime/tests` is its pattern
today) that:

- `load` compiles the scenario's QML with `qmlc` (against the
  dump where the scenario has native types) and mounts it in
  headless Chromium through Playwright, as the runtime's scenes
  are mounted;
- `get`/`set`/`call` read and write the kernel objects by
  `objectName` path, as the runtime's own specs read
  `window.scene`;
- `click(role, name)` resolves through the page's accessibility
  tree (Playwright's `getByRole`) — the runtime builds DOM with
  roles and names, and where it does not, the scenario failing
  is §2.7's point: what a test cannot find, a screen reader
  cannot either;
- `advance(ms)` drives the runtime's virtual clock, which the
  Rust timers also read (section 8's shim), so "500 milliseconds
  pass" is deterministic over QML `Timer`s and Rust `call_at`
  alike;
- `a11y_tree` reads the DOM's computed accessibility tree and
  maps it to the same node shape the desktop backend compares;
- `grab` is a Playwright screenshot; `log` is the console,
  where warnings already fail the runtime's specs.

The judging half needs no transplant: `ljos_ratchet` (PIN,
globs, `RATCHET`, scenario ids) depends on almost nothing and an
external suite is already run in place against a pinned checkout
(§18.4). The web runner consumes the same `RATCHET`: scenarios
held for `@web` are added as they pass, never removed. What
cannot run is tagged, with reasons, by the suite's own rules:
`@backlog-web` for what ljos-web lacks yet (a visual native type
before W4), `@qt-diverges` where the web's timing is the stated
difference (section 4's held write). Scenarios about pixels the
Qt oracle cannot check, it cannot check here either; scenarios
about egui's surface do not exist, by the ledger's writing rules.

And the layers under it keep their own tests: an application's
Rust types are tested natively through the same interface on
every target (`cargo test`, as the spike's `Counter` is); the
generated face gets compiler snapshot tests in `ljos_macros` and
a browser spec per shape it can generate (property kinds, a
signal with arguments, a model) in the runtime's suite — the
spike's spec is the first.

## 12. The spike: `examples/wasm-counter`

What runs today, end to end (`mise run test:wasm-counter`):

- `src/lib.rs` — a `Counter`: `count` and `step` properties
  with change tellings, `increment()`, and `bumped(value)`. The
  logic is plain Rust with native tests; a hand-written
  wasm-bindgen wrapper (`mod web`) is what section 2's macro
  would generate.
- `types/Example/Counter.qml` + `qmldir` — the type entry
  `qmlc` compiles against (section 3's "until then").
- `qml/Main.qml` — imports `Example`, binds a `Text` to
  `counter.count`, calls `increment()` from a `MouseArea`,
  handles `onCountChanged` and `onBumped`.
- `web/Counter.js` — the hand-written face: one `defineType`
  over the wasm, exactly the pieces of section 2 that a
  `QtObject` type needs, and the seam rules of section 4
  (value-carrying tellings, the `known` cache, held writes).
- `vite.config.js` — the ljos-web plugin with the stand-in
  directory, plus a five-line plugin putting the face where
  compiled QML asks for the stand-in file.
- `tests/counter.spec.js` — four Playwright tests against the
  built bundle, in the house style of `examples/web`'s spec
  (page errors and console warnings fail it): the binding,
  three real clicks and both handlers, a `step` written from
  QML counting in Rust, and the measurements:

| Measure | Result |
|---|---|
| `.wasm`, raw / gzip | 39,120 B / 11,866 B |
| wasm-bindgen's generated JS, raw / gzip | 7,684 B / 2,249 B |
| Whole bundle JS (Solid + the QtQuick parts used) | 433 kB / 157 kB gzip |
| Click (pointer release) to the DOM words changed, 30 real clicks | **0.3 ms median**, 1.3 ms worst |
| One `increment()` across and back, nobody watching | **0.44 µs** |
| Tests | 3 Rust unit tests, 4 Playwright tests, all passing |

Two findings from building it are load-bearing in the design
above: a telling must carry its value or the listener's own
read is a refused second borrow (section 4), and a write made
in answer to a telling cannot cross until the telling's call
has returned (also section 4). A third is smaller: an `Item`
root mounted in an element of no height is hit-tested against
that height — the example's page gives its element the root's
size, as the runtime's test pages do.

To look at it rather than test it: run the mise task once (it
builds the wasm into `pkg/`), then
`pnpm --filter ljos-web-example-wasm-counter dev` and open the
address Vite prints, in a browser.

What the spike deliberately is not: no generated code (the
macro is W1), no dump (the stand-in stands in), no model, no
worker, no batching collector, no visual native type.

## 13. What ljos-ui would need

In the order the milestones need them. Nothing here was changed
by this spike; `ljos-ui-src` was read only.

1. **`crates/ljos_macros/src/lib.rs`** — a `web` output from
   `derive_qml_object` and `qml_impl_inner`, behind a
   `#[qml(web)]` container marker or the consuming crate's
   feature: the wasm-bindgen wrapper of section 2 (items 1–7),
   plus the small JSON the build turns into JS. The desktop
   output is untouched.
2. **`crates/ljos_engine`** — the facade-facing types an
   application names (`Value`, `Cx`, `Prop<T>`, `Atom`,
   `QmlListModel`, `ModelSignals`, `EngineError`, `Reset`,
   version types) reachable without `ljos_js`: either split
   into a `ljos_meta` crate the engine and `ljos_web` both use,
   or a default-on `js` feature in
   `crates/ljos_engine/Cargo.toml` gating the `ljos_js`
   dependency and its uses. **DECISION:** the split crate —
   a feature would put `cfg` through the object store for a
   target that never uses it; the split is the seam §5.5
   already draws between the type description and the engine
   that runs it. This is the largest item here and wants its
   own review in ljos-ui.
3. **New crate `crates/ljos_web`** — the runtime half an
   application's wasm links: the web `Cx` and its telling
   collector, the clock shim, the `UiHandle` postMessage
   channel, the panic hook, `fetch` behind the `Platform`
   seam, the wrapper↔face object registry. `std` only, no
   tokio, no `ljos_js`, no egui (rule 4 keeps its three
   crates).
4. **`crates/ljos` (the facade)** — a `web` feature: the
   prelude names the same types from `ljos_web` where the
   desktop names them from the engine; `ljos::build` gains
   `compile_web(qml_dir, ljostypes.json, out_dir)` beside
   `compile_dir_with_types`, which runs `qmlc`, the
   wasm-bindgen CLI (version checked against the crate's, as
   the spike's task pins it), and writes the module JS.
5. **`crates/qml_front/src/oracle.rs`** — a `DumpOracle`
   implementing `TypeOracle` over a parsed `ljostypes.json`
   (the parser is the one `compile_dir_with_types` already
   has), marked fully described so unknown members are compile
   errors. Shared by the desktop AOT path if it wants it; the
   web compiler is the first consumer.
6. **`crates/ljos_bdd`** — nothing for the runner itself; the
   `@web` surface name in `features/README.md`'s tag table
   and the surface in the backlog filter's vocabulary. The
   backend is Node-side (below).
7. **In this repository, not ljos-ui**: `qmlc --types
   <ljostypes.json>` and a `types` option in
   `packages/runtime/vite.js` (once the compiler is on
   `qml_front`); `packages/runtime/web/` with the shared face
   helpers `Counter.js` hand-writes today; the `@web` Gherkin
   backend beside `packages/runtime/tests`. The compiler
   workers' files (`qml_syntax`, `qml_front`, `qt_types`
   wiring) are not touched by any of this beyond item 5's new
   oracle, which is additive.

## 14. Milestones

- **W0 — the spike (done).** One Rust type end to end by hand;
  the seam rules found by building it; measured. Exit: this
  document and `mise run test:wasm-counter` green.
- **W1 — one statement of each type.** `DumpOracle` +
  `qmlc --types`; the `ljos_macros` web backend generating
  items 1–11 of section 2 for `QtObject` types (scalars,
  strings, value types, enums, signals, invokables,
  singletons); the spike regenerated with nothing hand-written
  but the application. Exit: the counter's face and wrapper
  are build output; a property the type lacks is a compile
  error from the dump.
- **W2 — the crossing, finished.** The telling collector (one
  call back per method), the object registry (identity for
  object-valued properties and returns), `var`/data crossing,
  group and attached types, `Result` → warning. Exit: a
  generated-face spec per shape in the runtime suite; the
  marginal-cost budget of section 10 measured on ten types.
- **W3 — models and async.** `QmlListModel` faces with page
  caches over `AbstractListModel`; `fetch`, timers through the
  clock shim, `task::spawn`; the core worker and web
  `UiHandle`. Exit: a ListView over a 100k-row Rust model
  paints without marshalling off-screen rows, in a spec.
- **W4 — visual native types.** A paint/item hook drawn to
  canvas inside an `Item` face; pointer, key and wheel hooks
  from the runtime's events. Exit: the facade's gauge example
  (MIGRATION.md §6) running in the browser unchanged.
- **W5 — the ledger on `@web`.** The Gherkin backend of
  section 11; `features/` areas brought onto `RATCHET` in
  the order applications need them (bindings, items, views,
  models first); table faces. Exit: `mise run features`-style
  run in this repository's tasks, held scenarios counted.
- **W6 — the dev loop and shipping shape.** Generation-tagged
  wasm hot reload with `Migrate` snapshots; bundle budgets
  enforced by the build; source maps from Rust panics to
  lines in the console; a real application (already on Ljós
  for the desktop) served from the same tree. Exit: that
  application, in a browser, from an unmodified checkout of
  its own repository.

- **W7 — the kernel in wasm (phase 1, this branch).** `ljos_reactive`
  as `ljos_web_kernel`, behind `#kernel`; three Solid-signal sites
  moved. Exit: the kernel's own spec passing on both kernels except
  the two A7 divergences; the whole runtime suite run on both; size
  and crossing cost measured (A4, A8). Where it ended: the Solid
  kernel passes 673 of 734, its 61 failures all environment (Quick3D
  44, Particles3D 12, Multimedia 4, XR 1). The wasm kernel passes
  544: the same 61 plus 129 of its own, every one traced so far to
  R3 (a `createMemo`/`createEffect` site the graph cannot see —
  Behavior, Animation, the spin box, containers, models), and the
  two of A7. So the exit is met for the kernel and not yet for the
  runtime; W8's first job is the 129.
- **W8 — the kernel, finished.** Every `createSignal`/`createMemo`
  site on `#kernel`; `ljos_reactive`'s clean-read path profiled and
  brought to ≤ 2× Solid's (a native win too); the two A7 loop
  scenarios in ljos-ui `features/` and passing natively; kernel size
  and page budget enforced by the build. Exit: the runtime suite
  equal on both kernels. Where it ended: every site moved (signals,
  memos a binding reads, `untrack`), faces told rather than evaluated,
  `mise run test:size` in `mise run test`. Solid kernel 671 of 735, the
  wasm kernel 669: the same environment failures (Quick3D,
  Particles3D, Multimedia, XR) and three of its own, all the loop
  rule of A7 (`lateloop`, `imageloop`, the button box). The loop
  scenarios are in ljos-ui's `features/` (branch `web-needs-loops`),
  two of them held `@backlog` until `ljos_reactive` learns the rule;
  the clean read is 18 ns, not ≤ 2× Solid (A4). So the exit waits on
  ljos-ui: the loop rule, and a pin of `ljos_reactive` that has it.
- **W9 — `@web` ledger, first areas.** Section 11's backend over
  bindings, properties/signals, completion, positioners,
  Repeater/Loader, states; `RATCHET` holding what passes. Exit: the
  ledger run from this repository's tasks with qml6 as the oracle.
- **W10 — semantics move.** In A3's order, each gated by its
  `@web` scenarios on the wasm kernel: value kinds and colour
  (after `ljos_meta`), locale (`ljos_i18n`), easing/spring/smooth
  and layout arithmetic (after `ljos_quick_core`), then positioners,
  states and animation jobs. The JS copy of each is deleted when
  it moves; the Solid kernel is deleted when the ledger is equal.
  Exit: `object.js` keeps types and faces only.
- **W11 — live shells.** A9 end to end behind `liveShell`: the
  compiler chunk, the tier-1 evaluator shared with iOS, the drop
  component, state carrying, localStorage, the publish hook, and a
  security spec per item of A9's list (each one an attempted escape
  that must fail to compile or to run). Exit: an example site with
  three blocks whose shell a test replaces live, keeping a block's
  state, and every escape spec green.

## 15. Open risks

- **The `ljos_engine` split (item 2 of section 13) is the
  schedule risk.** Everything else is additive; that one
  moves types other crates name. If it stalls, W1 can start
  against a `ljos_web`-local copy of the few types the macro
  output names (`Value`, `Prop`) — at the cost of two `Value`s
  until the split lands, which must not be allowed to become
  permanent.
- **Two reactive graphs, one semantics.** §6.2 already
  documents where pulled bindings read newer than Qt's pushed
  ones, and Solid pulls too — but not identically (loop
  handling, handler order around a flush). The `@qt-diverges`
  scenarios are the early warning; expect a handful of new
  stated divergences, and budget W5 time for arguing each.
- **wasm-bindgen's borrow rules shape the API.** The held
  write of section 4 is the visible consequence; a subtler one
  is that a Rust method cannot be told of a change it caused
  and react synchronously through QML in the same call stack.
  Desktop code that leans on deeply re-entrant handlers will
  feel this first.
- **The runtime's size is the bundle's floor.** 157 kB gzip
  for a counter page is the runtime's current shape, not the
  wasm's. The ≤ 250 kB budget leaves little room until the
  runtime is shaken per application (its modules are files;
  the work is ordinary, but it is work).
- **Workers double the wasm.** A core worker is a second
  instance and a second download unless the build shares the
  module bytes across both (it can: one `.wasm`, two
  instantiations, cached once) — W3 must do this, not assume
  it.
- **No threads, no blocking, anywhere on the main thread.**
  Desktop Rust that blocks (a synchronous file read in a
  method) has nowhere to go on the web but the core worker,
  and the facade error for it must say that in so many words.

- **R1 — two loop semantics.** The spike found `ringed` (ljos-web)
  and `ljos_reactive` (ljos-ui) disagree where a loop closes late or
  through a value a type works out for itself (A7). Qt's answers
  favour `ringed`; ljos-ui's ledger does not hold either case yet.
  Settling it changes `ljos_reactive`, whose callers are the whole
  native stack.
- **R2 — the graph's per-read cost.** 64–88 ns per clean tracked
  read in wasm against Solid's 4–6 ns. Most of it is the graph, not
  the boundary (an empty call is 11 ns). If `ljos_reactive` cannot
  get within 2×, pages with tens of thousands of bindings feel it
  first; the fallback is keeping clean reads JS-side behind a
  version check (one crossing per change, none per read).
- **R3 — the hybrid hole.** Until every runtime Solid signal is on
  `#kernel`, a binding the graph runs misses what such a signal
  says — silently stale, not an error. The wasm-kernel suite is the
  detector (129 failures at the end of W7); W8 closes it. A second
  symptom shows in the same run: Solid's HUGE_FAN_OUT warning on a
  few specs (graphs3d, handlers, popup drawers, containers, popups),
  a face signal with tens of thousands of subscribers, which is a
  Solid computation still being made under a long-lived owner on
  each graph evaluation somewhere W7 did not reach.
- **R4 — the `ljos_engine`/`ljos_js` coupling** blocks value kinds,
  `ljos_quick`, the tier-1 evaluator (and so live shells). Same risk
  as section 13 item 2, now on three tracks' path.
- **R5 — the size curve.** 28 kB gzip for the graph alone, without
  `wasm-opt`. Each later move must pay for itself in JS removed;
  ICU4X data for `ljos_i18n` is the one most likely not to (keep
  `Intl` as its data source on the web if so).
