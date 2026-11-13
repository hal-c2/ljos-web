import { parser } from "./parser.js";

export { parser };
export { topic } from "./highlight.js";

// Which top rule and dialect each fence or file extension reads with. QML
// and `.lts` are always typed; a `.js` file stays plain JavaScript so that
// `a < b > c` keeps meaning what it means there.
const LANGS = {
  qml: { top: "Program", dialect: "ts" },
  lts: { top: "Script", dialect: "ts" },
  ts: { top: "Script", dialect: "ts" },
  typescript: { top: "Script", dialect: "ts" },
  js: { top: "Script", dialect: "" },
  mjs: { top: "Script", dialect: "" },
  javascript: { top: "Script", dialect: "" },
};

const configured = new Map();

/** The language a fence tag or file name reads as, or null. */
export function langOf(tagOrFile) {
  const s = String(tagOrFile ?? "").toLowerCase();
  const ext = s.includes(".") ? s.slice(s.lastIndexOf(".") + 1) : s;
  return ext in LANGS ? ext : null;
}

/** The parser for a fence tag or file name; QML when it names none. */
export function parserFor(tagOrFile) {
  const lang = langOf(tagOrFile) ?? "qml";
  let p = configured.get(lang);
  if (!p) {
    p = parser.configure(LANGS[lang]);
    configured.set(lang, p);
  }
  return p;
}
