// ImageSelector, NinePatchImageSelector, AnimatedImageSelector: which of
// the pictures there are of something is shown, by what state it is in.
// `NinePatchImageSelector on source { states: [{ "pressed": control.down }] }`
// over `button-background` shows `button-background-pressed.9.png` while the
// button is down, if there is such a file.
//
// The selector owns what the property reads as (the slot's `shown`): the
// property is given the name the pictures start with, and reads as the file
// chosen. The choosing is Qt's (`qquickimageselector.cpp`), its oddities
// with it, so that the file is the one Qt takes.
//
// Qt looks in a folder for the files there are. A page has no folders to
// look in: a file is there if the build said so (`resources`), as it does of
// the pictures a style of Qt's keeps in its plugin.
import { onCleanup } from "solid-js";
import { defineType, derived, QtObject, resources, whenComplete } from "../../../object.js";
import { lazy } from "../../compute.js";
import { Property } from "../../animation/property.js";
import { signal, untrack } from "#kernel";

// `:/folder/file` is how Qt names a file of its resources, and
// `qrc:/folder/file` what it is known by.
const address = (file) => (file.startsWith(":") ? `qrc${file}` : file);
const exists = (file) => resources.has(address(file));

// The orders in which a row of names can be put, each once, from the one
// sorted first: `std::next_permutation`.
function orders(names) {
  const row = [...names].sort();
  const all = [];
  for (;;) {
    all.push([...row]);
    let at = row.length - 2;
    while (at >= 0 && row[at] >= row[at + 1]) at--;
    if (at < 0) return all;
    let other = row.length - 1;
    while (row[other] <= row[at]) other--;
    [row[at], row[other]] = [row[other], row[at]];
    row.push(...row.splice(at + 1).reverse());
  }
}

// The names a file may have after the picture's own, for the states that
// are active: `count` of them that follow each other, in every order, then
// fewer. Not every choice of them, and near the end of the row some that
// are of more or fewer than `count`: this is Qt's, as it is.
function permutations(active, count = active.length) {
  const all = [];
  for (let index = 0; index < active.length; index++) {
    const some = active.slice(index, index + count);
    if (count > 1) {
      // A length below nothing is all of them to Qt's `mid`.
      if (index + count > active.length) some.push(...active.slice(0, count - index + 1 < 0 ? active.length : count - index + 1));
      if (some.length > 0) all.push(...orders(some));
    } else all.push(some);
    if (count === active.length) break;
  }
  if (count > 1) all.push(...permutations(active, count - 1));
  return all;
}

// A state counts for more the earlier it is among the active ones.
const score = (states, active) => states.reduce((sum, state) => sum + ((active.length - active.indexOf(state)) << 1), 0);

// The first there is of the files a name could be, or none.
const file = (folder, name, extensions) =>
  extensions.map((extension) => `${folder}/${name}.${extension}`).find(exists) ?? "";

// The file for the states that are active: the one that names the most of
// them and the earliest, or else the picture with no state in its name, or
// else none.
function chosen(folder, name, active, separator, extensions) {
  let best = "";
  let most = -1;
  for (const states of permutations(active)) {
    const found = file(folder, name + separator + states.join(separator), extensions);
    if (found && score(states, active) > most) {
      most = score(states, active);
      best = found;
    }
  }
  return best || file(folder, name, extensions);
}

// What was chosen before, for a selector that remembers (`cache`): many
// controls are in the same few states, and the orders of a handful of
// states are many. It is remembered by what Qt remembers it by, which is
// not all that it was chosen by: a selector of another kind, or one with
// another separator and a single state, is given the same file.
const remembered = new Map();

function recalled(folder, name, active, separator, extensions) {
  const key = folder + name + active.join(separator);
  let found = remembered.get(key);
  if (found === undefined) remembered.set(key, (found = chosen(folder, name, active, separator, extensions)));
  return found;
}

// The folder and the name of what the property was given. A file of Qt's
// resources is `:/folder/name` to Qt.
function split(given) {
  const url = String(given ?? "").replace(/^qrc(?=:\/)/, "");
  const at = url.lastIndexOf("/");
  return at === -1 ? { path: "", name: url } : { path: url.slice(0, at), name: url.slice(at + 1) };
}

// Whether a value is so, to Qt (`QVariant::toBool`): a number that is not
// 0, a text that is not empty, "0" or "false" however it is written, and
// of anything else only true.
function so(value) {
  if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
  if (typeof value === "string") return !["", "0", "false"].includes(value.toLowerCase());
  return value === true;
}

// The states that are so, in the order they were given. Each is an object
// of one name: of several, the first as they are sorted.
function active(states) {
  const names = [];
  for (const state of Array.isArray(states) ? states : []) {
    const [name] = Object.keys(state ?? {}).sort();
    if (name !== undefined && so(state[name])) names.push(name);
  }
  return names;
}

// What a file of each selector may end in, in the order they are tried.
const PICTURE = ["png"];
const MARKED = ["9.png", "png"];
const MOVING = ["webp", "gif"];

export const ImageSelector = defineType("ImageSelector", QtObject, {
  properties: {
    source: derived((self) => self.$chosen()),
    name: derived((self) => split(self.$given()).name),
    path: derived((self) => split(self.$given()).path),
    states: undefined,
    separator: "-",
    cache: true,
  },
  setup(self, props) {
    self.$extensions = PICTURE;
    const [given, give] = signal(null, self.$owner);
    // What the property was given, once the selector is on it.
    self.$given = () => given()?.target() ?? "";
    // Nothing is chosen before the object is complete, as in Qt.
    const [selects, select] = signal(false, self.$owner);
    self.$chosen = lazy(
      self,
      () => {
        const { name, path } = self;
        if (!selects() || !name) return "";
        const choose = self.cache ? recalled : chosen;
        return address(choose(String(path), String(name), active(self.states), String(self.separator), self.$extensions));
      },
      "",
    );
    // The property reads as the selector's from the start, which is as
    // nothing until then: the name it is given is no file to load. On no
    // property the selector chooses all the same, by the name and the path
    // it is given.
    const taken = () => {
      const object = untrack(() => props.$target);
      const property = object && props.$property ? new Property(object, props.$property) : null;
      if (!property?.slot) return false;
      const slot = property.slot;
      give(property);
      slot.shown = () => self.source;
      slot.changed();
      onCleanup(() => {
        slot.shown = null;
        slot.changed();
      });
      return true;
    };
    const had = taken();
    whenComplete(() => {
      if (!had) taken();
      select(true);
    });
  },
});

const selector = (name, extensions) =>
  defineType(name, ImageSelector, {
    setup(self) {
      self.$extensions = extensions;
    },
  });

export const NinePatchImageSelector = selector("NinePatchImageSelector", MARKED);
export const AnimatedImageSelector = selector("AnimatedImageSelector", MOVING);
