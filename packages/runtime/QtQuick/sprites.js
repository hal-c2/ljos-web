// What an AnimatedSprite and a SpriteSequence share: which sprite is on and
// since when, which one follows it, and the frame of it that is painted.
//
// The first is Qt's sprite engine, for the one thing these items show: a
// sprite ends when its time is up and the next is one of those it names, by
// their weights, or the one on the shortest way to a goal.
import { allowedUrl } from "../guard.js";
import { rules } from "./compute.js";

rules(
  ".qq-sprite { position: absolute; left: 0; top: 0; width: 100%; height: 100%; background-repeat: no-repeat; pointer-events: none; }",
);

const NONE = Object.freeze([]);
const FRAME = { x: 0, y: 0, width: 0, height: 0 };

const weight = (value) => Number(value) || 0;

export class Player {
  constructor(random = Math.random) {
    this.random = random;
    this.sprites = NONE;
    // Milliseconds since it started, and when the sprite that is on did.
    this.now = 0;
    this.which = 0;
    this.since = 0;
    this.span = 0;
    this.goal = -1;
    // Told when another sprite is on.
    this.entered = null;
  }

  // Starts over with these sprites.
  load(sprites) {
    this.sprites = sprites;
    this.now = 0;
    this.goal = -1;
    this.which = 0;
    this.restart();
  }

  get sprite() {
    return this.sprites[this.which];
  }

  index(name) {
    return this.sprites.findIndex((sprite) => sprite.name === name);
  }

  // The sprite that is on starts again, now.
  restart() {
    const sprite = this.sprite;
    this.span = sprite ? sprite.$duration(this.random) : 0;
    this.since = this.now;
  }

  enter(which) {
    const changed = which !== this.which;
    this.which = which;
    this.restart();
    if (changed) this.entered?.(which);
  }

  // Moves time on. A sprite that ran out is followed by the next, which
  // starts now and not when the other was due, as Qt has it.
  advance(delta) {
    this.now += delta;
    if (this.sprite && this.span > 0 && this.now - this.since >= this.span) this.enter(this.next());
  }

  // How long until the sprite that is on runs out.
  left() {
    return this.span > 0 ? Math.max(0, this.since + this.span - this.now) : Infinity;
  }

  // `goalSprite`: a name that no sprite has changes nothing, the empty one
  // included, and a goal that was reached is stayed at.
  seek(which) {
    if (which >= 0 && which < this.sprites.length) this.goal = which;
  }

  // `jumpTo`: on now, whatever the sprite that was on says, and no goal.
  jump(which) {
    if (!(which >= 0 && which < this.sprites.length) || which === this.which) return;
    this.goal = -1;
    this.enter(which);
  }

  // One of the sprites `from` names, by their weights: -1 when it is none.
  pick(from, allowed) {
    const to = this.sprites[from].to ?? {};
    const names = Object.keys(to).filter((name) => !allowed || allowed.has(this.index(name)));
    let total = 0;
    for (const name of names) total += weight(to[name]);
    let pick = this.random() * total;
    for (const name of names) {
      if (pick < weight(to[name])) {
        const found = this.index(name);
        if (found >= 0) return found;
      }
      pick -= weight(to[name]);
    }
    return -1;
  }

  // The sprite to go to from `from` on a shortest way to the goal, whatever
  // the weights on that way: Qt's `goalSeek`. -1 when there is no way.
  towards(from, goal, depth = this.sprites.length) {
    const sprites = this.sprites;
    const name = sprites[goal].name;
    if (sprites[from].name === name) return from;
    const to = sprites[from].to ?? {};
    if (name in to) return this.index(name);
    for (let far = 1; far < depth; far++) {
      const options = new Set();
      for (const via of Object.keys(to)) {
        for (let index = 0; index < sprites.length; index++) {
          if (sprites[index].name === via && this.towards(index, goal, far) !== -1) options.add(index);
        }
      }
      if (options.size === 1) return options.values().next().value;
      if (options.size) return this.pick(from, options);
    }
    return -1;
  }

  // What follows the sprite that is on: itself, when it names nothing.
  next() {
    const way = this.goal < 0 ? -1 : this.towards(this.which, this.goal);
    const found = way >= 0 ? way : this.pick(this.which);
    return found >= 0 ? found : this.which;
  }
}

// The item's two layers, and what paints a frame of a sprite on them:
// stretched to the item's size, and on its way to the frame after it by
// `progress`.
export function painted(self) {
  const layers = [document.createElement("div"), document.createElement("div")];
  const drawn = ["", ""];
  for (const layer of layers) {
    layer.className = "qq-sprite";
    self.$node.append(layer);
  }
  const put = (which, sprite, frame, width, height) => {
    const sheet = sprite.$image;
    sprite.$frame(frame, FRAME);
    const across = width / FRAME.width;
    const down = height / FRAME.height;
    const key = `${sheet.src} ${FRAME.x} ${FRAME.y} ${across} ${down}`;
    if (drawn[which] === key) return;
    drawn[which] = key;
    const style = layers[which].style;
    style.backgroundImage = `url(${JSON.stringify(allowedUrl(sheet.src))})`;
    style.backgroundSize = `${sheet.naturalWidth * across}px ${sheet.naturalHeight * down}px`;
    style.backgroundPosition = `${-FRAME.x * across}px ${-FRAME.y * down}px`;
  };
  return (sprite, frame, progress, width, height, smooth) => {
    const [under, over] = layers;
    const shown = Boolean(sprite?.$image) && width > 0 && height > 0;
    under.style.display = shown ? "" : "none";
    const count = shown ? sprite.$sheet[0] : 0;
    const blend = shown && progress > 0 && frame < count - 1;
    over.style.display = blend ? "" : "none";
    if (!shown) return;
    const at = (index) => (sprite.$reverse ? count - 1 - index : index);
    under.style.imageRendering = over.style.imageRendering = smooth ? "" : "pixelated";
    put(0, sprite, at(frame), width, height);
    if (!blend) return;
    put(1, sprite, at(frame + 1), width, height);
    over.style.opacity = progress;
  };
}
