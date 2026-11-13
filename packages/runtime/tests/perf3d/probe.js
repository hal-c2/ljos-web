// What the 3D perf harness puts in a page before anything of the page runs
// (`page.addInitScript(probe, options)`), and what it makes of what that is
// told. The page itself is not changed for it: a View3D's canvas has a
// `$view3d` (`QtQuick3D/wgpu.js`, `View3D.js`) whose `probe` is told of each
// sync and draw, and everything else is seen from outside, by wrapping what
// the page calls: `requestAnimationFrame`, the WebGPU and WebGL2 objects,
// and the imports and exports of each wasm module it instantiates.
//
// Frames are the browser's: one is opened by the first animation-frame
// callback of a timestamp and closed by a message posted then, which is
// handled after the frame is rendered. What was done since the last frame
// closed is the closing frame's.
//
// `count`: every GPU call and every wasm crossing is counted, by name. That
// costs time of its own, so a run that times frames does not count, and one
// that counts does not report times.
// `gpu`: each WebGPU submit is followed to when its work is done, which says
// how long the GPU had it at most (the time it waited to start included).
export function probe({ count = false, gpu = false } = {}) {
  const now = () => performance.now();
  const LIMIT = 20000;
  const fresh = () => ({ sync: 0, builds: 0, draw: 0, drawn: 0, submit: 0, submits: 0, into: 0, out: 0, bytes: 0, calls: count ? {} : null });
  let acc = fresh();
  let open = null;
  const P = (window.perf3d = {
    count,
    asked: 0,
    ran: 0,
    frames: [],
    gpu: [],
    first: { sync: null, draw: null, presented: null },
    wasm: {},
    reset() {
      P.asked = P.ran = 0;
      P.frames.length = 0;
      P.gpu.length = 0;
      for (const each of Object.values(P.wasm)) {
        each.into = each.out = 0;
        each.imports = {};
        each.exports = {};
      }
      acc = fresh();
    },
    memory() {
      const wasm = {};
      for (const [name, each] of Object.entries(P.wasm)) wasm[name] = each.memory?.buffer.byteLength ?? 0;
      return { heap: performance.memory?.usedJSHeapSize ?? null, wasm };
    },
  });

  const channel = new MessageChannel();
  const close = () => {
    const frame = open;
    open = null;
    frame.busy = now() - frame.start;
    Object.assign(frame, acc);
    acc = fresh();
    if (frame.drawn && P.first.presented === null) P.first.presented = now();
    P.frames.push(frame);
    if (P.frames.length > LIMIT) P.frames.shift();
  };
  channel.port1.onmessage = () => open && close();
  const begin = (t) => {
    if (open?.t === t) return;
    if (open) close();
    open = { t, start: now(), script: 0, callbacks: 0 };
    channel.port2.postMessage(0);
  };

  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function requestAnimationFrame(callback) {
    P.asked++;
    return raf((t) => {
      begin(t);
      P.ran++;
      open.callbacks++;
      const from = now();
      try {
        callback(t);
      } finally {
        // A callback may have closed nothing, but a nested one may have.
        if (open) open.script += now() - from;
      }
    });
  };

  const told = (phase, from, to) => {
    if (phase === "sync") {
      acc.sync += to - from;
      acc.builds++;
      P.first.sync ??= to;
    } else {
      acc.draw += to - from;
      acc.drawn++;
      P.first.draw ??= to;
    }
  };
  // The page's canvases get the probe as they get `$view3d`.
  const views = new WeakMap();
  Object.defineProperty(HTMLCanvasElement.prototype, "$view3d", {
    configurable: true,
    get() {
      return views.get(this);
    },
    set(state) {
      if (state && typeof state === "object") state.probe = told;
      views.set(this, state);
    },
  });

  // Handing a picture over is where the work of a frame goes to the GPU.
  const timed = (proto, name, after) => {
    const called = proto?.[name];
    if (typeof called !== "function") return;
    proto[name] = function (...args) {
      const from = now();
      const result = called.apply(this, args);
      acc.submit += now() - from;
      acc.submits++;
      after?.(this, from);
      return result;
    };
  };
  const followed = gpu
    ? (queue, from) =>
        queue.onSubmittedWorkDone().then(() => {
          P.gpu.push(now() - from);
          if (P.gpu.length > LIMIT) P.gpu.shift();
        })
    : null;

  if (count) {
    // How many bytes an upload carries, from whatever it was given.
    const sized = (args) => {
      for (const arg of args) {
        if (ArrayBuffer.isView(arg) || arg instanceof ArrayBuffer) return arg.byteLength;
        if (arg && typeof arg === "object" && "width" in arg && "height" in arg && !("depthOrArrayLayers" in arg)) return arg.width * arg.height * 4;
      }
      return typeof args[1] === "number" && typeof args[0] === "number" ? args[1] : 0;
    };
    // A uniform carries what a frame changed as an upload does, on WebGL2.
    const UPLOADS = /^(writeBuffer|writeTexture|copyExternalImageToTexture|bufferData|bufferSubData|texImage[23]D|texSubImage[23]D|compressedTex(Sub)?Image[23]D|uniform\w+)$/;
    const each = (proto, label) => {
      if (!proto) return;
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === "constructor") continue;
        const described = Object.getOwnPropertyDescriptor(proto, name);
        if (typeof described.value !== "function") continue;
        const called = described.value;
        const key = `${label}.${name}`;
        const upload = UPLOADS.test(name);
        proto[name] = function (...args) {
          acc.calls[key] = (acc.calls[key] ?? 0) + 1;
          if (upload) acc.bytes += sized(args);
          return called.apply(this, args);
        };
      }
    };
    each(self.GPUDevice?.prototype, "GPUDevice");
    each(self.GPUQueue?.prototype, "GPUQueue");
    each(self.GPUCommandEncoder?.prototype, "GPUCommandEncoder");
    each(self.GPURenderPassEncoder?.prototype, "GPURenderPassEncoder");
    each(self.GPUComputePassEncoder?.prototype, "GPUComputePassEncoder");
    each(self.GPURenderBundleEncoder?.prototype, "GPURenderBundleEncoder");
    each(self.GPUCanvasContext?.prototype, "GPUCanvasContext");
    each(self.GPUBuffer?.prototype, "GPUBuffer");
    each(self.GPUTexture?.prototype, "GPUTexture");
    each(self.WebGL2RenderingContext?.prototype, "WebGL2");
    each(self.ImageBitmapRenderingContext?.prototype, "ImageBitmapRenderingContext");
    each(self.OffscreenCanvas?.prototype, "OffscreenCanvas");
  }
  timed(self.GPUQueue?.prototype, "submit", followed);
  timed(self.OffscreenCanvas?.prototype, "transferToImageBitmap");
  // wgpu on WebGL2 draws on the canvas's own context and flushes it.
  timed(self.WebGL2RenderingContext?.prototype, "flush");

  // Each wasm module by what it was fetched as: its memory, and when
  // counting, every call into it and out of it. A frame's crossings are the
  // 3D renderer's only: with LJOS_KERNEL=wasm the QML kernel crosses too,
  // and that is not View3D's cost.
  const named = (url) => (/ljos_web_3d/.test(url) ? "3d" : /kernel/.test(url) ? "kernel" : /compiler/.test(url) ? "compiler" : "other");
  const plain = (name) => name.replace(/^__wbg_/, "").replace(/_[0-9a-f]{8,}$/, "");
  const record = (name) => (P.wasm[name] ??= { into: 0, out: 0, imports: {}, exports: {}, memory: null });
  const imported = (imports, name) => {
    if (!count || !imports) return imports;
    const kept = record(name);
    const wrapped = {};
    for (const [module, members] of Object.entries(imports)) {
      wrapped[module] = {};
      for (const [key, value] of Object.entries(members)) {
        if (typeof value !== "function") {
          wrapped[module][key] = value;
          continue;
        }
        const label = plain(key);
        wrapped[module][key] = function (...args) {
          if (name === "3d") acc.out++;
          kept.out++;
          kept.imports[label] = (kept.imports[label] ?? 0) + 1;
          return value.apply(this, args);
        };
      }
    }
    return wrapped;
  };
  const exported = (instance, name) => {
    const kept = record(name);
    kept.memory = Object.values(instance.exports).find((value) => value instanceof WebAssembly.Memory) ?? null;
    if (!count) return instance;
    const exports = {};
    for (const [key, value] of Object.entries(instance.exports)) {
      exports[key] =
        typeof value === "function"
          ? (...args) => {
              if (name === "3d") acc.into++;
              kept.into++;
              kept.exports[key] = (kept.exports[key] ?? 0) + 1;
              return value(...args);
            }
          : value;
    }
    // Still an Instance to whoever asks, with exports that count.
    return Object.defineProperty(Object.create(WebAssembly.Instance.prototype), "exports", { value: Object.freeze(exports) });
  };
  const streaming = WebAssembly.instantiateStreaming;
  if (streaming) {
    WebAssembly.instantiateStreaming = async function (source, imports) {
      const response = await source;
      const name = named(response.url);
      const made = await streaming.call(this, response, imported(imports, name));
      return { module: made.module, instance: exported(made.instance, name) };
    };
  }
  const instantiate = WebAssembly.instantiate;
  WebAssembly.instantiate = async function (source, imports) {
    // Bytes or a module say nothing of where they came from.
    const name = "other";
    const made = await instantiate.call(this, source, imported(imports, name));
    if (made instanceof WebAssembly.Instance) return exported(made, name);
    return { module: made.module, instance: exported(made.instance, name) };
  };
}

// The kinds of GPU work in a frame's `calls` (of a counting run).
export function kinds(calls) {
  const sum = (pattern) => Object.entries(calls ?? {}).reduce((total, [key, times]) => total + (pattern.test(key) ? times : 0), 0);
  return {
    draws: sum(/\.(draw|drawIndexed|drawIndirect|drawIndexedIndirect|drawArrays|drawElements|drawArraysInstanced|drawElementsInstanced|drawRangeElements|multiDraw\w*)$/),
    pipelines: sum(/\.(setPipeline|useProgram)$/),
    binds: sum(/\.(setBindGroup|setVertexBuffer|setIndexBuffer|bindVertexArray|bindTexture|bindBuffer|bindBufferBase|bindBufferRange)$/),
    uniforms: sum(/^WebGL2\.uniform/),
    uploads: sum(/\.(writeBuffer|writeTexture|copyExternalImageToTexture|bufferData|bufferSubData|texImage[23]D|texSubImage[23]D|compressedTex(Sub)?Image[23]D)$/),
    creates: sum(/\.(create\w+|compileShader|linkProgram)$/),
    passes: sum(/\.(beginRenderPass|beginComputePass)$/),
    framebuffers: sum(/^WebGL2\.bindFramebuffer$/),
    readbacks: sum(/\.(readPixels|mapAsync|copyTextureToBuffer)$/),
    submits: sum(/^GPUQueue\.submit$|transferToImageBitmap$|^WebGL2\.flush$/),
    calls: sum(/./),
  };
}
