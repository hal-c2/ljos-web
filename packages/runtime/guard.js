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

// Whether anything of a dropped shell may be on the page: what is written now
// is not to be kept for the next page, which has no guard until it shows one.
export const guarded = () => zones.size > 0;

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
