// AnimatedSprite: the frames of one sheet, one after the other.
//
// It is a sprite of its own that it plays: what it says of the sheet is what
// that sprite is given. Time is the clock's, so a test moves it.
import { onCleanup } from "solid-js";
import { defineType, derived, effect, settle, slot } from "../object.js";
import { clock } from "./animation/clock.js";
import { Item } from "./Item.js";
import { Sprite } from "./Sprite.js";
import { painted, Player } from "./sprites.js";
import { untrack } from "#kernel";

const FINAL = 1;

// The size of a frame when the item does not say: the sheet's, shared out
// among the frames, once the sheet is there.
const natural = (measure) => derived((self) => {
  const sheet = self.$sprite.$loaded();
  return sheet ? measure(sheet, Math.max(1, self.frameCount)) : 0;
});

export const AnimatedSprite = defineType("AnimatedSprite", Item, {
  properties: {
    running: true,
    paused: false,
    interpolate: true,
    loops: -1,
    currentFrame: 0,
    finishBehavior: 0,
    source: "",
    reverse: false,
    frameSync: false,
    frameCount: 1,
    frameWidth: natural((sheet, count) => Math.floor(sheet.naturalWidth / count)),
    frameHeight: natural((sheet) => sheet.naturalHeight),
    frameX: 0,
    frameY: 0,
    frameRate: 0,
    frameDuration: 0,
    implicitWidth: derived((self) => self.frameWidth),
    implicitHeight: derived((self) => self.frameHeight),
  },
  enums: { Infinite: -1, FinishAtInitialFrame: 0, FinishAtFinalFrame: FINAL },
  signals: ["finished"],
  methods: {
    start() {
      this.running = true;
    },
    stop() {
      this.running = false;
    },
    // Stopped in between, so that one that was running starts over too.
    restart() {
      this.stop();
      settle();
      this.start();
    },
    pause() {
      this.paused = true;
    },
    resume() {
      this.paused = false;
    },
    // Goes `frames` on, or back, around the sheet: for one that is paused.
    advance(frames = 1) {
      if (!frames) return;
      const count = this.$sprite.$sheet[0];
      slot(this, "currentFrame").write((((this.currentFrame + frames) % count) + count) % count);
      settle();
    },
  },
  setup(self) {
    const sprite = (self.$sprite = Sprite({
      get source() {
        return self.source;
      },
      get reverse() {
        return self.reverse;
      },
      get frameSync() {
        return self.frameSync;
      },
      get frameCount() {
        return self.frameCount;
      },
      get frameWidth() {
        return self.frameWidth;
      },
      get frameHeight() {
        return self.frameHeight;
      },
      get frameX() {
        return self.frameX;
      },
      get frameY() {
        return self.frameY;
      },
      get frameRate() {
        return self.frameRate;
      },
      get frameDuration() {
        return self.frameDuration;
      },
    }));
    const player = new Player();
    const paint = painted(self);
    // How many times it went around, and how far the frame shown is on its
    // way to the next.
    let loop = 0;
    let progress = 0;
    const job = {
      skew: 0,
      advance(delta) {
        const count = sprite.$sheet[0];
        const before = self.currentFrame;
        const loops = self.loops;
        player.advance(delta);
        const each = player.span / count;
        let frame;
        progress = 0;
        if (each > 0) {
          // The last frame of the last time around is not on its way to any.
          const most = loops > 0 && loop === loops - 1 ? count - 1 : count;
          const exact = Math.min(Math.max((player.now - player.since) / each, 0), most);
          const whole = Math.floor(exact);
          frame = Math.min(whole, count - 1);
          if (self.interpolate && whole < count) progress = exact - whole;
          if (before > frame) loop++;
        } else {
          // No time: a frame for each frame drawn.
          frame = before + 1;
          if (frame >= count) {
            frame = 0;
            loop++;
          }
        }
        const done = loops > 0 && loop >= loops;
        if (done) {
          frame = self.finishBehavior === FINAL ? count - 1 : 0;
          progress = 0;
        }
        slot(self, "currentFrame").write(frame);
        if (done) {
          slot(self, "running").write(false);
          settle();
          self.finished();
        }
        paint(sprite, frame, progress, self.width, self.height, self.smooth);
      },
      // Until the frame after this one is due, when none is blended.
      idle() {
        const count = sprite.$sheet[0];
        const each = player.span / count;
        if (!(each > 0) || (count > 1 && self.interpolate)) return 0;
        return Math.max(1, Math.min(player.left(), each - ((player.now - player.since) % each)));
      },
    };
    onCleanup(() => clock.remove(job));
    // Each run starts over: the sprite, the frame, and the times around.
    let ran = false;
    effect(
      () => [Boolean(self.running), Boolean(self.paused), self.visible && sprite.$loaded()],
      ([running, paused, sheet]) => {
        if (running && !ran) {
          loop = 0;
          untrack(() => player.load([sprite]));
          slot(self, "currentFrame").write(0);
        }
        ran = running;
        if (running && !paused && sheet) clock.add(job);
        else clock.remove(job);
      },
    );
    effect(
      () => [
        self.currentFrame,
        self.width,
        self.height,
        self.smooth,
        sprite.$loaded(),
        self.frameCount,
        self.frameX,
        self.frameY,
        self.frameWidth,
        self.frameHeight,
        self.reverse,
      ],
      ([frame, width, height, smooth]) => {
        const count = sprite.$sheet[0];
        paint(sprite, Math.min(Math.max(frame, 0), count - 1), progress, width, height, smooth);
      },
    );
  },
});
