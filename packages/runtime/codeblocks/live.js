// A live code block in a page (`ljos-web/codeblock`): the code beside
// its running result, as an editor. The static figure the build wrote
// (code + the result prerendered, `renderStatic` in build.js) hydrates
// where it stands — the first making takes the prerendered nodes over
// (`hydrate` of `ljos-web/object`, as a prerendered page's does) — and
// every edit is compiled in the page (`ljos-web/compiler`) and put
// over the running one with its state kept (`ljos-web/reload`): a
// counter at 3 stays 3 when its colour changes. An edit that does not
// compile says why beside the code, and the last good result keeps
// running.
//
// Nothing is fetched or compiled before a block is mounted, and
// `hydrateLiveCodeBlocks` mounts only blocks near the viewport: a long
// page costs the blocks on it only as its reader reaches them, and an
// idle page costs nothing. The editor is a plain textarea under a
// label, so the keyboard and a screen reader reach it as they reach
// any text field.
import { exampleFiles } from "./parse.js";

// A page may compile with modules of its own (the styles of Qt Quick
// Controls, say): `options.compile` is then `createCompiler({...})`'s
// compile from `ljos-web/compiler`. By default the page's own compiler
// is loaded on the first compile, as it is everywhere.
async function compilerOf(options) {
  if (options.compile) return options.compile;
  const { compile } = await import("../compiler/index.js");
  return compile;
}

const el = (tag, className, text) => {
  const made = document.createElement(tag);
  if (className) made.className = className;
  if (text !== undefined) made.textContent = text;
  return made;
};

// Turns one static figure into the editor + running result. `data` is
// the figure's payload (`{ entry, before, harness?, display,
// prerendered }` as build.js wrote it). Answers `{ dispose, idle }`:
// `idle()` settles when the compile an edit set off has landed.
export async function mountLiveCodeBlock(figure, data, options = {}) {
  const [{ hydrate, mount }, { reload }] = await Promise.all([import("../object.js"), import("../reload.js")]);
  const compile = await compilerOf(options);
  const delay = options.delay ?? 300;
  const original = data.display.map((file) => file.code);

  const head = el("div", "ljos-codeblock__head");
  const tabs = el("div", "ljos-codeblock__tabs");
  if (data.before) tabs.append(el("span", "ljos-codeblock__before", "Before"));
  const reset = el("button", "ljos-codeblock__reset", "Reset");
  reset.type = "button";
  const status = el("span", "ljos-codeblock__status");
  status.setAttribute("role", "status");
  head.append(tabs, reset, status);

  const editors = el("div", "ljos-codeblock__editors");
  const areas = data.display.map((file, i) => {
    const area = el("textarea", "ljos-codeblock__editor");
    area.value = file.code;
    area.rows = Math.min(28, Math.max(3, file.code.split("\n").length));
    area.spellcheck = false;
    area.autocapitalize = "off";
    area.setAttribute(
      "aria-label",
      data.harness && file.name === (data.harnessFile ?? data.entry)
        ? `Edit the snippet, shown in the ${data.harness} harness (${file.name})`
        : `Edit ${file.name}`,
    );
    area.dataset.file = file.name;
    area.hidden = i !== 0;
    editors.append(area);
    return area;
  });
  const buttons = data.display.map((file, i) => {
    const button = el("button", "ljos-codeblock__tab", file.name);
    button.type = "button";
    button.setAttribute("aria-pressed", String(i === 0));
    button.addEventListener("click", () => show(i));
    tabs.append(button);
    return button;
  });
  const show = (at) => {
    areas.forEach((area, i) => (area.hidden = i !== at));
    buttons.forEach((button, i) => button.setAttribute("aria-pressed", String(i === at)));
    areas[at].focus();
  };
  if (data.display.length === 1) tabs.querySelector(".ljos-codeblock__tab")?.replaceWith(el("span", "ljos-codeblock__file", data.display[0].name));

  // The stage the build wrote, with the prerendered result in it: its
  // nodes move into the host hydration takes over, themselves.
  const stage = figure.querySelector(".ljos-codeblock__stage") ?? el("div", "ljos-codeblock__stage");
  const host = el("div", "ljos-codeblock__host");
  host.append(...stage.childNodes);
  stage.append(host);

  const body = el("div", "ljos-codeblock__body");
  body.append(editors, stage);
  const errors = el("div", "ljos-codeblock__errors");
  errors.setAttribute("role", "alert");
  errors.hidden = true;
  figure.replaceChildren(head, body, errors);
  figure.dataset.state = "loading";

  let handle = null;
  let turn = 0;
  let timer = 0;
  let pending = Promise.resolve();

  const said = (lines) => {
    errors.textContent = lines.join("\n");
    errors.hidden = lines.length === 0;
  };

  const current = () => ({
    ...data,
    display: data.display.map((file, i) => ({ ...file, code: areas[i].value })),
  });

  async function apply() {
    const mine = ++turn;
    status.textContent = "Compiling…";
    const { entry, files } = exampleFiles(current());
    const made = await compile({ files, entry }).catch((error) => ({
      diagnostics: [{ file: entry, message: error?.message ?? String(error) }],
    }));
    if (mine !== turn) return;
    if (made.diagnostics) {
      said(made.diagnostics.map((d) => (d.line ? `${d.file ?? entry}:${d.line}:${d.column ?? 1}: ${d.message}` : `${d.file ?? entry}: ${d.message}`)));
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
      said([`${entry}: ${error?.message ?? error}`]);
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
    said([]);
    status.textContent = "";
    figure.dataset.state = "live";
  }

  const edited = () => {
    clearTimeout(timer);
    timer = setTimeout(() => (pending = apply()), delay);
  };
  for (const area of areas) {
    area.addEventListener("input", edited);
    // Tab indents, as in an editor — but never traps: Shift+Tab always
    // leaves, and Escape turns capture off until the field is entered
    // again, so the next Tab leaves too. The field's hint says so.
    let escaped = false;
    area.setAttribute("aria-description", "Tab indents. Press Escape, then Tab, to leave this editor.");
    area.addEventListener("focus", () => (escaped = false));
    area.addEventListener("keydown", (event) => {
      if (event.key === "Escape") return void (escaped = true);
      if (event.key !== "Tab" || event.shiftKey || escaped) return;
      event.preventDefault();
      area.setRangeText("    ", area.selectionStart, area.selectionEnd, "end");
      edited();
    });
  }
  reset.addEventListener("click", () => {
    areas.forEach((area, i) => (area.value = original[i]));
    pending = apply();
  });

  pending = apply();
  return {
    idle: () => pending,
    dispose: () => {
      turn++;
      clearTimeout(timer);
      handle?.root?.dispose?.();
    },
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
