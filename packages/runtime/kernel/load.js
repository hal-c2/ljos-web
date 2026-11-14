// The wasm kernel's module, fetched and compiled once, started by whoever
// asks first. `kernel/checked.js` asks before it imports `kernel/wasm.js`, so
// the module's bytes and the chunk that instantiates them come down at once
// rather than one after the other.
let compiled;
export const compile = () => (compiled ??= WebAssembly.compileStreaming(fetch(new URL("./ljos_web_kernel.wasm", import.meta.url))));
