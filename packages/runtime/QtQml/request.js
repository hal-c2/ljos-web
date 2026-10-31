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
    this.$waits = rest[0] !== false;
    this.$state = undefined;
    this.$failing = false;
    return super.open(method, at, ...rest);
  }

  get readyState() {
    return this.$state ?? super.readyState;
  }

  // Refused as a network failure is, step by step: a program waits for DONE,
  // or for `error`, and is to be told as it would be of any other failure.
  send(body) {
    if (!this.$refused) return super.send(body);
    if (!this.$waits) throw new DOMException(`Failed to load: not fetched while a dropped shell is shown`, "NetworkError");
    this.$failing = true;
    this.dispatchEvent(new ProgressEvent("loadstart"));
    queueMicrotask(() => {
      if (!this.$failing) return;
      this.ended("error");
    });
  }

  ended(how) {
    this.$failing = false;
    this.$state = XMLHttpRequest.DONE;
    this.dispatchEvent(new Event("readystatechange"));
    this.dispatchEvent(new ProgressEvent(how));
    this.dispatchEvent(new ProgressEvent("loadend"));
  }

  abort() {
    if (this.$failing) this.ended("abort");
    if (this.$state !== undefined) this.$state = XMLHttpRequest.UNSENT;
    return super.abort();
  }

  setRequestHeader(name, value) {
    const header = String(name).toLowerCase();
    if (kept.has(header) || header.startsWith("proxy-") || header.startsWith("sec-")) return;
    super.setRequestHeader(name, value);
  }
}
