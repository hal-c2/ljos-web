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
| `kernel/solid.js` | ljos-web | Adapter: Solid's own signals (the runtime as it was) | seam K |
| `kernel/wasm.js` | ljos-web | Adapter: raw wasm imports/exports, faces, rethrow | seam K above, seam W below |
| seam W | — | `ljos` import module: `evaluate(u32)->u32`, `changed(u32)`; exports `ljos_cell/binding/read/pull/bump/follow/dispose/live` | numbers only |
| `ljos_web_kernel` | ljos-web now, ljos-ui later | Owns the graph: `Kernel` over `Graph<u32>` + a `Host` trait | seam W; `Host` for native tests |
| `ljos_reactive` | ljos-ui (git dep, pinned rev) | Push-pull graph, Qt loop breaking | unchanged by the spike |
| value/layout/states/anim crates | ljos-ui | A5 | each behind a numbers-only export set, as seam W |

**DECISION:** the kernel is chosen at *build time* through
`packages/runtime/package.json`'s `imports` (`"#kernel"`, condition
`ljos-wasm-kernel`; Vite's `resolve.conditions` from
`LJOS_KERNEL=wasm`). No runtime branch on the hot path beyond a
constant, both kernels testable from one tree, and the Solid one is
deleted when the `@web` ledger holds the same scenarios on the wasm
one (milestone W10).

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
| Compiler in the page (A15), fetched on a page's first compile only | ≤ 1,200 kB gzip wasm, ≤ 5 kB gzip JS | W9.1: 3,717,395 B raw / 1,085,222 B gzip wasm (`opt-level="z"`); 4,061 B gzip JS as written. A page that does not compile: unchanged, byte for byte |
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
registered **blocks** by name. A block is a QML type the site
registers (`registerBlock("Basket", Basket)`): it publishes state as
properties and takes actions as invokable methods/signals. A shell
may lay blocks out with QtQuick items, bind their properties to each
other and wire their signals to their actions — nothing else.
**DECISION:** the block model is ljos-studio's (ljos-ui's studio
track) and its naming is taken when the Ljós lead relays it; until
then `block` / `registerBlock` / `publishes` / `actions` are working
names behind one module (`packages/runtime/shell/`).

**Pipeline.**

```text
 build: vite qml({ liveShell: true })   (default false; or LJOS_LIVE_SHELL=1)
   └▶ emits shell/compiler.wasm as a lazy chunk; the page bundle is unchanged
 page:  <ljos-shell-drop> (drag-and-drop zone + file picker)
   1. visitor drops Shell.qml
   2. import("ljos-web/shell") → instantiate compiler.wasm  (first use only)
   3. compile(text, blockTable) → { ir, diagnostics }      (in a worker)
   4. errors → inline panel over the old shell; the page keeps running
   5. ok → mount(ir) beside the old root; carry state; swap; dispose old
   6. localStorage["ljos-shell:" + site] = text  (until "Reset" clears it)
   7. site.publish?.(text, meta)  — only if the site gave a hook
```

- **The compiler** is `qml_syntax` + `qml_front` + the shell-mode
  backend, built for wasm32. **DECISION:** a shell compiles to
  `ljos_ir` (tier-1 bytecode, ARCHITECTURE.md §5), **not to JS**. A
  tier-1 program can only do what its ops can: resolved reads and
  writes, arithmetic and comparison with JS coercion, template
  strings, pure builtins (`Math.*`, `qsTr`, `Qt.rgba/point/size/rect`),
  calls of what it resolved. An expression outside that subset is a
  compile error in shell mode, never a fallback to `eval`. This is the
  same IR iOS runs changes as (goal 9), so the evaluator is shared,
  not written for the web — which puts it behind the `ljos_meta` split
  (section 13 item 2) too.
- **Mounting IR**: a small tier-1 evaluator in the kernel wasm turns
  each binding into a graph binding (seam K) and each object into a
  `defineType` instance of a *registered* block or a QtQuick item from
  an allow-list. Solid renders it like compiled QML.
- **Carrying state.** Blocks are owned by the site, not the shell:
  swapping a shell re-parents the same block instances where the new
  shell names them, so their state survives by construction. Plain
  items' state is carried by `objectName`/`id` match for writable
  properties that are not bound in the new shell; anything else
  starts fresh. **DECISION:** blocks are singletons per page by
  default (a shell may name each at most once), which makes "keep
  state where it can" exact for what matters.
- **Errors inline.** Diagnostics carry the shell's line/column (the
  compiler's own spans) and render in a panel the drop component
  owns; a runtime error in a shell binding is warned and that binding
  keeps its old value, as everywhere in QML.
- **Publish hook.** The site may pass
  `publish(text: string, meta: { blocks: string[], hash: string }) =>
  Promise<{ url?: string }>`; ljos-web calls it when the visitor
  presses Publish and shows its result or error. Endpoint, auth and
  storage are the site's.

**Security: a shell has no more power than the site's blocks.**

1. *No code but IR.* The shell never becomes JavaScript: no `eval`,
   no `Function`, no `import()`, no Blob URLs, no `<script>`. CSP
   `script-src` needs no `unsafe-eval` for this feature.
2. *Closed scope.* Names resolve at compile time against: the shell's
   own ids and properties, the block table, the QtQuick allow-list,
   and pure builtins. There is no global object, no `window`, no
   `document`, no `Qt.openUrlExternally`, no `XMLHttpRequest`, no
   `Qt.createQmlObject`, no `Loader.source` with a URL, no
   `import` of anything but `QtQuick` and the site's block module.
3. *No reflective escape.* Tier-1 has no computed member access on
   host objects and no prototype chain: `x["constructor"]` does not
   exist as an op.
4. *Network only through blocks.* `Image.source` and the like accept
   only URLs a block gives (a block property of url type), never
   literals from the shell. A block that offers network does so with
   its own checks.
5. *Bounded work.* The evaluator has the engine's interrupt budget;
   a shell binding that runs away is stopped and warned, never hangs
   the page.
6. *Storage scoped.* Only the shell text is stored, under a key
   derived from the site's id; reset deletes it.

**DECISION:** only the shell text is persisted and published — never
compiled IR — so a stored shell is recompiled (and rechecked) by the
compiler the page ships today.

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
9. Block naming deferred to ljos-studio; working names behind one module (A9).
10. Shells compile to tier-1 IR, never JS (A9).
11. Blocks are per-page singletons; shells re-parent them (A9).
12. Only shell text is stored/published (A9).
13. A graph evaluation owns what it makes, ended after the next one (A4).
14. The module list is a committed file kept equal to the package by a test, not derived where it is read (A12).
15. A reload remakes the tree and carries state onto it; `Component.onCompleted` runs again (A13).
16. Same text is the same compiled declaration; an edited one wins over a run-time value (A13).
17. Only a root mounted `reloadable` records its tree; on by itself in a dev server (A13).
18. `reload(root, Component)` knows no build tool; Vite and the live drop both call it (A13).
19. The compiler in the page is `qmlc`'s, with the full type table; compiled files link as blob modules over stand-ins (A15).

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
as the project's root; Qt is needed only when the site imports the
controls, and Ljos.Design's QML is given with `--with`. A site it
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
// { component, module, warnings } or { diagnostics: [{ file, line, column, message }] }
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
1,200 kB gzip for the wasm and 5 kB for its JS: what it is, with room
for Qt's table to grow, so that what would add to it (another parser,
a table twice) is seen when it comes. `opt-level = "z"` (its own
profile, `compiler`): 1,084 kB gzip against 1,251 kB at "s" and
1,366 kB at 2; a compile runs once per edit, off any frame's path.

**DECISION: how compiled modules link.** Each compiled file becomes a
module at a blob URL with its specifiers rewritten.

- An import map cannot be added to once a page has loaded a module,
  and a registry the runtime gave would make compiled QML other code
  than `qmlc`'s.
- A project's files import each other in cycles, and a file may import
  itself (a component that names its own file). A blob URL is made
  from a finished text, so two files cannot name each other's. So each
  file also has a **stand-in**: a module with no imports that exports
  the file's names as bindings, set once the file has run. Files import
  each other's stand-ins; the linker runs them in the order they import
  each other (cycles aside) and sets each stand-in before the next
  runs, so what a file does as it runs (`Object.setPrototypeOf(Panel,
  Base)`) has the files before it.
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

**And A9.** A9's live shell compiles to tier-1 IR, never to JS, so a
dropped shell has no more power than the site's blocks. This compiler
is the other one: a program that compiles its own QML (its author's,
not a visitor's) and wants exactly what `qmlc` makes of it. It uses
blob URLs, so a page with a CSP needs `script-src blob:` for it, and
it is not the shell drop's security model. The drop can load the same
wasm the same lazy way, with a tier-1 back end in place of the JS one.

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
warns of it as the object is made; and nothing draws a picture of a
mounted root (no screenshot).

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
