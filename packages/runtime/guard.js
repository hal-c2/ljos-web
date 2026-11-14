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

// The projects that have no files but those they were given: a live code
// block's example, whose fences and harness are all of it wherever its page
// is. Each is at a root of its own on an address no server answers, so what
// one names is looked for among its files, and what it names and does not
// have is not there, as a file that is not on disk is not there natively,
// and is not asked of anyone. Kept on `globalThis`, as `ljos-web/files`
// keeps what it is given, so the compiler and the page's modules share them
// however they were loaded.
const ENCLOSED = Symbol.for("ljos-web/enclosed");
const enclosed = (globalThis[ENCLOSED] ??= new Map());

// `files` (a Map or entries of name to text) are all the project at `root`
// has, from now on. `missing(name, url)` is told, once each, of a file it
// does not have that something asks for; `compile(entry)` makes a component
// of one of its files as the project's own were made, for what loads one
// by address (a ShellLoader's `source`).
export function enclose(root, files, { missing, compile } = {}) {
  const at = new URL(".", root).href;
  for (const url of enclosed.get(at)?.blobs.values() ?? []) URL.revokeObjectURL(url);
  enclosed.set(at, { root: at, files: new Map(files), missing, compile, told: new Set(), blobs: new Map() });
}

// The project at `root` goes, with the addresses its files were given at,
// when it is still the one whose `missing` that is: a block disposed does
// not take a project another block has since been given there. Answers
// the addresses of the files it had (none when it was not this one's),
// for what else holds them by address to let go of.
export function release(root, missing) {
  const at = new URL(".", root).href;
  const project = enclosed.get(at);
  if (!project || project.missing !== missing) return [];
  for (const url of project.blobs.values()) URL.revokeObjectURL(url);
  enclosed.delete(at);
  return [...project.files.keys()].map((name) => new URL(name, at).href);
}

// The project `url` is in, and the name of the file there it is (`text`
// undefined where the project has no such file); null for an address of no
// such project's.
export function own(url) {
  if (enclosed.size === 0) return null;
  let at;
  try {
    at = new URL(String(url), document.baseURI);
  } catch {
    return null;
  }
  at.hash = "";
  at.search = "";
  for (const project of enclosed.values()) {
    if (!at.href.startsWith(project.root)) continue;
    const name = unescaped(at.href.slice(project.root.length));
    return { project, name, url: at.href, text: project.files.get(name) };
  }
  return null;
}

// A name as its file is called. The URL parser keeps a `%` that starts no
// escape as it is and escapes what is around it (`my 100%.png` is
// `my%20100%.png`), so each run of escapes is read where it stands and
// such a `%` is the name's own.
function unescaped(path) {
  return path.replace(/(?:%[\da-f]{2})+/gi, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      return run;
    }
  });
}

// Why `found` is not there, told once to whoever its project tells.
function notThere(found) {
  const { project, name, url } = found;
  if (!project.told.has(name)) {
    project.told.add(name);
    project.missing?.(name, url);
  }
  return new Error(`${name}: No such file or directory`);
}

const TYPES = { svg: "image/svg+xml", json: "application/json", js: "text/javascript", mjs: "text/javascript", css: "text/css" };
const typeOf = (name) => TYPES[/\.(\w+)$/.exec(name)?.[1]?.toLowerCase()] ?? "text/plain";

// An address the browser can load a given file of a project's from.
function given(found) {
  let url = found.project.blobs.get(found.name);
  if (!url) found.project.blobs.set(found.name, (url = URL.createObjectURL(new Blob([found.text], { type: typeOf(found.name) }))));
  return url;
}

// Whether `url` may be fetched now. A file of a project that has only the
// files it was given is not fetched: `guardedFetch` and `sourced` give it
// as it was given, and `allowedUrl` an address it can be loaded from.
export function mayFetch(url) {
  const found = own(url);
  if (found) {
    if (found.text === undefined) notThere(found);
    return false;
  }
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

// Tells the enclosed project that `url`, one of its files it does not
// have, is not there, once: for a loader that asked for it quietly and
// now uses what it asked for.
export function sayNotThere(url) {
  const found = own(url);
  if (found && found.text === undefined) notThere(found);
}

// Why `url` is not loaded, where `allowedUrl` gave nothing for it: a file its
// project does not have is not there, and anything else was held back.
export function whyNot(url) {
  const found = own(url);
  return found ? `${found.name}: No such file or directory` : refusal(url).message;
}

export function guardedFetch(url, init) {
  const found = own(url);
  if (found) {
    if (found.text === undefined) return Promise.reject(notThere(found));
    return Promise.resolve(new Response(found.text, { headers: { "content-type": typeOf(found.name) } }));
  }
  return mayFetch(url) ? fetch(url, init) : Promise.reject(refusal(url));
}

// An element told to load `url`, or told it could not, as a browser tells.
export function sourced(element, url) {
  const found = own(url);
  if (found?.text !== undefined) element.src = given(found);
  else if (!found && mayFetch(url)) element.src = url; // guarded
  else {
    if (found) notThere(found);
    queueMicrotask(() => element.dispatchEvent(new Event("error")));
  }
}

// `url` where it may be fetched, nothing where it may not: for what is said
// to the browser in a style or an attribute, which tells of no failure.
export function allowedUrl(url) {
  const found = own(url);
  if (found?.text !== undefined) return given(found);
  return mayFetch(url) ? url : "";
}

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
