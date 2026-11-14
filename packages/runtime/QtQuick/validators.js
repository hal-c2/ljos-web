// IntValidator, DoubleValidator, RegularExpressionValidator: what a
// TextInput may hold. Each says of a string whether it is wrong (0), could
// still become right (1) or is right (2), as Qt's `validate` does.
import { defineType, QtObject } from "../object.ts";

const INVALID = 0;
const INTERMEDIATE = 1;
const ACCEPTABLE = 2;

export const IntValidator = defineType("IntValidator", QtObject, {
  properties: { bottom: -2147483648, top: 2147483647 },
  methods: {
    $validate(text) {
      const { bottom, top } = this;
      if (!/^[+-]?\d*$/.test(text)) return INVALID;
      if (text === "") return INTERMEDIATE;
      const minus = text[0] === "-";
      const plus = text[0] === "+";
      if ((bottom >= 0 && minus) || (top < 0 && plus)) return INVALID;
      if (text.length === 1 && (minus || plus)) return INTERMEDIATE;
      const entered = Number(text);
      if (entered >= bottom && entered <= top) return ACCEPTABLE;
      if (entered < 0) return entered < bottom ? INVALID : INTERMEDIATE;
      // Too large already, unless it has no more digits than the top: then
      // a digit may still be taken away.
      const digits = text.length - (plus ? 1 : 0);
      const most = top !== 0 ? Math.floor(Math.log10(Math.abs(top))) + 1 : 1;
      return entered > top && -entered < bottom && digits > most ? INVALID : INTERMEDIATE;
    },
  },
});

export const DoubleValidator = defineType("DoubleValidator", QtObject, {
  properties: { bottom: -Infinity, top: Infinity, decimals: -1, notation: 1 },
  enums: { StandardNotation: 0, ScientificNotation: 1 },
  methods: {
    $validate(text) {
      const { bottom, top, decimals } = this;
      const standard = this.notation === 0;
      if (!(standard ? /^[+-]?\d*\.?\d*$/ : /^[+-]?\d*\.?\d*(e[+-]?\d*)?$/i).test(text)) return INVALID;
      if (decimals >= 0 && (/\.(\d*)/.exec(text)?.[1].length ?? 0) > decimals) return INVALID;
      if (text === "") return INTERMEDIATE;
      if ((bottom >= 0 && text[0] === "-") || (top < 0 && text[0] === "+")) return INVALID;
      if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(text)) return INTERMEDIATE;
      const entered = Number(text);
      if (entered >= bottom && entered <= top) return ACCEPTABLE;
      if (standard) {
        // More digits before the point than either bound has can never
        // come back in range.
        const most = Math.max(Math.abs(bottom), Math.abs(top));
        if (Number.isFinite(most) && Math.abs(entered) > 10 ** String(Math.trunc(most)).length - 10 ** -Math.max(decimals, 0)) {
          return INVALID;
        }
      }
      return INTERMEDIATE;
    },
  },
});

const whole = new WeakMap();

export const RegularExpressionValidator = defineType("RegularExpressionValidator", QtObject, {
  properties: { regularExpression: undefined },
  methods: {
    // Qt asks its expressions whether a string could still become a match;
    // JavaScript's cannot say, so nothing is ever wrong, only not yet right.
    $validate(text) {
      const expression = this.regularExpression;
      if (!(expression instanceof RegExp)) return ACCEPTABLE;
      let anchored = whole.get(expression);
      if (!anchored)
        whole.set(expression, (anchored = new RegExp(`^(?:${expression.source})$`, expression.flags.replace(/[gy]/g, ""))));
      return anchored.test(text) ? ACCEPTABLE : INTERMEDIATE;
    },
  },
});
