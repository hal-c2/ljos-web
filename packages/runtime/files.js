import { guardedFetch } from "./guard.js";
// `ljos-web/files`: the files a page reads by address (a JsonListModel's
// `source`), and who is told when one changes. Nothing polls: a file is
// read again only when something says it changed.
//
// - A dev server says so itself: the Vite plugin sends `ljos-web:file` for a
//   saved file no module imports, and this module listens through
//   `import.meta.hot`, which a built site does not have.
// - `ljos-web/compiler` is given a project's files: what is not QML among
//   them is read from here, and a compile given another text of one says it
//   changed.
// - A host that knows of a change some other way says `changed(url)`.
//
// The files are kept on `globalThis`, so that the compiler (loaded only when
// a page compiles) and the modules a page has share them however they were
// loaded.
const KEY = Symbol.for("ljos-web/files");
const files = (globalThis[KEY] ??= { given: new Map(), readers: new Map() });

// An address without what a server is not asked for.
const address = (url) => {
  const parsed = new URL(url, document.baseURI);
  parsed.hash = "";
  return parsed.href;
};

// `text` is what the file at `url` reads as from now on: told to its readers
// when it differs from what it was, the first time too, since one may have
// fetched the file or failed to.
export function provide(url, text) {
  const at = address(url);
  if (files.given.get(at) === text) return;
  files.given.set(at, text);
  changed(at);
}

// The file at `url` is not given any more: it is fetched again.
export function withdraw(url) {
  const at = address(url);
  if (files.given.delete(at)) changed(at);
}

// The file at `url` changed: each of its readers reads it again.
export function changed(url) {
  for (const reader of [...(files.readers.get(address(url)) ?? [])]) reader();
}

// `reader` is called each time the file at `url` changes, until the function
// this answers is.
export function watch(url, reader) {
  const at = address(url);
  let readers = files.readers.get(at);
  if (!readers) files.readers.set(at, (readers = new Set()));
  readers.add(reader);
  return () => {
    readers.delete(reader);
    if (!readers.size && files.readers.get(at) === readers) files.readers.delete(at);
  };
}

// The text of the file at `url`: what was given of it, or what the server
// answers. A refusal says the file and why.
export async function read(url, { signal } = {}) {
  const at = address(url);
  if (files.given.has(at)) return files.given.get(at);
  // A save is read as saved, not as a cache kept it.
  const response = await guardedFetch(at, { signal, cache: "no-cache" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText || "the server would not give it"}`.trim());
  // A server that serves an app answers an address it has no file for with
  // the app's page: that is the file not being there, not broken JSON.
  if (/^text\/html\b/.test(response.headers.get("content-type") ?? "") && !/\.html?$/.test(new URL(at).pathname)) {
    throw new Error("not there: the server answered with a page");
  }
  return response.text();
}

if (import.meta.hot) {
  import.meta.hot.on("ljos-web:file", ({ paths }) => {
    for (const path of paths) changed(new URL(path, location.origin).href);
  });
}
