// What `match` is lowered to, as ljos-ui's desugar writes it: `$is` asks
// whether a subject fits a pattern (a function is a predicate, anything
// else is compared as `Object.is` does), and `$nomatch` is what a match no
// arm of fits throws. The wording is ljos-ui's, so a page says what
// `ljos run` says.
export const $is = (s, p) => (typeof p === "function" ? !!p(s) : Object.is(s, p));

export const $nomatch = (s) => {
  let shown;
  try {
    shown = typeof s === "string" ? JSON.stringify(s) : String(s);
  } catch (e) {
    shown = typeof s;
  }
  throw new TypeError("no arm of the `match` matches " + shown);
};
