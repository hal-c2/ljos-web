# wasm-counter

The first spike of ljos-web (`../../docs/LJOS_WEB.md`): a `Counter`
written in Rust (`src/lib.rs`), compiled to WebAssembly with
wasm-bindgen, and used from QML (`qml/Main.qml`) as any other type —
a `Text` bound to its `count`, a `MouseArea` calling its
`increment()`, handlers for `countChanged` and for `bumped(value)`.

`types/Example/Counter.qml` is the type entry the compiler is told
of; `web/Counter.js` is the type at run time, the wasm struct's face
to the runtime's object kernel, written by hand as a macro would
generate it.

Run it (builds the wasm, bundles with Vite, clicks in a headless
browser):

```sh
mise run test:wasm-counter
```

Look at it: build as above, then serve the example with Vite
(`pnpm --filter ljos-web-example-wasm-counter dev`) and open the
address it prints.
