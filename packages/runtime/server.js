// Prerendering: a component made where there is no browser, written
// out as the HTML a page is served with, for the page to be read
// before (or without) its script and taken over by it when it runs
// (`hydrate`, in `./object.js`).
//
// The compiled QML is the same on both sides — `qmlc`'s output names
// no DOM, only components over this runtime — so a prerender runs the
// same runtime, over whichever kernel the build chose, in Node over
// the document of `./server/dom.js`. Solid draws and Ljós decides
// there exactly as in the browser; what differs is only the document
// under them, and what it cannot do (paint a canvas, run a GPU, load
// a picture) the page does as it hydrates, over the elements this
// wrote. See docs/LJOS_WEB.md, the prerender section, for the limits.
//
// A render takes the process's globals over, so a build renders in a
// process of its own: `buildSite({ prerender: true })` in `./site.js`
// does so for a whole site. A host of its own calls, in one Node
// process per page:
//
//   installPrerenderGlobals();
//   const { renderToString } = await import("ljos-web/server");
//   const html = await renderToString(Entry);
//
// and puts `html` in the element its page hydrates.
import { flush, mount } from "./object.js";
import { installPrerenderGlobals, renumber, serialize } from "./server/dom.js";

export { installPrerenderGlobals };

// Makes `Component` as a page of `width` by `height` (the size its
// root is told it fills, for what sizes itself by it) and gives the
// HTML of what it made: the elements, their text, their links and
// their styles as the first paint will have them, each made element
// carrying the number `hydrate` knows it by.
//
// What is still on its way when the page settles — a picture loading,
// a model fetching — is in the state it starts in; a page whose words
// come from the network prerenders without them and has them when it
// hydrates, as it would on a first load anywhere.
export async function renderToString(Component, { props = {}, width = 1280, height = 720 } = {}) {
  const document = globalThis.document?.createElement ? globalThis.document : installPrerenderGlobals({ width, height });
  const host = document.createElement("div");
  host._width = width;
  host._height = height;
  document.body.appendChild(host);
  // The host is the page's own element (`#app`), which a browser's
  // parser made: what the component makes is numbered from here, as
  // the client's hydration counts it.
  renumber(document);
  const root = mount(Component, host, props);
  flush();
  // What completion set going settles in microtasks: let it.
  for (let round = 0; round < 10; round++) {
    await null;
    flush();
  }
  try {
    const mark = (node) => {
      for (const child of node.childNodes ?? []) {
        if (child.nodeType === 1 && child.$hk !== undefined) child.setAttribute("data-hk", String(child.$hk));
        mark(child);
      }
    };
    mark(host);
    // The rules the runtime gives a page by an adopted sheet, which a
    // page with no script run has not been given: written with the
    // page, so that it is laid out as it is written.
    const rules = (document.adoptedStyleSheets ?? []).map((sheet) => sheet.cssText ?? "").filter(Boolean).join("\n");
    return (rules ? `<style>${rules.replaceAll("</style", "<\\/style")}</style>` : "") + [...host.childNodes].map(serialize).join("");
  } finally {
    root.dispose?.();
    host.remove();
  }
}
