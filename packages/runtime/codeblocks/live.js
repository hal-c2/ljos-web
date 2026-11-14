// A live code block in a page (`ljos-web/codeblock`): the code beside
// its running result, as an editor. The static figure the build wrote
// (highlighted code + the result prerendered, `renderStatic` in
// build.js) hydrates where it stands — the first making takes the
// prerendered nodes over (`hydrate` of `ljos-web/object`, as a
// prerendered page's does) — and every edit is compiled in the page
// (`ljos-web/compiler`) and put over the running one with its state
// kept (`ljos-web/reload`): a counter at 3 stays 3 when its colour
// changes. An edit that does not compile is marked where it is wrong,
// summed up beside the code, and the last good result keeps running.
//
// Nothing is fetched or compiled before a block is mounted, and
// `hydrateLiveCodeBlocks` mounts only blocks near the viewport: a long
// page costs the blocks on it only as its reader reaches them, and an
// idle page costs nothing. The editor (CodeMirror, `editor.js`) is
// later still: the build's highlighted `<pre>` stays the code until a
// reader focuses, touches or types in it, or the page is idle, and the
// editor then takes its place in the same box, the same font and the
// same colours, so nothing on the page moves.
import { NEEDS_WASM, wasmWorks } from "../wasm-check.js";
import { displayPosition, exampleFiles, notThereLine } from "./parse.js";

// A page may compile with modules of its own (the styles of Qt Quick
// Controls, say): `options.compile` is then `createCompiler({...})`'s
// compile from `ljos-web/compiler`. By default the page's own compiler
// is loaded on the first compile, as it is everywhere.
async function compilerOf(options) {
  if (options.compile) return options.compile;
  const { compile } = await import("../compiler/index.js");
  return compile;
}

// The editor module, once for the page: every block shares it, and a
// block that asks after it is loaded is upgraded at once (a touch on
// a phone must focus the editor in the same gesture to raise the
// keyboard).
let editorModule = null;
let editorLoaded = null;
export function loadEditor() {
  editorLoaded ??= import("./editor.js").then(
    (module) => (editorModule = module),
    (error) => {
      // A load that failed (the network went) is asked for again by
      // the next reader who reaches for the code.
      editorLoaded = null;
      throw error;
    },
  );
  return editorLoaded;
}

const idle = (run) =>
  typeof requestIdleCallback === "function" ? requestIdleCallback(run, { timeout: 4000 }) : setTimeout(run, 1500);

// Each example is a project of its own files, at a root of its own that no
// server answers (`closed` in `ljos-web/compiler`): what it names by a
// relative address is among its fences and its harness, wherever its page
// is, and what it names and does not have is not there.
let examples = 0;

const el = (tag, className, text) => {
  const made = document.createElement(tag);
  if (className) made.className = className;
  if (text !== undefined) made.textContent = text;
  return made;
};

// Keys that move the caret or edit past it, which the code as it stands
// cannot follow: once one is pressed, a file holds no more typing.
const MOVES = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Delete"]);

let ids = 0;

// The character offset a point of `pre` is at, so a click that brings
// the editor in puts its caret where the reader clicked.
function offsetAt(pre, x, y) {
  const at = document.caretPositionFromPoint?.(x, y);
  const node = at?.offsetNode ?? document.caretRangeFromPoint?.(x, y)?.startContainer;
  const offset = at?.offset ?? document.caretRangeFromPoint?.(x, y)?.startOffset;
  if (!node || !pre.contains(node)) return null;
  const range = document.createRange();
  range.setStart(pre, 0);
  range.setEnd(node, offset);
  return range.toString().length;
}

// Turns one static figure into the editor + running result. `data` is
// the figure's payload (`{ entry, before, harness?, display,
// prerendered }` as build.js wrote it). Answers `{ dispose, idle,
// editors }`: `idle()` settles when the compile an edit set off has
// landed, and `editors()` when the code is in the editor.
export async function mountLiveCodeBlock(figure, data, options = {}) {
  // The compiler is Rust in wasm, and there is no other: without
  // WebAssembly the figure stays as the build wrote it, code and drawn
  // result, and says why it cannot be edited.
  if (!wasmWorks()) return staticOnly(figure, data);
  const [{ hydrate, mount }, { reload }] = await Promise.all([import("../object.js"), import("../reload.js")]);
  const compile = await compilerOf(options);
  const delay = options.delay ?? 300;
  // The code as the `<pre>` shows it, without the file's last newline
  // (a compile puts it back): an editor holding it would be a line
  // taller than the code it takes the place of.
  const original = data.display.map((file) => file.code.replace(/\n$/, ""));
  const texts = [...original];

  // The figure as the build wrote it stays: its head gains Reset and a
  // status, each file's highlighted code becomes its editor in place.
  const head = figure.querySelector(".ljos-codeblock__head") ?? el("div", "ljos-codeblock__head");
  const reset = el("button", "ljos-codeblock__reset", "Reset");
  reset.type = "button";
  const status = el("span", "ljos-codeblock__status");
  status.setAttribute("role", "status");
  head.append(reset, status);

  const code = figure.querySelector(".ljos-codeblock__code") ?? el("div", "ljos-codeblock__code");
  const errors = el("div", "ljos-codeblock__errors");
  errors.id = `ljos-codeblock-errors-${++ids}`;
  errors.setAttribute("role", "alert");
  errors.hidden = true;

  const labelOf = (file) =>
    data.harness && file.name === (data.harnessFile ?? data.entry)
      ? `Edit the snippet, shown in the ${data.harness} harness (${file.name})`
      : `Edit ${file.name}`;
  const hint = "Tab indents. Press Escape, then Tab, to leave this editor.";

  // Each file's surface: the build's `<pre>`, focusable and named as
  // the editor it becomes, until the editor is in.
  const sources = data.display.map((file) => {
    const source = sourceOf(code, file);
    const pre = source.querySelector("pre");
    pre.tabIndex = 0;
    pre.setAttribute("role", "textbox");
    pre.setAttribute("aria-multiline", "true");
    pre.setAttribute("aria-label", labelOf(file));
    pre.setAttribute("aria-description", hint);
    return { source, pre };
  });

  const stage = figure.querySelector(".ljos-codeblock__stage") ?? el("div", "ljos-codeblock__stage");
  const host = el("div", "ljos-codeblock__host");
  host.append(...stage.childNodes);
  stage.append(host);
  if (!figure.contains(code) || !figure.contains(stage)) {
    const body = el("div", "ljos-codeblock__body");
    body.append(code, stage);
    figure.replaceChildren(head, body);
  }
  figure.append(errors);
  figure.querySelector("script[data-ljos-codeblock-data]")?.remove();
  figure.dataset.state = "loading";

  let handle = null;
  let turn = 0;
  let timer = 0;
  let pending = Promise.resolve();
  let disposed = false;
  // Each file's CodeMirror, once it is in; and the marks each file
  // carries now, for an editor that comes in after they were made.
  const editors = [];
  let marks = data.display.map(() => []);
  const root = `ljos-example://${++examples}/`;

  // What the compile said, and the files the running example asked for
  // that it does not have, as they are asked for.
  let faults = [];
  let absent = [];
  const shown = () => {
    const lines = [...faults, ...absent];
    errors.textContent = lines.join("\n");
    errors.hidden = lines.length === 0;
  };
  const said = (lines) => {
    faults = lines;
    shown();
  };
  const missing = (name, url) => {
    absent = [...absent, notThereLine(current().display, root, name, url)];
    shown();
  };

  // What the block's compiles gave the page (its files, the addresses
  // they are loaded from, the text its files read) goes with it.
  const releaseProject = () =>
    Promise.all([import("../guard.js"), import("../files.js")]).then(([{ release }, { withdraw }]) => {
      for (const url of release(root, missing)) withdraw(url);
    });
  // Compiles on their way: one that is linking still needs its files to
  // be the example's, so the last of them to land lets them go, and
  // settles what `idle()` answered at dispose.
  let compiling = 0;
  let letGo = null;

  const current = () => ({ ...data, display: data.display.map((file, i) => ({ ...file, code: texts[i] })) });

  const edited = () => {
    clearTimeout(timer);
    timer = setTimeout(() => (pending = apply()), delay);
  };

  // The editors take the surfaces' places, every file of the block at
  // once. A surface the reader is in hands its focus (and the caret
  // where they clicked) to its editor; one they have left keeps none.
  let ready = null;
  // What the reader did while the editor was on its way, which it
  // takes as if it had been there. `wanted` is the file they last
  // pressed in, which gets the focus if they are still there. Each
  // file keeps what was done in it: where the press put the caret, the
  // characters, Enters and Backspaces typed there (`back` the ones
  // that reach before the caret), and whether the reader did what the
  // code cannot hold (an arrow, Delete, a second press after typing),
  // after which nothing more is held for that file: what is held
  // stays as typed, and nothing lands where the reader did not mean.
  let wanted = null;
  const held = data.display.map(() => ({ at: null, text: "", back: 0, closed: false }));
  const upgrade = () => {
    if (disposed || editors.length) return;
    const { createCodeEditor } = editorModule;
    data.display.forEach((file, i) => {
      const { source, pre } = sources[i];
      const box = el("div", "ljos-codeblock__editor");
      box.dataset.file = file.name;
      const focused = document.activeElement === pre;
      const editor = createCodeEditor(box, {
        doc: texts[i],
        lang: file.name.includes(".") ? file.name : file.lang,
        label: labelOf(file),
        description: hint,
        errors: errors.id,
        onChange(text) {
          texts[i] = text;
          edited();
        },
      });
      pre.replaceWith(box);
      source.dataset.editor = "codemirror";
      editors[i] = editor;
      if (marks[i].length) editor.setDiagnostics(marks[i]);
      const { at, text, back } = held[i];
      const { view } = editor;
      if (at !== null && at !== undefined) view.dispatch({ selection: { anchor: Math.min(at, view.state.doc.length) } });
      if (text || back) {
        const head = view.state.selection.main.head;
        const from = Math.max(0, head - back);
        view.dispatch({ changes: { from, to: head, insert: text }, selection: { anchor: from + text.length } });
      }
      if (focused || wanted?.index === i) editor.focus();
    });
    wanted = null;
    figure.dataset.editor = "ready";
  };
  const bringIn = () => {
    if (editorModule) return upgrade();
    ready ??= loadEditor().then(() => {
      // A press counts where the reader still is; one they have left
      // (a press, then Tab away) places nothing.
      if (wanted && document.activeElement !== sources[wanted.index].pre) wanted = null;
      upgrade();
    }, () => {
      // The code stays as the build wrote it, readable and running;
      // the next focus, press or key asks for the editor again.
      ready = null;
    });
  };
  sources.forEach(({ pre }, index) => {
    pre.addEventListener("focus", () => bringIn());
    pre.addEventListener("keydown", (event) => {
      // The code as it stands takes no typing: what the reader types is
      // held for the editor, the key that brings it in too.
      const here = held[index];
      const { key } = event;
      const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
      if (!here.closed && plain && ([...key].length === 1 || key === "Enter" || key === "Backspace")) {
        event.preventDefault();
        if (key !== "Backspace") here.text += key === "Enter" ? "\n" : key;
        else if (here.text) here.text = [...here.text].slice(0, -1).join("");
        else here.back++;
      } else if (MOVES.has(key)) here.closed = true;
      bringIn();
    });
    pre.addEventListener("pointerdown", (event) => {
      const here = held[index];
      if (here.text || here.back) here.closed = true;
      else here.at = offsetAt(pre, event.clientX, event.clientY);
      wanted = { index };
      // Same gesture: the editor is in before the browser places
      // focus, so the caret (and a phone's keyboard) land in it.
      if (editorModule) event.preventDefault();
      bringIn();
    });
  });

  // The compiler's words, each moved to the file and place the reader
  // sees, marked in that file's editor and summed up under the block.
  const diagnose = (diagnostics) => {
    const example = current();
    marks = data.display.map(() => []);
    const lines = diagnostics.map((d) => {
      const at = displayPosition(example, d);
      if (at.index >= 0) marks[at.index].push({ ...d, ...at });
      const name = at.index >= 0 ? data.display[at.index].name : d.file ?? data.entry;
      const where = at.index >= 0 && at.line ? at : d;
      return where.line ? `${name}:${where.line}:${where.column ?? 1}: ${d.message}` : `${name}: ${d.message}`;
    });
    editors.forEach((editor, i) => editor.setDiagnostics(marks[i]));
    said(lines);
  };

  async function apply() {
    const mine = ++turn;
    status.textContent = "Compiling…";
    const { entry, files } = exampleFiles(current());
    // What the last project was told goes when this compile gives the
    // example its files, before its scripts run: a compile that fails
    // sooner keeps the example running as it was, and what it said.
    const enclosed = () => {
      absent = [];
      shown();
    };
    compiling++;
    const made = await compile({ files, entry, base: root, closed: true, missing, enclosed }).catch((error) => ({
      diagnostics: [{ file: entry, message: error?.message ?? String(error) }],
    }));
    compiling--;
    if (mine !== turn) {
      if (disposed && compiling === 0) letGo?.(releaseProject());
      return;
    }
    if (made.diagnostics) {
      diagnose(made.diagnostics);
      status.textContent = handle ? "" : "This code does not compile; what it drew as written is still shown.";
      if (!handle) figure.dataset.state = "error";
      return;
    }
    try {
      if (handle) reload(handle, made.component);
      // First making over a prerendered stage takes its nodes over
      // (hydrate is mount where there are none); edits reload after.
      else handle = (data.prerendered ? hydrate : mount)(made.component, host, {}, { reloadable: true });
    } catch (error) {
      diagnose([{ file: entry, message: error?.message ?? String(error) }]);
      status.textContent = "";
      return;
    }
    const { width, height } = handle.object ?? {};
    if (width > 0 && height > 0) {
      // The host is the runtime's scene element: pointer delivery is
      // worked out against it, so it takes the root's size, as the
      // stage (which keeps the page from moving) already has.
      host.style.cssText = `width:${Math.round(width)}px;height:${Math.round(height)}px`;
      stage.style.cssText = `width:${Math.round(width)}px;height:${Math.round(height)}px`;
    }
    diagnose([]);
    status.textContent = "";
    figure.dataset.state = "live";
  }

  reset.addEventListener("click", () => {
    // What was held for an editor still on its way goes too: Reset is
    // the code as the page wrote it.
    for (const here of held) Object.assign(here, { at: null, text: "", back: 0, closed: false });
    texts.splice(0, texts.length, ...original);
    editors.forEach((editor, i) => editor.setText(original[i]));
    pending = apply();
  });

  pending = apply();
  // The editor comes in when the page has nothing better to do, so a
  // reader who reaches for the code mostly finds it already there.
  if (options.editor !== "on-demand") pending.then(() => idle(() => bringIn()));
  return {
    idle: () => pending,
    editors: async () => {
      bringIn();
      await loadEditor();
      upgrade();
      return editors;
    },
    dispose: () => {
      // Disposed once: a second dispose would take the place of what the
      // first had `idle()` answer, which a compile landing then settles.
      if (disposed) return;
      disposed = true;
      turn++;
      clearTimeout(timer);
      editors.forEach((editor) => editor.destroy());
      handle?.root?.dispose?.();
      // `idle()` settles once the files are gone, which for a compile on
      // its way is when the last of them lands.
      pending = compiling === 0 ? releaseProject() : new Promise((resolve) => (letGo = resolve));
    },
  };
}

// A file's code as the build writes it, `<pre>` in its source; made
// where the figure came without it.
function sourceOf(code, file) {
  const found = [...code.querySelectorAll(".ljos-codeblock__source")].find((s) => s.dataset.file === file.name);
  if (found) return found;
  const source = el("div", "ljos-codeblock__source");
  source.dataset.file = file.name;
  const pre = el("pre", "ljos-code");
  pre.append(el("code", `language-${file.lang}`, file.code.replace(/\n$/, "")));
  source.append(pre);
  code.append(source);
  return source;
}

function staticOnly(figure, data) {
  // A figure made without the build's code (one a page mounts itself)
  // is given it, as an editor would have been: the code is never lost
  // for want of WebAssembly.
  const code = figure.querySelector(".ljos-codeblock__code") ?? el("div", "ljos-codeblock__code");
  for (const file of data?.display ?? []) sourceOf(code, file);
  if (!figure.contains(code)) figure.append(code);
  const note = el("p", "ljos-codeblock__note", NEEDS_WASM);
  note.setAttribute("role", "note");
  const head = figure.querySelector(".ljos-codeblock__head");
  if (head) head.after(note);
  else figure.prepend(note);
  figure.dataset.state = "needs-wasm";
  return {
    idle: async () => {},
    editors: async () => [],
    dispose: () => note.remove(),
  };
}

// The payload a figure was written with, or null where there is none.
export function payloadOf(figure) {
  const script = figure.querySelector("script[data-ljos-codeblock-data]");
  if (!script) return null;
  try {
    return JSON.parse(script.textContent);
  } catch {
    return null;
  }
}

// Hydrates every `[data-ljos-codeblock]` figure under `root`, each only
// as it nears the viewport. A figure whose payload does not read is
// left as the build wrote it: code and its prerender, never a hole.
// `options.editor: "on-demand"` keeps the editor out until a reader
// reaches for the code (no idle load).
export function hydrateLiveCodeBlocks(root = document, options = {}) {
  const figures = [...root.querySelectorAll("[data-ljos-codeblock]")];
  const mounted = new Map();
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        io.unobserve(entry.target);
        const data = payloadOf(entry.target);
        if (data) mounted.set(entry.target, mountLiveCodeBlock(entry.target, data, options));
      }
    },
    { rootMargin: options.rootMargin ?? "200px" },
  );
  for (const figure of figures) io.observe(figure);
  return { figures, mounted, observer: io };
}
