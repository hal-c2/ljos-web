// What `match` and `is` are lowered to, as ljos-ui's desugar writes them
// (its DIALECT.md §4.18, after the pattern-matching proposal at ba73ffe):
// `$is` asks whether a subject fits a pattern, `$extract` reads an
// extractor's list, and `$nomatch` is what a match no arm of fits throws.
// The behaviour and wording are ljos-ui's engine's, so a page does what
// `ljos run` does.
if (typeof Symbol.customMatcher !== "symbol") {
  Object.defineProperty(Symbol, "customMatcher", { value: Symbol("Symbol.customMatcher") });
}
// The proposal's matchers of the primitive constructors: a value of the
// type, which is the one item of its list. Kept here rather than put on
// the constructors, which a script would then see.
const primitive = new Map([
  [String, "string"],
  [Number, "number"],
  [Boolean, "boolean"],
  [BigInt, "bigint"],
  [Symbol, "symbol"],
]);
const matcherOf = (p) =>
  (typeof p === "object" && p !== null) || typeof p === "function" ? p[Symbol.customMatcher] : undefined;

// A pattern that is a name asks its custom matcher with the hint
// "boolean", or calls it with the subject alone when it is a function, so
// a predicate's own optional parameters keep their defaults; otherwise it
// compares, and `Object.is` makes NaN match NaN and keeps 0 and -0 apart.
export const $is = (s, p) => {
  const type = primitive.get(p);
  if (type !== undefined) return typeof s === type;
  const f = matcherOf(p);
  if (f !== undefined) return !!f.call(p, s, "boolean");
  return typeof p === "function" ? !!p(s) : Object.is(s, p);
};

// An extractor, `p(…)`: the list `p`'s matcher gives with the hint
// "list", or `undefined` where it gives `false` or a list whose length the
// `n` items do not match. `reads` is how far the list is read: one past
// the items (0), the items alone for `...` (1), all of it for `...let r`
// (2). An iterator left before its end is closed.
export const $extract = (s, p, n, reads) => {
  let list;
  const type = primitive.get(p);
  if (type !== undefined) {
    list = typeof s === type ? [s] : false;
  } else {
    const f = matcherOf(p);
    if (f !== undefined) list = f.call(p, s, "list");
    else if (typeof p === "function") list = p(s, "list");
    else throw new TypeError("an extractor's pattern has no custom matcher: give it a `[Symbol.customMatcher]` method");
  }
  if (list === false) return undefined;
  if ((typeof list !== "object" || list === null) && typeof list !== "function") {
    throw new TypeError('a custom matcher gives `false` or a list for the hint "list", not ' + typeof list);
  }
  const it = list[Symbol.iterator]();
  const want = reads === 2 ? Infinity : reads === 1 ? n : n + 1;
  const out = [];
  let done = false;
  while (out.length < want) {
    const r = it.next();
    if (r.done) {
      done = true;
      break;
    }
    out.push(r.value);
  }
  if (!done && typeof it.return === "function") it.return();
  return (reads === 0 ? out.length === n : out.length >= n) ? out : undefined;
};

export const $nomatch = (s) => {
  let shown;
  try {
    shown = typeof s === "string" ? JSON.stringify(s) : String(s);
  } catch (e) {
    shown = typeof s;
  }
  throw new TypeError("no arm of the `match` matches " + shown);
};
