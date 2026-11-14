// QML's XMLHttpRequest: the browser's, asked as a QML program asks it.
import { allowedUrl, whyNot } from "../guard.js";
import { located } from "../object.ts";

// Headers a program may not set, which Qt drops without a word. A browser
// drops them too, and a few more, but says so aloud each time.
const KEPT =
  "accept-charset accept-encoding access-control-request-headers access-control-request-method connection content-length " +
  "content-transfer-encoding cookie cookie2 date dnt expect host keep-alive origin referer te trailer transfer-encoding upgrade via";
const kept = new Set(KEPT.split(" "));

// The browser's, where there is one: the server renders without it, and a
// program there makes none. `readyState` is an accessor of its prototype,
// as this one's is.
type Rest = [async?: boolean, username?: string | null, password?: string | null];
interface Request
  extends Omit<globalThis.XMLHttpRequest, "readyState" | "open" | "send" | "abort" | "setRequestHeader"> {
  get readyState(): number;
  open(method: string, url: string | URL, ...rest: Rest): void;
  send(body?: Document | XMLHttpRequestBodyInit | null): void;
  abort(): void;
  setRequestHeader(name: string, value: string): void;
}
const Base: { new (): Request; readonly DONE: 4; readonly UNSENT: 0 } =
  globalThis.XMLHttpRequest ?? (class {} as unknown as typeof globalThis.XMLHttpRequest);

export class XMLHttpRequest extends Base {
  declare $refused: string | undefined;
  declare $waits: boolean;
  declare $state: number | undefined;
  declare $failing: boolean;

  // A file of the program's own is where its resources were put; one a live
  // example was given is read from what it was given.
  override open(method: string, url: string | URL, ...rest: Rest): void {
    const at = located(String(url));
    const to = allowedUrl(at);
    this.$refused = to === "" ? whyNot(at) : undefined;
    this.$waits = rest[0] !== false;
    this.$state = undefined;
    this.$failing = false;
    return super.open(method, to || at, ...rest);
  }

  // The request a file at `address` makes, where the page knows the file's
  // address (a live example's, `ljos-web/compiler`): a relative address is
  // beside that file, as a QML file's request names what is beside it.
  static beside(address: string | URL): typeof XMLHttpRequest {
    return class extends this {
      override open(method: string, url: string | URL, ...rest: Rest): void {
        const named = String(url);
        return super.open(method, /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(named) ? named : new URL(named, address).href, ...rest);
      }
    };
  }

  override get readyState(): number {
    return this.$state ?? super.readyState;
  }

  // Refused as a network failure is, step by step: a program waits for DONE,
  // or for `error`, and is to be told as it would be of any other failure.
  override send(body?: Document | XMLHttpRequestBodyInit | null): void {
    if (!this.$refused) return super.send(body);
    if (!this.$waits) throw new DOMException(`Failed to load: ${this.$refused}`, "NetworkError");
    this.$failing = true;
    this.dispatchEvent(new ProgressEvent("loadstart"));
    queueMicrotask(() => {
      if (!this.$failing) return;
      this.ended("error");
    });
  }

  ended(how: string): void {
    this.$failing = false;
    this.$state = XMLHttpRequest.DONE;
    this.dispatchEvent(new Event("readystatechange"));
    this.dispatchEvent(new ProgressEvent(how));
    this.dispatchEvent(new ProgressEvent("loadend"));
  }

  override abort(): void {
    if (this.$failing) this.ended("abort");
    if (this.$state !== undefined) this.$state = XMLHttpRequest.UNSENT;
    return super.abort();
  }

  override setRequestHeader(name: string, value: string): void {
    const header = String(name).toLowerCase();
    if (kept.has(header) || header.startsWith("proxy-") || header.startsWith("sec-")) return;
    super.setRequestHeader(name, value);
  }
}
