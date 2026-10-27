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
- **No parser in the shipped page**: QML is compiled ahead of time,
  as ljos-web already does; the wasm is the application's logic,
  never an interpreter for QML.

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
and its directory on save (`hotUpdate`). Two more cases:

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
