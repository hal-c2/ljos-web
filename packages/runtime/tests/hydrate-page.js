// Pages prerendered into this one and hydrated, as a site's live blocks
// are: `window.prerender(host)` writes into a host what a prerender of
// `scenes/hydrating.qml` writes (`renderToString` of `ljos-web/server`):
// each element a type makes, numbered as it is made with its type,
// through the rounds the making settles in, and what is no making in
// the count (`unnumbered` in object.ts, server/dom.js) left out of it.
// The runtime's own `hydrate` and `mount` are there for a test to call.
import { hydrate, mount, settleMaking } from "ljos-web/object";
import Page from "./scenes/hydrating.qml";

const KIND = Symbol.for("ljos-web.making-kind");
const OUTSIDE = Symbol.for("ljos-web.outside-the-count");
const UNNUMBERED = new Set(["canvas", "img", "video", "audio", "link", "script", "style", "meta"]);

window.prerender = async (host) => {
  const scratch = document.createElement("div");
  scratch.style.cssText = "position:absolute;left:-10000px;width:400px;height:120px";
  document.body.append(scratch);
  const numbered = [];
  const counted = (element) => {
    const kind = globalThis[KIND] ?? "";
    if (!UNNUMBERED.has(element.localName) && globalThis[OUTSIDE] !== true && kind !== "") numbered.push([element, numbered.length + 1, kind]);
    return element;
  };
  document.createElement = (tag, given) => counted(Document.prototype.createElement.call(document, tag, given));
  document.createElementNS = (namespace, tag, given) => counted(Document.prototype.createElementNS.call(document, namespace, tag, given));
  let root;
  try {
    root = mount(Page, scratch);
    await settleMaking();
  } finally {
    delete document.createElement;
    delete document.createElementNS;
  }
  for (const [element, number, kind] of numbered) element.setAttribute("data-hk", `${number}:${kind}`);
  host.innerHTML = scratch.innerHTML;
  root.dispose();
  scratch.remove();
  return host.querySelectorAll("[data-hk]").length;
};
window.Page = Page;
window.hydrate = hydrate;
window.mount = mount;
window.ready = true;
