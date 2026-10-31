// What may be fetched while a shell a visitor dropped is shown (docs/LJOS_WEB.md
// A9). A shell can hand a block any string, and a block can hand that string
// to whatever loads an address, so an address is checked where it is loaded:
// nothing leaves for another site, and markup loads nothing at all, until the
// last dropped shell on the page has gone, unless the site says it trusts a
// host. A page with no dropped shell is not touched by any of this.
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

// One load for everything that names a file is kept for the page's life; one
// that was refused is not what the file is. Asked again once nothing refuses.
const refusals = new Set();

function changed() {
  setShellShown(zones.size > 0);
  if (zones.size > 0) return;
  for (const forget of refusals) forget();
  refusals.clear();
}

// Says that `cache` has just kept what it knows of `url` under `key`.
export function kept(cache, key, url) {
  if (!mayFetch(url)) refusals.add(() => cache.delete(key));
}

export function zoneShows(zone, hosts) {
  zones.set(zone, new Set(hosts ?? []));
  changed();
}

export function zoneHides(zone) {
  zones.delete(zone);
  changed();
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
