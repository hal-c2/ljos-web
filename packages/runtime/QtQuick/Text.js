// Text: a string set in a font.
//
// What a binding reads of a text (how wide it would be, how tall it is once
// wrapped, how many lines) is known before the browser has laid anything
// out, so plain text is measured and broken into lines here and the element
// is given the lines. Markup is the browser's to set: it is measured in an
// element off the page.
import { $string, defineType, derived, effect, flush, kinds, slot, typed } from "../object.js";
import { color, css } from "./color.js";
import { given, lazy, sized } from "./compute.js";
import {
  advance,
  capitalized,
  describe,
  dress,
  elided,
  ELLIPSIS,
  fitting,
  font,
  fonts,
  metrics,
  overhang,
  resized,
} from "./font.js";
import { Item } from "./Item.js";
import { alignment } from "./LayoutMirroring.js";
import { clothe, elements, mightBeRichText, survey } from "./richtext.js";

const MANY = 2147483647;
const ELIDE_RIGHT = 1;
const ELIDE_NONE = 3;
const WORD_WRAP = 1;
const WRAP_ANYWHERE = 3;

const PARAGRAPHS = /\r\n|[\n\u2028\u2029]/;
const TRAILING = /[ \t]+$/;
const HANGING = / +$/;
// A text whose first letter is Hebrew or Arabic starts from the right.
export const RIGHT_TO_LEFT = /^[^\p{L}]*[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/u;

const hangs = (code) => code === 32 || code === 9;
const letter = (code) => (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code >= 0xc0;
// Chinese, Japanese and Korean are written without spaces: a line may end
// after any character, short of leaving a bracket or a full stop alone.
const wide = (code) =>
  (code >= 0x2e80 && code <= 0x9fff) ||
  (code >= 0xac00 && code <= 0xd7af) ||
  (code >= 0xf900 && code <= 0xfaff) ||
  (code >= 0xff00 && code <= 0xffef);
const OPENS = "（［｛〈《「『【〔";
const CLOSES = "、。，．：；！？）］｝〉》」』】〕";

// Where a line of `text` may end: after spaces, which hang off the end of
// the line they close, after a hyphen or a slash inside a word, and at the
// end.
function stops(text) {
  const found = [];
  for (let index = 1; index < text.length; index++) {
    const at = text.charCodeAt(index);
    if (hangs(at)) continue;
    const before = text.charCodeAt(index - 1);
    if (hangs(before) || before === 0x200b) found.push(index);
    else if ((before === 45 || before === 47 || before === 0x2010) && letter(at)) {
      if (index > 1 && !hangs(text.charCodeAt(index - 2))) found.push(index);
    } else if (wide(at) ? !CLOSES.includes(text[index]) && !OPENS.includes(text[index - 1]) : wide(before)) {
      if (!OPENS.includes(text[index - 1])) found.push(index);
    }
  }
  found.push(text.length);
  return found;
}

// A line: its text, how far it advances, and how wide Qt says it is, which
// counts what the last glyph overhangs.
function row(font, text, soft, from) {
  const width = advance(font, text);
  return { ...from, text, advance: width, width: width + overhang(font, text), soft };
}

// Breaks a paragraph into lines no wider than `limit`, as many words on each
// as fit. A word wider than a line overflows it (`Text.WordWrap`) or is
// itself broken (`Text.Wrap`); `Text.WrapAnywhere` knows no words.
function wrap(font, text, limit, mode, lines) {
  const length = text.length;
  const whole = row(font, text, false);
  if (whole.width <= limit) {
    lines.push(whole);
    return;
  }
  const breaks = mode === WRAP_ANYWHERE ? null : stops(text);
  const tabs = text.includes("\t");
  let start = 0;
  let next = 0;
  while (start < length) {
    let end = start;
    if (breaks) {
      let used = 0;
      while (next < breaks.length) {
        const stop = breaks[next];
        const piece = text.slice(end, stop);
        const shown = piece.replace(TRAILING, "");
        // How far a tab goes depends on where in the line it is.
        const reach = tabs ? advance(font, text.slice(start, end) + shown) : used + advance(font, shown);
        if (reach + overhang(font, shown) > limit) {
          if (end > start) break;
          // A word alone on its line, and still too wide for it.
          if (mode !== WORD_WRAP) {
            end = start + fitting(font, text, start, limit);
            if (end >= stop) next++;
            break;
          }
        }
        used += advance(font, piece);
        end = stop;
        next++;
      }
    } else end = start + fitting(font, text, start, limit);
    const soft = end < length;
    const shown = soft ? text.slice(start, end).replace(TRAILING, "") : text.slice(start, end);
    lines.push(row(font, shown, soft, { paragraph: text, start, end }));
    start = end;
  }
}

// The paragraphs of a plain text, as Qt sets them. The spaces before a line
// break hang: they count neither in how wide their line is nor in where its
// alignment puts it, though those that end the text do. And a line break that
// ends the text starts no line: it is `open`, which only makes the text a
// line taller than what it covers. A TextEdit sets them `whole`, as written.
function paragraphs(text, whole) {
  const all = text.split(PARAGRAPHS);
  if (whole) return { parts: all.map((shown) => ({ shown, hung: "" })), open: false };
  const open = all.length > 1 && all[all.length - 1] === "";
  if (open) all.pop();
  const ended = open ? all.length : all.length - 1;
  const parts = all.map((paragraph, index) => {
    const shown = index < ended ? paragraph.replace(HANGING, "") : paragraph;
    return { shown, hung: paragraph.slice(shown.length) };
  });
  return { parts, open };
}

// The lines of a plain text: wrapped to `limit`, no more than `most` and no
// taller together than `ceiling`, the last one elided when there was more.
export function arrange(text, font, limit, mode, elide, most, ceiling, pitch, align, whole) {
  const lines = [];
  const wraps = mode !== 0 && limit !== Infinity;
  const { parts, open } = paragraphs(text, whole);
  for (const { shown, hung } of parts) {
    if (wraps) wrap(font, shown, limit, mode, lines);
    else lines.push(row(font, shown, false));
    lines[lines.length - 1].hung = hung;
  }
  const full = lines.length;
  let widest = 0;
  let wrapped = false;
  for (const line of lines) {
    widest = Math.max(widest, line.width);
    wrapped ||= line.soft;
  }
  // Qt elides several lines only at the right, and only when something says
  // how many there may be: a count or a height.
  const several = elide === ELIDE_RIGHT && limit !== Infinity && (ceiling !== Infinity || most < MANY);
  let count = Math.min(full, most);
  // The first line is shown however little room there is.
  if (several && ceiling !== Infinity) count = Math.min(count, Math.max(Math.floor(ceiling / pitch + 1e-6), 1));
  let truncated = count < full;
  // Qt has already counted a line in the width when it finds that the next
  // one does not fit the height, and elides it then.
  let counted = null;
  if (truncated) {
    const last = lines[count - 1];
    const following = lines[count];
    if (several && count < most) counted = last;
    lines.length = count;
    if (several) {
      // What did not fit is the next line's: the two are elided as one. A
      // line its paragraph ended is only marked.
      const cut = last.soft
        ? elided(font, last.paragraph.slice(last.start, following.end), ELIDE_RIGHT, limit)
        : last.text + last.hung + ELLIPSIS;
      lines[count - 1] = row(font, cut, false);
    }
  } else if (elide !== ELIDE_NONE && limit !== Infinity && full === 1 && lines[0].width > limit) {
    const cut = elided(font, lines[0].text, elide, limit);
    lines[0] = row(font, cut, false);
    truncated = true;
  }
  // The width is of what the lines cover together, each where its alignment
  // puts it: an overhang at the right of one line adds to the longest.
  const room = limit === Infinity ? 0 : limit;
  const shift = limit === Infinity ? 0 : align === 2 ? 1 : align === 4 ? 0.5 : 0;
  let span = 0;
  let left = Infinity;
  let right = -Infinity;
  for (const line of counted ? [...lines, counted] : lines) {
    const start = (room - line.advance) * shift;
    const justified = align === 8 && line.soft && limit !== Infinity;
    if (line !== counted) span = Math.max(span, line.advance);
    left = Math.min(left, start);
    right = Math.max(right, justified ? limit : start + line.width);
  }
  const width = right - left;
  // The line an open text is taller by is one more of those there may be.
  const below = open && count === full && full < most ? pitch : 0;
  return { lines, text: lines.map((line) => line.text).join("\n"), width, span, count, truncated, widest, wrapped, full, below };
}

// The line height as CSS, for markup: Qt's is the font's height rounded up,
// times `lineHeight`, whatever the size of the element it is in.
function leading(font, factor, fixed) {
  if (fixed) return `${factor}px`;
  const face = metrics(font);
  const ratio = font.size ? (face.ascent + face.descent) / font.size : 0;
  const line = `round(up, ${ratio}em, 1px)`;
  return factor === 1 ? line : `calc(${line} * ${factor})`;
}

// How wide the text is when nothing constrains it: its `implicitWidth`.
// Apart from the layout, which depends on the width: a binding of `width`
// may read this one.
function natural(self, state) {
  fonts();
  const { text, kind } = state.source();
  const font = state.font();
  if (kind) {
    const fixed = self.lineHeightMode === 1;
    const line = leading(font, self.lineHeight, fixed);
    return survey(text, { kind, font, line, pitch: 0, limit: Infinity, mode: 0, most: MANY, elide: ELIDE_NONE }).width;
  }
  let width = 0;
  for (const { shown } of paragraphs(text).parts) width = Math.max(width, advance(font, shown) + overhang(font, shown));
  return width;
}

// The text laid out in the item's width. With `bounded`, in its height too
// and at the size `fontSizeMode` finds; without, as tall as it wants to be,
// which is its `implicitHeight`.
function laid(self, state, bounded) {
  fonts();
  const { text, kind } = state.source();
  const base = state.font();
  const wide = sized(self, "width");
  const mode = wide ? self.wrapMode : 0;
  const elide = wide ? self.elide : ELIDE_NONE;
  const most = Math.max(self.maximumLineCount, 1);
  const factor = self.lineHeight;
  const fixed = self.lineHeightMode === 1;
  const align = self.effectiveHorizontalAlignment;
  const fit = bounded && !kind ? self.fontSizeMode : 0;
  // Plain text that does not wrap, is not cut short and is not made to fit
  // covers what it covers whatever the width of the item, which is not asked
  // for: `width: label.contentWidth` around a label that fills it is not a
  // loop in Qt.
  const free = wide && !kind && mode === 0 && elide === ELIDE_NONE && !(fit & 1);
  const limit = !wide ? Infinity : free ? 0 : Math.max(self.width - self.leftPadding - self.rightPadding, 0);
  const tall = bounded && !kind && (fit & 2 || elide === ELIDE_RIGHT) && sized(self, "height");
  const ceiling = tall ? Math.max(self.height - self.topPadding - self.bottomPadding, 0) : Infinity;
  const one = (font) => {
    const face = metrics(font);
    const pitch = fixed ? factor : face.height * factor;
    if (kind) {
      const look = { kind, font, line: leading(font, factor, fixed), pitch, limit, mode, most, elide };
      return { ...survey(text, look), kind, text, look, font, pitch, below: 0 };
    }
    const made = arrange(text, font, limit, mode, elide, most, ceiling, pitch, align);
    made.kind = 0;
    made.font = font;
    made.pitch = pitch;
    made.height = made.count * pitch;
    made.ascent = face.ascent;
    return made;
  };
  const made = one(base);
  const horizontal = fit & 1 && wide;
  const vertical = fit & 2 && tall;
  if (!horizontal && !vertical) return made;
  // Qt's search: the largest whole size, from the minimum to the font's own,
  // at which nothing overflows. Fitting the width alone means on one line.
  const fits = (tried) =>
    !(horizontal && (tried.widest > limit || (!vertical && tried.wrapped))) && !(vertical && tried.full * tried.pitch > ceiling);
  if (fits(made)) return made;
  const points = !given(self, "font", "pixelSize") && !given(self, "font", "size");
  const least = Math.min(points ? Math.round((self.minimumPointSize * 96) / 72) : self.minimumPixelSize, base.size);
  let low = least;
  let high = Math.ceil(base.size) - 1;
  let best = null;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const tried = one(resized(base, middle));
    if (fits(tried)) {
      best = tried;
      low = middle + 1;
    } else high = middle - 1;
  }
  return best ?? one(resized(base, least));
}

// Where the top of the text is in the item: `verticalAlignment`. Text taller
// than the item overflows it, upwards too.
function origin(self, made) {
  const room = self.height - self.topPadding - self.bottomPadding;
  const align = self.verticalAlignment;
  return self.topPadding + (align === 64 ? room - made.height : align === 128 ? (room - made.height) / 2 : 0);
}

// `style`: the text again in `styleColor`, around it, below it or above it.
function shadow(style, color) {
  if (style === 1) return `-1px 0 ${color}, 1px 0 ${color}, 0 -1px ${color}, 0 1px ${color}`;
  if (style === 2) return `0 1px ${color}`;
  if (style === 3) return `0 -1px ${color}`;
  return "";
}

const ALIGNS = { 1: "left", 2: "right", 4: "center", 8: "justify" };

// Plain text, with the letters at `marks` underlined: a label's mnemonics.
function write(content, text, marks) {
  if (!marks) {
    // A page's prerendered text is already here: writing it again would
    // make a new text node, which the browser paints (and counts as the
    // page's largest paint) a second time.
    if (content.childNodes.length !== 1 || content.firstChild.nodeType !== 3 || content.textContent !== text) content.textContent = text;
    return;
  }
  const pieces = [];
  let from = 0;
  for (const at of marks.split(" ").map(Number)) {
    const letter = document.createElement("u");
    letter.textContent = text[at];
    pieces.push(text.slice(from, at), letter);
    from = at + 1;
  }
  content.replaceChildren(...pieces, text.slice(from));
}

// Whether the markup a page was prerendered with is the markup the item
// shows: then hydration keeps it, as it keeps plain text (`write`).
function same(content, fresh) {
  const now = content.childNodes;
  const made = fresh.childNodes;
  if (now.length !== made.length) return false;
  for (let index = 0; index < now.length; index++) if (!now[index].isEqualNode(made[index])) return false;
  return true;
}

// Justified lines, one element each: the room a wrapped line leaves is
// shared out between its words.
function justify(content, made, width) {
  content.replaceChildren(
    ...made.lines.map((line) => {
      const row = document.createElement("div");
      row.textContent = line.text || " ";
      const gaps = line.soft ? line.text.split(" ").length - 1 : 0;
      if (gaps > 0) row.style.wordSpacing = `${made.font.wordSpacing + (width - line.advance) / gaps}px`;
      return row;
    }),
  );
}

const padding = derived((self) => self.padding);
const layout = (self) => self.$text.layout();

export const Text = defineType("Text", Item, {
  properties: {
    text: $string,
    font,
    color: typed(kinds.color, color("black")),
    linkColor: "blue",
    style: 0,
    styleColor: "black",
    // Text that starts from the right is set against the right edge unless
    // an alignment was asked for, and Qt says so in this property too.
    horizontalAlignment: derived((self) => (RIGHT_TO_LEFT.test(self.$text.source().text) ? 2 : 1)),
    verticalAlignment: 32,
    effectiveHorizontalAlignment: derived(alignment),
    wrapMode: 0,
    elide: ELIDE_NONE,
    maximumLineCount: MANY,
    textFormat: 2,
    lineHeight: 1,
    lineHeightMode: 0,
    fontSizeMode: 0,
    minimumPixelSize: 12,
    minimumPointSize: 12,
    padding: 0,
    leftPadding: padding,
    topPadding: padding,
    rightPadding: padding,
    bottomPadding: padding,
    hoveredLink: "",
    implicitWidth: derived((self) => self.$text.natural() + self.leftPadding + self.rightPadding),
    implicitHeight: derived((self) => {
      const made = self.$text.implicit();
      return made.height + made.below + self.topPadding + self.bottomPadding;
    }),
    contentWidth: derived((self) => layout(self).width),
    contentHeight: derived((self) => layout(self).height),
    paintedWidth: derived((self) => layout(self).width),
    paintedHeight: derived((self) => layout(self).height),
    lineCount: derived((self) => layout(self).count),
    truncated: derived((self) => layout(self).truncated),
    baselineOffset: derived((self) => origin(self, layout(self)) + layout(self).ascent),
  },
  signals: ["linkActivated", "linkHovered"],
  enums: {
    AlignLeft: 1,
    AlignRight: 2,
    AlignHCenter: 4,
    AlignJustify: 8,
    AlignTop: 32,
    AlignBottom: 64,
    AlignVCenter: 128,
    Normal: 0,
    Outline: 1,
    Raised: 2,
    Sunken: 3,
    PlainText: 0,
    RichText: 1,
    AutoText: 2,
    MarkdownText: 3,
    StyledText: 4,
    ElideLeft: 0,
    ElideRight: 1,
    ElideMiddle: 2,
    ElideNone: 3,
    NoWrap: 0,
    WordWrap: 1,
    WrapAnywhere: 3,
    WrapAtWordBoundaryOrAnywhere: 4,
    Wrap: 4,
    QtRendering: 0,
    NativeRendering: 1,
    CurveRendering: 2,
    DefaultRenderTypeQuality: -1,
    LowRenderTypeQuality: 26,
    NormalRenderTypeQuality: 52,
    HighRenderTypeQuality: 104,
    VeryHighRenderTypeQuality: 208,
    ProportionalHeight: 0,
    FixedHeight: 1,
    FixedSize: 0,
    HorizontalFit: 1,
    VerticalFit: 2,
    Fit: 3,
  },
  methods: {
    // The font the text is set in: its size is what `fontSizeMode` found.
    get fontInfo() {
      const used = layout(this).font;
      const { family, styleName, pointSize, pixelSize } = this.font;
      const scale = pixelSize ? used.size / pixelSize : 1;
      return {
        family,
        styleName,
        weight: used.weight,
        bold: used.weight >= 600,
        italic: used.italic,
        pixelSize: used.size,
        pointSize: pointSize * scale,
      };
    },
    // The link at a point of the item, or an empty string.
    linkAt(x, y) {
      const frame = this.$node.getBoundingClientRect();
      for (const anchor of this.$markup.querySelectorAll("a[data-link]")) {
        for (const box of anchor.getClientRects()) {
          const left = box.left - frame.left;
          const top = box.top - frame.top;
          if (x >= left && x < left + box.width && y >= top && y < top + box.height) return anchor.dataset.link;
        }
      }
      return "";
    },
  },
  setup(self) {
    const content = document.createElement("div");
    content.className = "qq-text";
    self.$node.append(content);
    self.$markup = content;
    const state = (self.$text = {
      font: lazy(self, () => describe(self.font)),
      // The string, and what it is: plain (0), styled (1) or rich (2).
      source: lazy(self, () => {
        const text = String(self.text ?? "");
        const format = self.textFormat;
        const kind = format === 1 ? 2 : format === 4 || (format === 2 && mightBeRichText(text)) ? 1 : 0;
        return { kind, text: kind ? text : capitalized(text, self.font.capitalization) };
      }),
      natural: lazy(self, () => natural(self, state)),
      implicit: lazy(self, () => laid(self, state, false)),
      // The implicit layout is the layout, unless the height or
      // `fontSizeMode` has a say.
      layout: lazy(self, () => {
        const bounded = self.fontSizeMode !== 0 || (self.elide === ELIDE_RIGHT && sized(self, "width") && sized(self, "height"));
        return bounded ? laid(self, state, true) : state.implicit();
      }),
    });
    // Markup only: plain text has no links.
    let listening = false;
    const hover = (link) => {
      if (!slot(self, "hoveredLink").write(link)) return;
      flush();
      self.linkHovered(link);
    };
    const listen = () => {
      listening = true;
      const linked = (event) => event.target.closest?.("a[data-link]")?.dataset.link;
      content.addEventListener("click", (event) => {
        const link = linked(event);
        if (link === undefined) return;
        // A link that also has an `href` is the program's to follow on
        // a plain press, as in Qt; with a modifier (a new tab, a new
        // window) it is the browser's.
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        self.linkActivated(link);
      });
      content.addEventListener("mouseover", (event) => hover(linked(event) ?? ""));
      content.addEventListener("mouseout", () => hover(""));
    };
    let shown = {};
    effect(
      () => {
        const made = layout(self);
        const room = self.width - self.leftPadding - self.rightPadding;
        const align = self.effectiveHorizontalAlignment;
        // A line wider than the item overflows on the side away from the
        // one it is aligned to.
        const width = made.kind ? room : Math.max(room, made.span);
        const left = self.leftPadding + (room - width) * (align === 2 ? 1 : align === 4 ? 0.5 : 0);
        // CSS centres a line's text in a taller line; Qt leaves the room
        // below it.
        const lift = made.kind ? 0 : (made.pitch - metrics(made.font).height) / 2;
        return {
          made,
          left,
          top: origin(self, made) - lift,
          width,
          align: ALIGNS[align] ?? "left",
          justified: align === 8 && !made.kind && made.wrapped,
          // Where a type of text underlines letters of what is written.
          marks: made.kind || !state.marks ? "" : state.marks(made).join(" "),
          capitals: made.kind ? ["", "uppercase", "lowercase", "", "capitalize"][self.font.capitalization] : "",
          color: css(self.color),
          link: css(self.linkColor),
          shadow: shadow(self.style, css(self.styleColor)),
        };
      },
      (next) => {
        const { made } = next;
        const style = content.style;
        if (made.kind) {
          if (shown.kind !== made.kind || shown.text !== made.text || shown.inert !== made.inert) {
            const fresh = elements(made.text);
            if (shown.kind !== undefined || !same(content, fresh)) content.replaceChildren(fresh);
          }
          clothe(content, made.look);
          style.setProperty("--qq-link", next.link);
          style.textTransform = next.capitals;
          if (!listening) listen();
        } else {
          if (shown.kind) {
            content.className = "qq-text";
            style.cssText = "";
            shown = {};
          }
          if (shown.font !== made.font || shown.pitch !== made.pitch) {
            dress(style, made.font);
            style.lineHeight = `${made.pitch}px`;
          }
          if (next.justified) justify(content, made, next.width);
          else if (shown.text !== made.text || shown.justified || shown.marks !== next.marks) write(content, made.text, next.marks);
          style.width = `${next.width}px`;
        }
        style.left = `${next.left}px`;
        style.top = `${next.top}px`;
        style.textAlign = next.align;
        style.color = next.color;
        style.textShadow = next.shadow;
        shown = { kind: made.kind, text: made.text, font: made.font, pitch: made.pitch, justified: next.justified, marks: next.marks };
      },
    );
  },
});
