// MaterialTextContainer and FloatingPlaceholderText: what a Material text
// field is in, and the text that says what it is for, which moves up out of
// the way when the field has the focus or a text. What is painted and when
// things move are Qt's (`qquickmaterialtextcontainer.cpp`,
// `qquickmaterialplaceholdertext.cpp`).
import { defineType, derived, effect, slot } from "../../../../object.js";
import { curve } from "../../../animation/easing.js";
import { colorValue, css } from "../../../color.js";
import { Item } from "../../../Item.js";
import { PlaceholderText } from "../../impl/texts.js";
import { arc, given, pictured, timed } from "../../painting.js";
import { untrack } from "#kernel";

const MOVE = 300;
const CORNER = 4;
// Between the outline and the text in its gap.
const GAP = 4;

export const MaterialTextContainer = defineType("MaterialTextContainer", Item, {
  properties: {
    filled: false,
    controlHasActiveFocus: false,
    fillColor: "#000000",
    outlineColor: "#000000",
    focusedOutlineColor: "#000000",
    focusAnimationProgress: 0,
    placeholderTextWidth: 0,
    placeholderTextHAlign: 1,
    controlHasText: false,
    placeholderHasText: false,
    horizontalPadding: 0,
  },
  resolve: { fillColor: colorValue, outlineColor: colorValue, focusedOutlineColor: colorValue },
  enums: { AlignLeft: 1, AlignRight: 2, AlignHCenter: 4, AlignJustify: 8 },
  setup(self) {
    const progress = slot(self, "focusAnimationProgress");
    const animation = timed();
    let now = null;

    // Where the progress is to be: all the way when there is a text for the
    // gap and the field has a text or the focus.
    function update(create) {
      if (now.filled) return animation.stop();
      const target = now.placeholder && (now.text || now.focus) ? 1 : 0;
      if (!animation.running() && !create) return void progress.write(target);
      // One that takes over from another has the time that one had left.
      const span = animation.running() ? animation.left() : MOVE;
      const from = untrack(() => self.focusAnimationProgress);
      animation.stop();
      animation.start(span, (time) => progress.write(from + (target - from) * (span > 0 ? time / span : 1)));
    }

    // Only an outline without a text in the field opens and closes its gap
    // in time. The line under a filled one is there at once, and only for a
    // field that has a text.
    function turned() {
      animation.stop();
      if (!now.filled && !now.text && now.placeholder) return update(true);
      if (now.filled && (now.text || !now.focus)) progress.write(now.focus ? 1 : 0);
    }

    effect(
      () => ({
        filled: Boolean(self.filled),
        focus: Boolean(self.controlHasActiveFocus),
        text: Boolean(self.controlHasText),
        placeholder: Boolean(self.placeholderHasText),
      }),
      (next) => {
        const before = now ?? { focus: false };
        now = next;
        if (next.focus !== before.focus) turned();
        if (next.text !== before.text || next.placeholder !== before.placeholder) update(false);
      },
    );

    pictured(
      self,
      () => ({
        filled: Boolean(self.filled),
        focus: Boolean(self.controlHasActiveFocus),
        // The colour of the outline is by the field itself.
        focused: Boolean(self.parent?.activeFocus),
        fill: css(self.fillColor),
        outline: css(self.outlineColor),
        accent: css(self.focusedOutlineColor),
        progress: self.focusAnimationProgress,
        half: self.placeholderTextWidth / 2,
        align: self.placeholderTextHAlign,
        padding: self.horizontalPadding,
      }),
      (context, state, width, height) => {
        const { filled, progress, half } = state;
        const pen = filled ? 1 : state.focus ? 2 : 1;
        const w = width - pen;
        const h = height - pen;
        const middle = state.align === 4 ? width / 2 : state.align === 2 ? width - half - state.padding : state.padding + half;
        // An outline with a gap starts at the gap's left end and ends at its
        // right one; anything else goes all the way around.
        const whole = filled || progress === 0;
        const start = whole ? CORNER : middle - progress * half - GAP - pen;
        context.translate(pen / 2, pen / 2);
        context.lineWidth = pen;
        context.lineCap = "square";
        context.lineJoin = "bevel";
        context.beginPath();
        context.moveTo(start, 0);
        arc(context, 0, 0, CORNER * 2, CORNER * 2, 90, 90);
        if (filled) {
          context.lineTo(0, h);
          context.lineTo(w, h);
        } else {
          context.lineTo(0, h - CORNER * 2);
          arc(context, 0, h - CORNER * 2, CORNER * 2, CORNER * 2, 180, 90);
          context.lineTo(w - CORNER * 2, h);
          arc(context, w - CORNER * 2, h - CORNER * 2, CORNER * 2, CORNER * 2, 270, 90);
        }
        context.lineTo(w, CORNER);
        arc(context, w - CORNER * 2, 0, CORNER * 2, CORNER * 2, 0, 90);
        context.lineTo(filled || Math.abs(progress) < 1e-12 ? start : middle + progress * half + GAP, 0);
        context.strokeStyle = filled ? state.fill : state.focused ? state.accent : state.outline;
        if (filled) {
          context.fillStyle = state.fill;
          context.fill();
        }
        context.stroke();
        if (!filled) return;
        // The line under a filled one: in whole pixels, as Qt draws it, and
        // the one of a field in focus over it, from the middle outwards.
        const across = Math.trunc(w);
        const under = Math.trunc(h);
        if (Math.abs(progress - 1) > 1e-12) {
          context.strokeStyle = state.outline;
          context.beginPath();
          context.moveTo(0, under);
          context.lineTo(across, under);
          context.stroke();
        }
        if (Math.abs(progress) > 1e-12) {
          const reach = Math.trunc(Math.trunc(progress * w) / 2);
          const centre = Math.trunc(w / 2);
          context.strokeStyle = state.accent;
          context.lineWidth = 2;
          context.beginPath();
          context.moveTo(centre - reach, under);
          context.lineTo(centre + reach + 1, under);
          context.stroke();
        }
      },
    );
  },
});

const kind = (item, name) => Boolean(item?.$type?.chain.some((type) => type.typeName === name));
const outSine = curve(18);
const FLOATING = 0.8;

export const FloatingPlaceholderText = defineType("FloatingPlaceholderText", PlaceholderText, {
  properties: {
    filled: false,
    controlHasActiveFocus: false,
    controlHasText: false,
    // As tall as the text is when it is not made smaller.
    largestHeight: derived((self) => Math.trunc(self.implicitHeight)),
    verticalPadding: 0,
    controlImplicitBackgroundHeight: 0,
    controlHeight: 0,
    leftPadding: 0,
    floatingLeftPadding: 0,
    transformOrigin: 4,
  },
  resolve: {
    // It is made smaller towards the side its text is on.
    transformOrigin(self) {
      const align = self.effectiveHorizontalAlignment;
      return align === 2 ? 5 : align === 4 ? 4 : 3;
    },
    // Qt's has a `leftPadding` of its own in front of the text's: it is
    // where the whole text is, and the text itself has none.
    leftPadding: () => 0,
  },
  setup(self) {
    const x = slot(self, "x");
    const y = slot(self, "y");
    const scale = slot(self, "scale");
    const animation = timed();
    let now = null;
    effect(
      () => {
        const filled = Boolean(self.filled);
        const focus = Boolean(self.controlHasActiveFocus);
        const typed = Boolean(self.controlHasText);
        const said = String(self.text ?? "") !== "";
        const floats = (focus || typed) && (filled || said);
        const field = self.parent;
        const area = kind(field, "TextArea");
        const inset = area || kind(field, "TextField") ? (field.topInset ?? 0) : 0;
        const largest = self.largestHeight;
        // In the middle of the field, or of the one line of an area that
        // has room for more.
        const resting =
          area && self.controlHeight >= field.implicitHeight
            ? (self.controlImplicitBackgroundHeight - largest) / 2 + inset
            : (self.controlHeight - self.height) / 2;
        return {
          focus,
          // A field with a text has it up there already.
          moves: !typed && (filled || said),
          x: floats ? self.floatingLeftPadding : (given(self, "leftPadding") ?? 0),
          y: floats ? (filled ? self.verticalPadding : -largest / 2 + inset) : resting,
          scale: floats ? FLOATING : 1,
        };
      },
      (next) => {
        const turned = now !== null && next.focus !== now.focus;
        now = next;
        // One that takes over from another has the time that one had left:
        // but the focus going the other way starts anew.
        const span = animation.running() && !turned ? animation.left() : MOVE;
        const moves = next.moves && (animation.running() || turned);
        animation.stop();
        if (!moves) {
          x.write(next.x);
          y.write(next.y);
          scale.write(next.scale);
          return;
        }
        const from = untrack(() => ({ x: self.x, y: self.y, scale: self.scale }));
        animation.start(span, (time) => {
          const done = span > 0 ? time / span : 1;
          const eased = outSine(done);
          x.write(from.x + (next.x - from.x) * eased);
          y.write(from.y + (next.y - from.y) * eased);
          // Only the place eases: the size changes evenly, as in Qt.
          scale.write(from.scale + (next.scale - from.scale) * done);
        });
      },
    );
  },
});
