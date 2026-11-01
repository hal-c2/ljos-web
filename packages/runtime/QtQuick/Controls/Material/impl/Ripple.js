// Ripple: what a Material control shows of being pressed, hovered or in
// focus. A layer of the colour over it that fades in while it is `active`,
// and a wave that spreads from where it was pressed and fades away when it
// is let go. The times and the order of things are Qt's
// (`qquickmaterialripple.cpp`), its oddities with them.
import { onCleanup } from "solid-js";
import { defineType, effect } from "../../../../object.js";
import { clock } from "../../../animation/clock.js";
import { colorValue, css } from "../../../color.js";
import { rules } from "../../../compute.js";
import { Item } from "../../../Item.js";
import { part } from "../../painting.js";
import { untrack } from "#kernel";

rules(`
.qq-ripple-wave { border-radius: 50%; }
`);

// A press is a wave only if it lasts this long.
const DELAY = 80;
const FADE_IN = 120;
const DECAY = 333;
// A wave spreads as something that falls would.
const ACCELERATION = 1024;

// `qRound`: a half goes away from nothing.
const round = (value) => Math.sign(value) * Math.round(Math.abs(value));

export const Ripple = defineType("Ripple", Item, {
  properties: { color: "#000000", clipRadius: 0, pressed: false, active: false, anchor: null, trigger: 0 },
  resolve: { color: colorValue },
  enums: { Press: 0, Release: 1 },
  setup(self) {
    const node = self.$node;
    const back = part(node);
    back.style.opacity = "0";
    // What the item was when it was last looked at.
    let seen = null;
    // What the layer last faded towards, and the fading that is going on.
    let active = false;
    let fade = null;
    // How long until a press is a wave, how many waves there are to be, and
    // the ones there are: the first of them are those.
    let delay = -1;
    let entered = 0;
    const waves = [];

    const diameter = () => Math.hypot(seen.width, seen.height);

    // Where a wave starts: where the button it is anchored to was pressed,
    // or on the circle around the ripple towards that, if it is outside it.
    function anchorPoint() {
      const centre = { x: seen.width / 2, y: seen.height / 2 };
      const anchor = self.anchor;
      if (!anchor) return centre;
      const pressed = typeof anchor.pressX === "number" ? { x: anchor.pressX, y: anchor.pressY } : centre;
      const point = self.mapFromItem(anchor, pressed.x, pressed.y);
      const reach = diameter() / 2;
      if (Math.hypot(point.x - centre.x, point.y - centre.y) < reach) return point;
      const towards = Math.atan2(point.y - centre.y, point.x - centre.x);
      return { x: centre.x + reach * Math.cos(towards), y: centre.y + reach * Math.sin(towards) };
    }

    function place(wave) {
      const { element, value, to, width, height, anchor } = wave;
      const left = 1 - (to > 0 ? value / to : 1);
      const x = round((width - value) / 2 + left * (anchor.x - width / 2));
      const y = round((height - value) / 2 + left * (anchor.y - height / 2));
      element.style.transform = `translate(${x}px,${y}px)`;
      element.style.width = element.style.height = `${value}px`;
    }

    // What a wave is told of the ripple when that is looked at.
    function tell(wave) {
      wave.to = diameter();
      wave.anchor = anchorPoint();
      wave.width = seen.width;
      wave.height = seen.height;
      wave.element.style.backgroundColor = seen.colour;
    }

    function spread() {
      const wave = { element: part(node, "qq-ripple-wave"), time: 0, span: Math.round(1000 * Math.sqrt(diameter() / 2 / ACCELERATION)), from: 0, value: 0 };
      wave.moving = true;
      wave.leaving = false;
      waves.push(wave);
    }

    // A wave leaves from where it has come to, fading. One that was leaving
    // already starts over.
    function leave(wave) {
      wave.leaving = true;
      wave.from = wave.value;
      wave.span = DECAY;
      wave.time = 0;
      wave.moving = true;
    }

    function move(wave, delta) {
      if (!wave.moving) return;
      wave.time += delta;
      if (wave.time >= wave.span) {
        wave.time = wave.span;
        wave.moving = false;
      }
      wave.value = wave.from + (wave.to - wave.from) * (wave.span > 0 ? wave.time / wave.span : 1);
      if (wave.leaving) wave.element.style.opacity = String(1 - wave.time / DECAY);
      place(wave);
      if (wave.leaving && !wave.moving) {
        wave.element.remove();
        waves.splice(waves.indexOf(wave), 1);
      }
    }

    const job = {
      skew: 0,
      advance(delta) {
        if (fade) {
          fade.time += delta;
          const done = fade.time >= fade.span;
          const faded = done ? 1 : fade.time / fade.span;
          back.style.opacity = String(active ? faded : 1 - faded);
          if (done) fade = null;
        }
        for (const wave of [...waves]) move(wave, delta);
        if (delay >= 0) {
          delay -= delta;
          if (delay <= 0) enter();
        }
        rest();
      },
      idle: () => (fade || waves.some((wave) => wave.moving) ? 0 : delay),
    };
    onCleanup(() => clock.remove(job));

    // On the clock while there is something to wait for.
    function rest() {
      if (fade || delay >= 0 || waves.some((wave) => wave.moving)) clock.add(job);
      else clock.remove(job);
    }

    // Qt's `updatePaintNode`: the layer, then the waves there are to be,
    // then the first of those there are too many of leaves, once for each.
    function look() {
      if (!seen) return;
      if (seen.active !== active) {
        active = seen.active;
        fade = { time: 0, span: active ? FADE_IN : DECAY };
      }
      const { width, height } = seen;
      const size = diameter();
      // A circle around the item, or the item with its corners.
      const cornered = Math.abs(seen.radius) > 1e-12;
      back.style.transform = cornered ? "" : `translate(${round((width - size) / 2)}px,${round((height - size) / 2)}px)`;
      back.style.width = `${cornered ? width : size}px`;
      back.style.height = `${cornered ? height : size}px`;
      back.style.borderRadius = `${cornered ? seen.radius : size / 2}px`;
      back.style.backgroundColor = seen.colour;
      for (let index = 0; index < entered; index++) {
        if (!waves[index]) spread();
        tell(waves[index]);
      }
      for (let surplus = waves.length - entered; surplus > 0; surplus--) {
        leave(waves[0]);
        tell(waves[0]);
      }
      rest();
    }

    function enter() {
      delay = -1;
      entered++;
      look();
    }

    function exit() {
      delay = -1;
      if (entered > 0) {
        entered--;
        look();
      } else rest();
    }

    effect(
      () => ({
        width: self.width,
        height: self.height,
        colour: css(self.color),
        radius: self.clipRadius,
        active: Boolean(self.active),
        clip: self.clip,
      }),
      (next) => {
        seen = next;
        // What clips it has its corners.
        node.style.borderRadius = next.clip && next.radius ? `${next.radius}px` : "";
        untrack(look);
      },
    );

    let pressed = false;
    effect(
      () => Boolean(self.pressed),
      (now) => {
        if (now === pressed) return;
        pressed = now;
        untrack(() => {
          const onRelease = self.trigger === 1;
          if (!self.enabled) exit();
          else if (now === onRelease) exit();
          else if (now) {
            if (delay < 0) delay = DELAY;
            rest();
          } else enter();
        });
      },
    );
  },
});
