// Whether this page can run WebAssembly, found out by running some: a
// browser may name `WebAssembly` and still refuse to compile it (Safari's
// Lockdown Mode, an enterprise policy, a `script-src` without
// `'wasm-unsafe-eval'`), so the check compiles and calls a module of a few
// bytes rather than trusting the name, and never reads the user agent.
// What runs Rust compiled to wasm asks this first: the compiler of live
// code blocks and dropped shells (`compiler/link.js`,
// `Ljos/Blocks/shell-worker.js`, `codeblocks/live.js`), and the opt-in
// wasm kernel (`kernel/checked.js`). Rendering never needs it: that is
// Solid's, into the DOM.
//
// (module (func (export "f") (result i32) i32.const 42))
const PROBE = [
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // magic, version
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f, // type: () -> i32
  0x03, 0x02, 0x01, 0x00, // function 0 is of that type
  0x07, 0x05, 0x01, 0x01, 0x66, 0x00, 0x00, // export it as "f"
  0x0a, 0x06, 0x01, 0x04, 0x00, 0x41, 0x2a, 0x0b, // i32.const 42
];

function check() {
  try {
    if (typeof WebAssembly !== "object" || WebAssembly === null) return false;
    const bytes = new Uint8Array(PROBE);
    if (!WebAssembly.validate(bytes)) return false;
    // A synchronous compile of a module this small is allowed everywhere.
    return new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports.f() === 42;
  } catch {
    return false;
  }
}

let answer;
// The answer stays the page's: what can run WebAssembly does not stop.
export const wasmWorks = () => (answer ??= check());

// What a live block or a dropped shell says where there is no WebAssembly:
// there is no compiler in the page without it, and what the build
// prerendered stays as it was written.
export const NEEDS_WASM = "Live editing needs WebAssembly, which this browser does not run; what is shown is the example as it was built.";
