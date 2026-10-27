// `?example=<id>` renders that example's entry file in a stage the size of
// its window; with no parameter every example is listed.
//
// What became of the example is on `window.gallery` (`status` is "loading",
// then "rendered" or "failed", with the `error`) for whoever drives the page,
// and `busy()` is how many files the scene still waits for.
import "ljos-web/runtime.css";
import { busy, mount } from "ljos-web/object";
import examples from "virtual:examples";

const stage = document.getElementById("stage");
const about = document.getElementById("about");
const element = (tag, properties = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), properties);
  node.append(...children);
  return node;
};

function list() {
  stage.remove();
  document.title = "Qt's examples on the web";
  const rows = examples.map((example) =>
    element("tr", {}, [
      element("td", {}, [element("a", { href: `?example=${encodeURIComponent(example.id)}`, textContent: example.id })]),
      element("td", { textContent: `${example.dir}/${example.entry}` }),
      element("td", { textContent: `${example.window.width}x${example.window.height}` }),
      element("td", {}, example.reference ? [element("img", { src: example.reference, loading: "lazy" })] : [
        element("span", { className: "no", textContent: example.qt.reason ?? "no reference picture" }),
      ]),
    ]),
  );
  about.append(
    element("table", {}, [
      element("tr", {}, ["example", "entry", "window", "what Qt renders"].map((textContent) => element("th", { textContent }))),
      ...rows,
    ]),
  );
}

async function show(example) {
  const state = (window.gallery = { id: example.id, status: "loading", error: null, busy });
  const fail = (error) => {
    state.status = "failed";
    state.error ??= String(error?.message ?? error);
    state.stack ??= error?.stack ?? null;
    about.querySelector("pre").textContent = state.error;
  };
  document.title = example.id;
  stage.style.width = `${example.window.width}px`;
  stage.style.height = `${example.window.height}px`;
  about.append(
    element("p", {}, [element("a", { href: "./", textContent: "examples" }), ` / ${example.id}: ${example.dir}/${example.entry}`]),
    element("pre"),
    ...(example.reference ? [element("p", { textContent: "What Qt renders:" }), element("img", { src: example.reference })] : []),
  );
  // An example that breaks after it is on the page has failed too.
  window.addEventListener("error", (event) => fail(event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => fail(event.reason));
  try {
    const module = await example.load();
    if (typeof module.default !== "function") throw new Error(`${example.entry} did not compile to a component`);
    // What the example's main.cpp does: it gives the entry file properties,
    // those the manifest has and those what stands in for main.cpp makes,
    // and may do something with what is loaded.
    const main = await example.main?.();
    const { object } = mount((given) => module.default({ ...given, ...example.qt.properties, ...main?.properties?.() }), stage);
    main?.loaded?.(object);
    if (state.status === "loading") state.status = "rendered";
  } catch (error) {
    fail(error);
  }
}

const id = new URLSearchParams(location.search).get("example");
const example = examples.find((candidate) => candidate.id === id);
if (example) {
  show(example);
} else {
  if (id !== null) window.gallery = { id, status: "failed", error: `no such example: ${id}` };
  list();
}
