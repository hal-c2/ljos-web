// What may be fetched while a shell a visitor dropped is shown (docs/LJOS_WEB.md
// A9). A shell can hand a block any string, and a block can hand that string
// to whatever loads an address, so an address is checked where it is loaded:
// nothing leaves for another site, and markup loads nothing at all, unless the
// site says it trusts a host. A page with no dropped shell is not touched by
// any of this.
//
// It is never lifted while the page lasts. What a shell handed a block may by
// then be anywhere (a model, a closure, a timer, what a block worked out from
// it), and no string says whose it is, so nothing short of the page going can
// say it has gone: Reset reloads the page.
import { signal } from "#kernel";

// What each live shell showing a dropped shell lets through. A page may have
// more than one, and what one lets through the others have not agreed to.
const zones = new Map();
const [shellShown, setShellShown] = signal(false);
export { shellShown };

const told = new Set();
const here = () => new URL(document.baseURI).origin;
// The runtime's own files may be served from elsewhere than the page.
const runtime = new URL(import.meta.url).origin;

export function zoneShows(zone, hosts) {
  zones.set(zone, new Set(hosts ?? []));
  setShellShown(true);
}

let toldUnkept = false;

// Whether what is written now may be kept for the next page, which has no guard
// until it shows a shell. Anything of a dropped shell may be on this page, and
// nothing says whose a string is, so a site's own writes go too: a visitor who
// keeps a shell keeps nothing else until Reset. The page shows them nothing of
// this: the one sign is this warning in the console, for the site's author.
export function mayKeep() {
  if (zones.size === 0) return true;
  if (!toldUnkept) {
    toldUnkept = true;
    console.warn("not kept while a dropped shell is shown: Settings and LocalStorage last as long as this page, until the shell is Reset");
  }
  return false;
}

// Whether `url` may be fetched now.
export function mayFetch(url) {
  if (zones.size === 0) return true;
  let at;
  try {
    at = new URL(String(url), document.baseURI);
  } catch {
    return false;
  }
  if (at.protocol === "data:" || at.protocol === "blob:") return true;
  // A socket is on the page's site when it is on the page's host.
  const origin = at.protocol === "ws:" || at.protocol === "wss:" ? `${at.protocol === "ws:" ? "http:" : "https:"}//${at.host}` : at.origin;
  if (origin === here() || origin === runtime) return true;
  if ([...zones.values()].every((hosts) => hosts.has(at.host))) return true;
  if (!told.has(at.href)) {
    told.add(at.href);
    console.warn(`not fetched while a dropped shell is shown: ${at.href} (a site allows a host with liveShell's allowedHosts)`);
  }
  return false;
}

const refusal = (url) => new Error(`${url} is not fetched while a dropped shell is shown`);

export const guardedFetch = (url, init) => (mayFetch(url) ? fetch(url, init) : Promise.reject(refusal(url)));

// An element told to load `url`, or told it could not, as a browser tells.
export function sourced(element, url) {
  if (mayFetch(url)) element.src = url; // guarded
  else queueMicrotask(() => element.dispatchEvent(new Event("error")));
}

// `url` where it may be fetched, nothing where it may not: for what is said
// to the browser in a style or an attribute, which tells of no failure.
export const allowedUrl = (url) => (mayFetch(url) ? url : "");

// What a value of a style may call. CSS can load an address from `url()`,
// `image()`, `image-set()`, `cross-fade()`, `src()` and whatever comes next,
// written in capitals, in escapes or behind a comment, so an address is not
// looked for: what is here is what is known to load nothing, and anything else
// is not used. A value is read as the browser would only as far as that needs:
// no escape, no string, no comment and no way out of the declaration.
const INERT = new Set([
  "",
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "color",
  "color-mix",
  "linear-gradient",
  "radial-gradient",
  "conic-gradient",
  "repeating-linear-gradient",
  "repeating-radial-gradient",
  "repeating-conic-gradient",
  "blur",
  "opacity",
  "drop-shadow",
  "inset",
  "polygon",
  "calc",
]);
function inert(text) {
  if (/[\\"'@;{}<>]|\/\*/.test(text)) return false;
  for (const [, name] of text.matchAll(/([\w-]*)\(/g)) if (!INERT.has(name.toLowerCase())) return false;
  return true;
}

function unused(text, instead) {
  if (!told.has(text)) {
    told.add(text);
    console.warn(`not used while a dropped shell is shown: ${text}`);
  }
  return instead;
}

// A value for a style that holds pictures or filters, as the runtime makes one
// up from colours and numbers. Its own filters and masks are in this document,
// and asked for by a name it chose.
export function allowedStyle(value) {
  if (zones.size === 0) return value;
  const text = String(value);
  return inert(text.replace(/url\(#qq-[\w-]+\)/g, "")) ? value : unused(text, "");
}

// A colour, and nothing else: all of it has to be one, as the browser reads it.
export function allowedColour(text) {
  if (zones.size === 0) return text;
  return inert(text) && CSS.supports("color", text) ? text : unused(text, "transparent");
}
