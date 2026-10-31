// A page's theme: other values for the roles of `Ljos.Design`, as ljos-ui's
// `docs/theme.md` has them. What a theme file says is read and checked by
// the compiler (`qmlc --theme`, `ljos_web::theme`); this applies what it
// found, as overrides on the module's singletons. Whatever binds to a role
// follows, nothing is made again, and taking the theme away gives each role
// the module's value back.
//
//   setTheme({ file, overrides: [{ singleton, role, value | variants }] })
//   setTheme(null)                        // the module's own roles again
//   await applyTheme(text, { file, check }) // { ok: true } | { diagnostics }

import { override, watchSingletons } from "./object.js";

const MODULE = "Ljos.Design";

// What the page's theme sets, and what it has put on each singleton made so
// far: `{ object, roles: Map(role -> { handle, said }) }` by singleton.
let theme = null;
const held = new Map();
let watching = null;

// A colour's variant follows the scheme and contrast the user chose, as the
// module's own colours do; one the theme does not give is the module's.
function content(entry, object) {
  if (!entry.variants) return { value: entry.value };
  const { light, dark, lightHigh, darkHigh } = entry.variants;
  return {
    binding: (below) => {
      const high = object.highContrast;
      const picked = object.dark ? (high ? darkHigh : dark) : high ? lightHigh : light;
      return picked ?? below();
    },
  };
}

function sync(name, object) {
  const want = new Map();
  for (const entry of theme?.overrides ?? []) {
    if (`${MODULE}.${entry.singleton}` === name) want.set(entry.role, entry);
  }
  let mine = held.get(name);
  // A singleton made again (its file loaded again) has none of the old one's.
  if (mine?.object !== object) {
    mine = { object, roles: new Map() };
    held.set(name, mine);
  }
  for (const [role, had] of mine.roles) {
    if (want.has(role)) continue;
    had.handle.remove();
    mine.roles.delete(role);
  }
  for (const [role, entry] of want) {
    const said = JSON.stringify(entry);
    const had = mine.roles.get(role);
    if (had?.said === said) continue;
    if (had) {
      had.handle.set(content(entry, object));
      had.said = said;
    } else mine.roles.set(role, { handle: override(object, role, content(entry, object)), said });
  }
}

// Puts the checked theme on the page, in place of the one it had: a role the
// new one gives too is changed where it is, one it does not give is the
// module's again. `null` takes the theme away.
export function setTheme(checked) {
  if (checked !== null && !Array.isArray(checked?.overrides)) throw new TypeError("setTheme takes a checked theme ({ file, overrides }) or null");
  theme = checked;
  // A singleton made later, by a part of the page loaded later, has the
  // theme as it is made.
  watching ??= watchSingletons((name, object) => {
    if (name.startsWith(`${MODULE}.`)) sync(name, object);
  });
  for (const [name, { object }] of held) sync(name, object);
}

export function removeTheme() {
  setTheme(null);
}

// The theme a page has now, as it was checked.
export function currentTheme() {
  return theme;
}

// A theme the host has as text (a file it holds in memory): checked by
// `check({ file, text })`, which answers what `qmlc --theme` does
// (`{ file, overrides }`, or `{ diagnostics: [{ file, line, column, message }] }`),
// and put on the page only if nothing is wrong with it. A refused theme is
// refused whole: the page keeps the theme it had.
export async function applyTheme(text, { file = "theme.json", check } = {}) {
  if (typeof check !== "function") throw new TypeError("applyTheme needs a check: a function of { file, text } that answers as qmlc --theme does");
  const checked = await check({ file, text });
  if (checked?.diagnostics) return { diagnostics: checked.diagnostics };
  setTheme(checked);
  return { ok: true };
}

// What the Vite plugin gives an entry: its theme, put on the page when the
// entry is mounted, and again when the file changes while it is (`key` is
// the theme's place, the same for every entry that reads it).
let mounted = null;
export function themed(key, checked) {
  return {
    apply() {
      mounted = key;
      setTheme(checked);
    },
  };
}

export function rethemed(key, checked) {
  if (mounted === key) setTheme(checked);
}

// The theme file an entry reads when none is named, among the files a host
// holds: the same search `ljos_web::theme::nearest` makes.
export { findTheme } from "./find-theme.js";
