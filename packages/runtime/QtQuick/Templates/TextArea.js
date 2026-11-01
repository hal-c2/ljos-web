// TextArea: lines of text to edit, as a style dresses them, and what a
// Flickable scrolls when there are more of them than it has room for.
import { defineType, derived, effect, QtObject, slot } from "../../object.js";
import { Rect } from "../../QtQml/values.js";
import { lazy, sized } from "../compute.js";
import { advance, describe, metrics } from "../font.js";
import { TextEdit } from "../TextInput.js";
import { methods, properties, resolve, setup, signals } from "./field.js";
import { ScrollView } from "./ScrollView.js";
import { signal, untrack } from "#kernel";

// The font Qt makes a text in before it is told of any: an area is as tall
// as a line of it until its style says how tall it is.
const PLAIN = { family: "Sans Serif", pixelSize: 12, weight: 400 };
const line = () => metrics(describe(PLAIN)).height;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// How far down its room the text starts: `verticalAlignment`.
const dropped = (align, room) => Math.max(align === 64 ? room : align === 128 ? room / 2 : 0, 0);

// Where the cursor is at a position of the text, Qt's `positionToRectangle`,
// in the lines the area's size is found from.
function caret(self, position) {
  const spec = self.$edit.font();
  const tall = metrics(spec).height;
  const { lines } = self.$edit.layout();
  // Where in the text the paragraph of a line starts.
  let from = 0;
  let index = 0;
  let before = 0;
  let across = 0;
  for (; index < lines.length; index++) {
    const row = lines[index];
    const whole = row.paragraph ?? row.text;
    const start = row.start ?? 0;
    const end = row.end ?? whole.length;
    const closes = end === whole.length;
    const at = position - from;
    // After the last letter of a line that was broken is before the first
    // of the next.
    if (at < end || (closes && at === end) || index === lines.length - 1) {
      before = advance(spec, whole.slice(start, Math.max(Math.min(at, end), start)));
      across = row.advance;
      break;
    }
    if (closes) from += end + 1;
  }
  const { leftPadding, topPadding } = self;
  const align = self.effectiveHorizontalAlignment;
  const room = sized(self, "width") ? self.width - leftPadding - self.rightPadding - across : 0;
  const x = Math.max(align === 2 ? room : align === 4 ? room / 2 : 0, 0);
  const y = dropped(self.verticalAlignment, self.height - topPadding - self.bottomPadding - self.contentHeight);
  return new Rect(leftPadding + x + before, topPadding + y + index * tall, 1, tall);
}

// Qt's `ensureCursorVisible`: the Flickable is moved to where the cursor is.
function follow(self, flickable, at, next) {
  const { contentX, contentY, width, height } = flickable;
  const { leftPadding, topPadding, rightPadding, bottomPadding } = self;
  let x = contentX;
  let y = contentY;
  if (at.left <= contentX + leftPadding) x = at.left - leftPadding;
  // The letter after the cursor is kept in sight too.
  else if (next && next.y === at.y && next.right >= contentX + leftPadding + width - rightPadding) x = next.right - width + rightPadding;
  else if (at.right >= contentX + leftPadding + width - rightPadding) x = at.right - width + rightPadding;
  if (at.top <= contentY + topPadding) y = at.top - topPadding;
  else if (at.bottom >= contentY + topPadding + height - bottomPadding && at.bottom <= flickable.contentHeight) {
    y = at.bottom - height + bottomPadding;
  }
  slot(flickable, "contentX").write(x);
  slot(flickable, "contentY").write(y);
}

// The Flickable of a ScrollView an area was put in: it is attached to that
// one without being told.
function viewed(self) {
  const content = self.parent;
  const flickable = content?.parent;
  if (!flickable?.$viewport || flickable.contentItem !== content) return null;
  return flickable.parent?.$type.chain.includes(ScrollView) ? flickable : null;
}

const TextAreaAttached = defineType("TextAreaAttached", QtObject, {
  properties: { flickable: null },
  setup(self, props) {
    const of = props.$attachee;
    if (!of.$viewport) {
      return console.warn("TextArea attached property must be attached to an object deriving from Flickable");
    }
    let before = null;
    effect(
      () => self.flickable,
      (area) => {
        if (area === before) return;
        before?.$field.attach(null);
        before = area;
        area?.$field.attach(of);
      },
    );
  },
});

export const TextArea = defineType("TextArea", TextEdit, {
  properties: {
    ...properties,
    implicitHeight: derived(line),
    cursorRectangle: derived((self) => self.$field.caret()),
  },
  resolve,
  signals,
  attached: TextAreaAttached,
  methods: {
    ...methods,
    positionToRectangle(position) {
      return caret(this, position);
    },
    // The middle of the cursor, which is where Qt asks an area for its menu.
    $cursor() {
      const { x, y, width, height } = untrack(() => this.cursorRectangle);
      return { x: x + width / 2, y: y + height / 2 };
    },
  },
  setup(self) {
    const [attached, attach] = signal(null, self.$owner);
    const flickable = lazy(self, () => attached() ?? viewed(self));
    setup(self, flickable);
    const mine = self.$field;
    mine.attach = attach;
    mine.caret = lazy(self, () => caret(self, self.cursorPosition));

    // An area that is attached is in the Flickable's content, and its
    // background in the Flickable, behind what moves.
    let scrolled = null;
    let behind = null;
    effect(
      () => [flickable(), self.background, attached()],
      ([flick, item, told]) =>
        untrack(() => {
          if (behind && (behind !== item || scrolled !== flick)) {
            scrolled.$remove(behind);
            if (behind === item) self.$keep(item, true);
            behind = null;
          }
          if (flick !== scrolled) {
            if (scrolled && !told && self.parent === scrolled.contentItem) {
              scrolled.contentItem.$remove(self);
              slot(self, "parent").write(null);
            }
            scrolled = flick;
            if (flick && self.parent !== flick.contentItem) {
              slot(self, "parent").write(flick.contentItem);
              flick.contentItem.$add(self);
            }
          }
          if (!flick || !item || behind) return;
          behind = item;
          self.$remove(item);
          slot(item, "parent").write(flick);
          flick.$add(item);
        }),
    );

    // It is as big as the Flickable, or as its content where that is
    // bigger. Qt works that out when either changes, and not when the area
    // is told to wrap.
    effect(
      () => {
        const flick = flickable();
        return flick ? [flick, flick.width, flick.height, flick.contentWidth, flick.contentHeight] : [null];
      },
      ([flick, width, height, contentWidth, contentHeight]) => {
        const wraps = flick && untrack(() => self.wrapMode) !== 0;
        slot(self, "width").place(flick ? (wraps ? width : Math.max(width, contentWidth)) : undefined);
        slot(self, "height").place(flick ? Math.max(height, contentHeight) : undefined);
      },
    );

    // And the content is as big as the area would like to be, once the text
    // is of some size: Qt says so when that changes, and its Flickable
    // comes back to where it has content.
    let wide = 0;
    let tall;
    effect(
      () => {
        const flick = flickable();
        return flick ? [flick, self.contentWidth, self.contentHeight, self.implicitWidth, self.implicitHeight] : [null];
      },
      ([flick, contentWidth, contentHeight, width, height]) => {
        if (!flick) return;
        tall ??= line();
        if (contentWidth === wide && contentHeight === tall) return;
        wide = contentWidth;
        tall = contentHeight;
        untrack(() => {
          const across = width !== flick.contentWidth;
          const down = height !== flick.contentHeight;
          slot(flick, "contentWidth").provide(width);
          slot(flick, "contentHeight").provide(height);
          if (across) slot(flick, "contentX").write(clamp(flick.contentX, flick.$minX(), flick.$maxX()));
          if (down) slot(flick, "contentY").write(clamp(flick.contentY, flick.$minY(), flick.$maxY()));
        });
      },
    );

    // The cursor is kept in sight.
    effect(
      () => {
        const flick = flickable();
        if (!flick) return [null];
        const position = self.cursorPosition;
        return [flick, mine.caret(), position < self.length ? caret(self, position + 1) : null];
      },
      ([flick, at, next]) => {
        if (flick) untrack(() => follow(self, flick, at, next));
      },
    );
  },
});
