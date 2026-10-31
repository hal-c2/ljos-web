// QML's XMLHttpRequest: the browser's, asked as a QML program asks it.
import { mayFetch } from "../guard.js";
import { located } from "../object.js";

// Headers a program may not set, which Qt drops without a word. A browser
// drops them too, and a few more, but says so aloud each time.
const KEPT =
  "accept-charset accept-encoding access-control-request-headers access-control-request-method connection content-length " +
  "content-transfer-encoding cookie cookie2 date dnt expect host keep-alive origin referer te trailer transfer-encoding upgrade via";
const kept = new Set(KEPT.split(" "));

const Base = globalThis.XMLHttpRequest ?? class {};

export class XMLHttpRequest extends Base {
  // A file of the program's own is where its resources were put.
  open(method, url, ...rest) {
    const at = located(String(url));
    this.$refused = !mayFetch(at);
    return super.open(method, at, ...rest);
  }

  // Refused as a network failure is: a program handles that already.
  send(body) {
    if (!this.$refused) return super.send(body);
    queueMicrotask(() => this.dispatchEvent(new Event("error")));
  }

  setRequestHeader(name, value) {
    const header = String(name).toLowerCase();
    if (kept.has(header) || header.startsWith("proxy-") || header.startsWith("sec-")) return;
    super.setRequestHeader(name, value);
  }
}
