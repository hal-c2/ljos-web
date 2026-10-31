// A reload: a mounted root takes a new component and keeps its state where
// it can, as `ljos run --watch` does natively (ljos-ui ARCHITECTURE.md
// §12.1). The new root is made beside the old one; each object of the new
// tree that is an object of the old one takes what the running program gave
// it; then the new root takes the old one's place and the old one goes. A
// new root that cannot be made leaves the old one as it was.
//
// An object of the new tree is one of the old when it is at the same place
// by the same key, in this order of preference: its `id` (within the
// component it is written in, wherever it moved in it); its `objectName`;
// the row of a view it is the delegate of; its type and how many siblings
// of that type without an id or a name come before it. One of another type
// is made anew, and so is everything below it.
//
// It takes what was assigned to it while the program ran (a value a handler
// or the user gave, not one a binding works out), unless the file says
// something else of that property than it said before: an edited
// declaration wins. A value that is an object of the old tree is that
// object's in the new one, or nothing if it has none. Bindings and handlers
// are the new file's.
//
// Nothing here knows of a build tool: the Vite plugin calls `$reloaded` on a
// save, and a page that compiles QML itself calls `reload`.
import { $hot, flush, made, mounted, slot } from "./object.js";

// What `reload` gave up on: the new component, made, threw.
export class ReloadError extends Error {
  name = "ReloadError";
}

// Reloads `handle` (what `mount` returned) with `Component`. The handle is
// the same one afterwards, with the new root in `object`.
export function reload(handle, Component) {
  if (!mounted.has(handle)) throw new ReloadError("only a root mounted with { reloadable: true } can be reloaded");
  const old = handle.object;
  let root;
  try {
    root = made(Component, handle.props, true);
  } catch (error) {
    throw new ReloadError(`the reload was not applied: ${error?.message ?? error}`, { cause: error });
  }
  const object = root.object;
  const focused = root.within(() => carry(old, handle.Component, object, Component));
  const { element, options } = handle;
  if (old.$node && object.$node && old.$node.parentNode === element) element.replaceChild(object.$node, old.$node);
  else if (object.$node) element.append(object.$node);
  root.within(() => object.$mounted?.(element, options));
  handle.root.dispose();
  old.$node?.remove();
  handle.root = root;
  handle.object = object;
  handle.Component = Component;
  root.within(() => focused?.forceActiveFocus?.());
  flush();
  return handle;
}

// For the Vite plugin: each root mounted from `Old` takes `New`. Whether
// there was one; with none, whatever imported the file has to run again.
export function $reloaded(Old, New) {
  let any = false;
  for (const handle of [...mounted]) {
    if (handle.Component !== Old) continue;
    any = true;
    try {
      reload(handle, New);
    } catch (error) {
      console.error(error.message);
    }
  }
  return any;
}

// What a compiled file of a dev server says as it is loaded: from now on a
// root is reloadable unless `mount` is told otherwise.
export { $hot };

// What makes two objects the same object: a key in its tree, and its type.
const AMBIGUOUS = Symbol("ambiguous");

// `Clock` over `Rectangle`: the files an object is made from, and the type
// of the runtime's under them. The file reloaded is not one of them: the
// root is of the type its text says, whatever the component is called now.
function typeOf(object, reloaded) {
  const is = object.$props?.$is;
  const files = (Array.isArray(is) ? is : [is]).filter((file) => file && file !== reloaded).map((file) => file.name);
  return [...files, object.$type?.typeName].join("<");
}

// Whether a component made the object: the root of a file or of an inline
// component, or a view's delegate. Its ids are its own, not those of the
// component around it.
const opens = (object) => object.$row !== undefined || object.$props?.$levels !== undefined;

// Every object of the tree under `root` by its key; `visit(object, key)`
// is told of each, parents first.
function keyed(root, reloaded, visit) {
  const walk = (object, key, scope) => {
    visit(object, key);
    const inner = opens(object) ? key : scope;
    const counts = new Map();
    for (const child of object.$born ?? []) {
      let own;
      if (child.$row !== undefined) own = `${key}/[${child.$row}]${typeOf(child, reloaded)}`;
      else if (child.$id) own = `${inner}#${child.$id}`;
      else {
        const name = child.$slots && "objectName" in child ? child.objectName : "";
        if (typeof name === "string" && name !== "") own = `${key}/@${name}`;
        else {
          const type = typeOf(child, reloaded);
          const nth = counts.get(type) ?? 0;
          counts.set(type, nth + 1);
          own = `${key}/${type}:${nth}`;
        }
      }
      walk(child, own, inner);
    }
  };
  walk(root, "", "");
}

function below(object, into) {
  for (const child of object.$born ?? []) {
    into.add(child);
    below(child, into);
  }
  return into;
}

// Pairs the objects of the two trees and gives each new one what its old
// one was given. Answers the new object that is to have the keyboard.
function carry(oldRoot, Old, newRoot, New) {
  const olds = new Map();
  const all = new Set();
  keyed(oldRoot, Old, (object, key) => {
    all.add(object);
    olds.set(key, olds.has(key) ? AMBIGUOUS : object);
  });
  const pairs = new Map();
  const spent = new Set();
  // An object made anew, and those below it, are new whatever their keys.
  const anew = new Set();
  keyed(newRoot, New, (object, key) => {
    if (object.$parent && anew.has(object.$parent)) {
      anew.add(object);
      return;
    }
    const old = olds.get(key);
    if (!old || old === AMBIGUOUS || spent.has(old) || pairs.has(old)) return;
    if (typeOf(old, Old) !== typeOf(object, New)) {
      anew.add(object);
      below(old, spent);
      return;
    }
    pairs.set(old, object);
  });
  let focused = null;
  for (const [old, object] of pairs) {
    given(old, object, (value) => moved(value, all, pairs));
    if (old.activeFocus === true && !old.$born?.some((child) => child.activeFocus === true)) focused = object;
  }
  return focused;
}

// A value that is an object of the old tree is the one at its place in the
// new tree; one with none there is no longer held.
function moved(value, all, pairs) {
  if (Array.isArray(value) && value.some((item) => all.has(item))) return value.map((item) => moved(item, all, pairs));
  return all.has(value) ? (pairs.get(value) ?? null) : value;
}

// Whether the file says the same of `key` in both: nothing, the same
// value, or the same binding.
function same(before, after, key) {
  const was = before && Object.getOwnPropertyDescriptor(before, key);
  const is = after && Object.getOwnPropertyDescriptor(after, key);
  if (!was || !is) return !was && !is;
  if (was.get || is.get) return String(was.get) === String(is.get);
  return Object.is(was.value, is.value) || (typeof was.value !== "object" && typeof is.value !== "object" && String(was.value) === String(is.value));
}

function given(old, object, map) {
  for (const [key, held] of Object.entries(old.$slots ?? {})) {
    if (!held.assigned || !same(old.$props, object.$props, key)) continue;
    const into = slot(object, key);
    // A property whose type changed starts from what the file says.
    if (!into || into.kind?.type !== held.kind?.type) continue;
    try {
      into.write(map(held.value));
    } catch (error) {
      if (!error.refused) throw error;
    }
  }
  // The text the user typed is kept with where the cursor was in it.
  if (typeof object.select === "function" && typeof old.selectionStart === "number" && old.selectionStart !== old.selectionEnd) {
    object.select(old.selectionStart, old.selectionEnd);
  }
}
