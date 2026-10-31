// A live shell (docs/LJOS_WEB.md A9): a page whose visitors may drop a
// shell of their own over the site's blocks, see it at once, keep it, and
// go back to the site's. The site builds with `qml({ liveShell: true })`;
// a site that does not has none of this and fetches nothing of it.
//
// What a visitor drops is not trusted. It is compiled, in a worker, by the
// page's compiler in its shell mode (`ljos_web::shell`), which resolves each
// name the shell writes against a closed scope and gives data, not code;
// `shell.js` runs that. The blocks are the site's and keep their state, as
// the plain items of the shell keep theirs when the new one has them by
// the same id or objectName (`reload.js`).
//
// The shell is kept for this visitor, in their browser, under the site's
// name; Reset forgets it. `publish`, when the site gives one, is told the
// shell and what it uses: where it goes is the site's to say.
import { mount, settle } from "../../object.js";
import { reload } from "../../reload.js";
import { setMarkupInert } from "../../QtQuick/richtext.js";

let worker;
let asked = 0;
const waiting = new Map();

// The compiler, fetched on the first drop.
function compile(request) {
  if (!worker) {
    worker = new Worker(new URL("./shell-worker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data: { id, answer } }) => {
      waiting.get(id)?.(answer);
      waiting.delete(id);
    };
    worker.onerror = (event) => {
      for (const done of waiting.values()) done({ diagnostics: [{ message: `the compiler could not be loaded: ${event.message ?? "worker failed"}` }] });
      waiting.clear();
      worker = undefined;
    };
  }
  const id = ++asked;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    worker.postMessage({ id, request });
  });
}

async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function element(tag, attributes = {}, text) {
  const made = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) made.setAttribute(name, value);
  if (text !== undefined) made.textContent = text;
  return made;
}

// Shows `Entry` (the site's shell, compiled with the page) in `element`
// and lets a visitor drop another. `options`: `site`, the name the shell is
// kept under (the build's, else the page's path); `publish(text, meta)`, a
// function that answers `{ url }` or throws; `storage`, where the shell is
// kept (`localStorage`); `file`, what a shell is called where its errors
// are said. Answers `{ object, drop(text), reset(), publish(), idle() }`.
export function liveShell(Entry, element_, options = {}) {
  const live = Entry.$live ?? { site: undefined, blocks: [] };
  const site = options.site ?? live.site ?? location.pathname;
  const key = `ljos-shell:${site}`;
  const storage = options.storage ?? globalThis.localStorage;
  const file = options.file ?? "Shell.qml";
  const blocks = live.blocks;

  const region = element("div", { class: "ljos-live", role: "region", "aria-label": "Shell" });
  const bar = element("div", { class: "ljos-live-bar" });
  const open = element("button", { type: "button", class: "ljos-live-open" }, "Open a shell…");
  const picker = element("input", { type: "file", accept: ".qml,text/plain", "aria-label": "Shell file", tabindex: "-1" });
  picker.hidden = true;
  const reset = element("button", { type: "button", class: "ljos-live-reset" }, "Reset");
  const share = options.publish ? element("button", { type: "button", class: "ljos-live-publish" }, "Publish") : null;
  const status = element("span", { class: "ljos-live-status", role: "status", "aria-live": "polite" });
  bar.append(open, picker, reset, ...(share ? [share] : []), status);
  const stage = element("div", { class: "ljos-live-stage" });
  const host = element("div", { class: "ljos-live-host" });
  const errors = element("div", { class: "ljos-live-errors", role: "alert" });
  errors.hidden = true;
  stage.append(host, errors);
  region.append(bar, stage);
  element_.append(region);
  Object.assign(region.style, { display: "flex", flexDirection: "column", width: "100%", height: "100%" });
  Object.assign(stage.style, { position: "relative", flex: "1", minHeight: "0" });
  Object.assign(host.style, { position: "absolute", inset: "0" });
  Object.assign(errors.style, {
    position: "absolute",
    left: "0",
    right: "0",
    top: "0",
    margin: "0",
    padding: "0.5em",
    background: "#fff4f4",
    color: "#8a1111",
    font: "12px monospace",
    whiteSpace: "pre-wrap",
    zIndex: "1",
  });

  const handle = mount(Entry, host, {}, { reloadable: true });
  let text = null;
  let used = [];
  let pending = Promise.resolve();

  const said = (lines) => {
    errors.textContent = lines.join("\n");
    errors.hidden = lines.length === 0;
  };

  const contracts = blocks.map(({ component: _, ...contract }) => contract);
  const components = Object.fromEntries(blocks.map((block) => [`${block.module}/${block.name}`, block]));

  // The site's blocks a compiled shell writes.
  const blocksOf = (compiled) => {
    const named = new Set(compiled.components[0].objects.map(({ ty }) => ty.Native && `${ty.Native.module}/${ty.Native.name}`));
    return contracts.filter(({ module, name }) => named.has(`${module}/${name}`));
  };

  // Shows the shell `given`, or says why it cannot be shown over the one
  // shown now. Answers whether it is shown.
  async function show(given) {
    const answer = await compile({ shell: { text: given, blocks: contracts } });
    if (answer.diagnostics) {
      said(answer.diagnostics.map(({ line, column, message }) => (line ? `${file}:${line}:${column}: ${message}` : `${file}: ${message}`)));
      return false;
    }
    try {
      const { shellOf } = await import("./shell.js");
      // Before the shell is made, so nothing of it is ever live.
      setMarkupInert(true);
      reload(handle, shellOf(answer.shell, components, file));
    } catch (error) {
      setMarkupInert(text != null);
      said([`${file}: ${error?.message ?? error}`]);
      return false;
    }
    said([]);
    text = given;
    used = blocksOf(answer.shell);
    settle();
    return true;
  }

  const queue = (work) => (pending = pending.then(work, work));

  function drop(given) {
    return queue(async () => {
      if (await show(given)) {
        try {
          storage?.setItem(key, given);
        } catch {
          // A browser that keeps nothing still shows it.
        }
        status.textContent = "Your shell is shown";
      }
    });
  }

  function forget() {
    return queue(async () => {
      try {
        storage?.removeItem(key);
      } catch {
        // Nothing was kept.
      }
      reload(handle, Entry);
      setMarkupInert(false);
      text = null;
      used = [];
      said([]);
      settle();
      status.textContent = "The site's shell is shown";
    });
  }

  function publishing() {
    return queue(async () => {
      if (!options.publish || text == null) return;
      try {
        const answer = await options.publish(text, {
          blocks: used.map(({ module, name, version }) => ({ module, name, version })),
          hash: await sha256(text),
        });
        said([]);
        status.textContent = answer?.url ? `Published: ${answer.url}` : "Published";
      } catch (error) {
        status.textContent = "";
        said([`Publish failed: ${error?.message ?? error}`]);
      }
    });
  }

  const read = (picked) => picked && picked.text().then(drop);
  open.addEventListener("click", () => picker.click());
  picker.addEventListener("change", () => {
    read(picker.files?.[0]);
    picker.value = "";
  });
  region.addEventListener("dragover", (event) => {
    if ([...(event.dataTransfer?.types ?? [])].includes("Files")) event.preventDefault();
  });
  region.addEventListener("drop", (event) => {
    const picked = event.dataTransfer?.files?.[0];
    if (!picked) return;
    event.preventDefault();
    read(picked);
  });
  reset.addEventListener("click", forget);
  share?.addEventListener("click", publishing);

  let stored = null;
  try {
    stored = storage?.getItem(key) ?? null;
  } catch {
    stored = null;
  }
  if (stored != null) queue(() => show(stored).then((shown) => shown && (status.textContent = "Your shell is shown")));

  return {
    get object() {
      return handle.object;
    },
    get text() {
      return text;
    },
    drop,
    reset: forget,
    publish: publishing,
    idle: () => pending,
    dispose: () => {
      handle.dispose?.();
      region.remove();
    },
  };
}
