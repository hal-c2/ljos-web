// A block's highlighting as a site ships it (`ljos-web/codeblock/rich`).
//
// The build colours every block (`highlight`, `lezer-ljos/html`) as
// `<span class="tok-…">` runs, and a site carries those words in its
// first script, every page's: written out, the spans are most of what
// the colouring weighs. Packed, a token is its text between two marks:
// `<` and one letter for its class where it starts, `>` where it ends
// (none where the next one starts at once). Escaped code holds no raw
// `<` or `>`, so the marks are never the code's own; a string that does
// not come back exactly as it was is shipped as it was.
//
// `unpackRich` is what a page reads it with, once per block as it is
// shown; a site whose scripts cannot import it (a `.pragma library`
// file) keeps a copy of the few lines, held to this one by its tests.

// The classes `lezer-ljos/html` and the rough colouring give, in the
// order their letters (a, b, …) name them. Only ever added to at the
// end: a letter is a class for as long as a build can be read.
export const TOKENS = [
  "topic",
  "keyword",
  "string",
  "number",
  "comment",
  "typeName",
  "function",
  "propertyName",
  "variableName",
  "operator",
  "punctuation",
  "bool",
  "null",
  "regexp",
  "meta",
  "invalid",
];

// What a packed string starts with: a character of the private use
// area, which no escaped code is read as starting with.
export const PACKED = "\uE000";

const LETTER = new Map(TOKENS.map((name, at) => [name, String.fromCharCode(97 + at)]));

const SPAN = /<span class="tok-(\w+)">([^<>]*)<\/span>/g;

/** `html` packed, or `html` itself where packing would not give it back. */
export function packRich(html) {
  const text = String(html);
  if (!text) return text;
  // Markup that starts with the mark itself is written so it does not
  // (the same character, as a reference), and shipped as it is.
  if (text.startsWith(PACKED)) return `&#xE000;${text.slice(1)}`;
  const spans = [...text.matchAll(SPAN)];
  let out = PACKED;
  let at = 0;
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    const letter = LETTER.get(span[1]);
    if (!letter) return text;
    out += `${text.slice(at, span.index)}<${letter}${span[2]}`;
    at = span.index + span[0].length;
    if (spans[i + 1]?.index !== at) out += ">";
  }
  out += text.slice(at);
  return unpackRich(out) === text ? out : text;
}

/** The `<span class="tok-…">` markup a packed string stands for; any other string as it is. */
export function unpackRich(packed) {
  const text = String(packed);
  if (!text.startsWith(PACKED)) return text;
  let open = false;
  const html = text.slice(1).replace(/<([a-z])|>/g, (_all, letter) => {
    const close = open ? "</span>" : "";
    open = letter !== undefined;
    return open ? `${close}<span class="tok-${TOKENS[letter.charCodeAt(0) - 97]}">` : close;
  });
  return open ? `${html}</span>` : html;
}
