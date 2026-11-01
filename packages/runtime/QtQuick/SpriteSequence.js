// SpriteSequence: the sprites declared in it, each followed by one of those
// it names. It has no size of its own: the frame is stretched to what it is
// given, and nothing is shown of one that is given none.
import { onCleanup } from "solid-js";
import { contents, defineType, effect, onChange, settle, slot } from "../object.js";
import { clock } from "./animation/clock.js";
import { Item } from "./Item.js";
import { painted, Player } from "./sprites.js";
import { untrack } from "#kernel";

const NONE = Object.freeze([]);

const listed = (sprites) => (sprites == null ? NONE : Array.isArray(sprites) ? sprites : [sprites]);

export const SpriteSequence = defineType("SpriteSequence", Item, {
  properties: {
    running: true,
    interpolate: true,
    goalSprite: "",
    currentSprite: "",
    sprites: NONE,
  },
  methods: {
    // By its name: a number is one too, as the engine has it, and not where
    // the sprite is among the others.
    jumpTo(sprite) {
      const player = this.$player;
      const from = player.which;
      player.jump(player.index(String(sprite)));
      if (player.which !== from) this.$jumped();
      settle();
    },
  },
  setup(self) {
    const player = (self.$player = new Player());
    const paint = painted(self);
    // The frame shown of a sprite that has no time: one for each drawn.
    let frame = 0;
    const show = (width, height, smooth, interpolate) => {
      const sprite = player.sprite;
      if (!sprite) return paint(null);
      const count = sprite.$sheet[0];
      let at = Math.min(frame, count - 1);
      let progress = 0;
      if (player.span > 0) {
        const exact = Math.min(Math.max((player.now - player.since) / (player.span / count), 0), count - 1);
        at = Math.floor(exact);
        if (interpolate) progress = exact - at;
      }
      paint(sprite, at, progress, width, height, smooth);
    };
    const job = {
      skew: 0,
      advance(delta) {
        player.advance(delta);
        const sprite = player.sprite;
        if (!(player.span > 0) && ++frame >= sprite.$sheet[0]) {
          frame = 0;
          if (sprite.frameSync) player.enter(player.next());
        }
        show(self.width, self.height, self.smooth, self.interpolate);
      },
      // Until the frame after this one is due, when none is blended.
      idle() {
        const count = player.sprite.$sheet[0];
        const each = player.span / count;
        if (!(each > 0) || (count > 1 && self.interpolate)) return 0;
        return Math.max(1, Math.min(player.left(), each - ((player.now - player.since) % each)));
      },
    };
    player.entered = () => {
      frame = 0;
      slot(self, "currentSprite").write(player.sprite.name);
    };
    // One it jumped to starts now, however long the clock left it alone.
    let on = false;
    self.$jumped = () => {
      if (!on) return;
      clock.remove(job);
      clock.add(job);
    };
    onCleanup(() => clock.remove(job));
    // It starts when every sheet is there, with the first sprite.
    effect(
      () => {
        const all = listed(self.sprites).filter((sprite) => sprite?.$frame);
        return [
          all.length && all.every((sprite) => sprite.$loaded()) ? all : NONE,
          Boolean(self.running && self.visible),
          self.width,
          self.height,
          self.smooth,
          self.interpolate,
          self.currentSprite,
        ];
      },
      ([all, runs, width, height, smooth, interpolate]) => {
        const old = player.sprites;
        if (all.length !== old.length || all.some((sprite, index) => sprite !== old[index])) {
          frame = 0;
          untrack(() => {
            player.load(all);
            slot(self, "currentSprite").write(all[0]?.name ?? "");
          });
        }
        on = runs && all.length > 0;
        if (on) clock.add(job);
        else clock.remove(job);
        show(width, height, smooth, interpolate);
      },
    );
    // What it was declared with is not a goal: only what it is given later.
    onChange(self, "goalSprite", () => player.seek(player.index(self.goalSprite)));
  },
  adopt(self, props) {
    slot(self, "sprites").provide(contents(props).filter((child) => child?.$frame));
  },
});
