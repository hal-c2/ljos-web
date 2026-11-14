import { highlightTree, tagHighlighter, tags as t } from "@lezer/highlight";
import { parserFor, langOf } from "./index.ts";
import { topic } from "./highlight.ts";

// One class per role, so a page's theme decides every colour through
// `--ljos-code-<role>` and the editor and the static page agree.
export const classHighlighter = tagHighlighter([
  { tag: topic, class: "tok-topic" },
  { tag: [t.keyword, t.atom, t.self], class: "tok-keyword" },
  { tag: [t.string, t.escape, t.character], class: "tok-string" },
  { tag: t.number, class: "tok-number" },
  { tag: t.comment, class: "tok-comment" },
  { tag: [t.typeName, t.className, t.namespace], class: "tok-typeName" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], class: "tok-function" },
  { tag: t.propertyName, class: "tok-propertyName" },
  { tag: [t.variableName, t.labelName], class: "tok-variableName" },
  { tag: [t.operator, t.function(t.punctuation)], class: "tok-operator" },
  { tag: [t.punctuation, t.derefOperator], class: "tok-punctuation" },
  { tag: t.bool, class: "tok-bool" },
  { tag: t.null, class: "tok-null" },
  { tag: t.regexp, class: "tok-regexp" },
  { tag: t.meta, class: "tok-meta" },
  { tag: t.invalid, class: "tok-invalid" },
]);

const ESC: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ESC[c] ?? c);

/** A run of `code`, `[from, to, classes]`: unstyled text has empty classes. */
export type Run = [from: number, to: number, classes: string];

/**
 * Highlighted HTML for `code`: escaped text with `<span class="tok-…">`
 * around each token. A fence tag or file name the grammar doesn't read
 * comes back escaped and unstyled.
 */
export function highlightToHtml(code: string, tagOrFile: unknown): string {
  if (!langOf(tagOrFile)) return esc(code);
  let out = "";
  for (const [from, to, cls] of highlightRanges(code, tagOrFile)) {
    const text = esc(code.slice(from, to));
    out += cls ? `<span class="${cls}">${text}</span>` : text;
  }
  return out;
}

/**
 * The whole of `code` as `[from, to, classes]` runs, unstyled text with
 * empty classes. What the parser had to skip reads `tok-invalid` whatever
 * it looks like, so a broken line shows where it breaks before anything
 * compiles it.
 */
export function highlightRanges(code: string, tagOrFile: unknown): Run[] {
  const tree = parserFor(tagOrFile).parse(code);
  const runs: Run[] = [];
  let at = 0;
  highlightTree(tree, classHighlighter, (from, to, classes) => {
    if (from > at) runs.push([at, from, ""]);
    runs.push([from, to, classes]);
    at = to;
  });
  if (at < code.length) runs.push([at, code.length, ""]);

  const broken: [from: number, to: number][] = [];
  tree.iterate({
    enter(n) {
      if (!n.type.isError || n.from == n.to) return;
      const last = broken[broken.length - 1];
      if (last && last[1] >= n.from) last[1] = Math.max(last[1], n.to);
      else broken.push([n.from, n.to]);
    },
  });
  if (!broken.length) return runs;

  const out: Run[] = [];
  let b = 0;
  for (let [from, to, cls] of runs) {
    while (from < to) {
      let err = broken[b];
      while (err && err[1] <= from) err = broken[++b];
      if (!err || err[0] >= to) { out.push([from, to, cls]); break; }
      if (err[0] > from) { out.push([from, err[0], cls]); from = err[0]; continue; }
      const end = Math.min(to, err[1]);
      out.push([from, end, /\S/.test(code.slice(from, end)) ? "tok-invalid" : cls]);
      from = end;
    }
  }
  return out;
}
