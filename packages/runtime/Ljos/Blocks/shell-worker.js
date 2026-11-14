// The compiler of a live shell, apart from the page: a dropped shell is
// compiled here, to data the page runs. A page whose policy is
// `script-src 'self'` may not compile WebAssembly itself, while this
// script may be served with a policy of its own that lets it
// (`'wasm-unsafe-eval'`), and nothing it makes can reach the page but the
// answer it posts. The worker checks for WebAssembly itself, as its policy
// is not the page's.
import { NEEDS_WASM, wasmWorks } from "../../wasm-check.js";

let wasm;
// A load that failed is not kept: the next drop fetches it again.
const loaded = () =>
  (wasm ??= WebAssembly.compileStreaming(fetch(new URL("../../compiler/ljos_web_compiler.wasm", import.meta.url))).catch((error) => {
    wasm = undefined;
    throw error;
  }));
let instance;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function ask(request) {
  if (!wasmWorks()) return { diagnostics: [{ message: NEEDS_WASM }] };
  instance ??= await WebAssembly.instantiate(await loaded());
  const { memory, alloc, free, compile, answer_len } = instance.exports;
  const bytes = encoder.encode(JSON.stringify(request));
  try {
    const at = alloc(bytes.length);
    new Uint8Array(memory.buffer, at, bytes.length).set(bytes);
    const answer = compile(at, bytes.length);
    const length = answer_len();
    const text = decoder.decode(new Uint8Array(memory.buffer, answer, length));
    free(answer, length);
    return JSON.parse(text);
  } catch (error) {
    // A panic leaves the memory as it was: the next starts anew.
    instance = undefined;
    return { diagnostics: [{ message: `the compiler failed: ${error.message}` }] };
  }
}

self.onmessage = async ({ data: { id, request } }) => {
  let answer;
  try {
    answer = await ask(request);
  } catch (error) {
    answer = { diagnostics: [{ message: `the compiler could not be loaded: ${error.message}` }] };
  }
  self.postMessage({ id, answer });
};
