// ImageParticle: a picture for each particle of its groups, on one canvas.
//
// The canvas covers the system, in the painter's coordinates, and has pixels
// only while there is a particle to show. A frame draws every particle once:
// where its row says it is at the system's time, at the size and opacity its
// age gives it, as Qt's shader does.
//
// Qt multiplies the picture by the particle's colour. Here the picture is
// tinted once for each colour in use, in an atlas the frame copies from, and
// the particle's alpha is the copy's. That is Qt's picture as long as no
// colour is brighter than its alpha; particles that may be are drawn as Qt
// draws them (see glow.js), where the browser can.
import { sourced } from "../../guard.js";
import { defineType, effect, settle, slot } from "../../object.ts";
import { colorValue } from "../color.ts";
import { rules } from "../compute.ts";
import { between, ORIGINS, outermost } from "./geometry.js";
import { lights, lit, shine } from "./glow.js";
import { ParticlePainter } from "./painter.js";
import { AX, AY, END, LIFE, SIZE, STRIDE, T, VX, VY, X, Y } from "./system.js";

rules(".qq-particles { position: absolute; left: 0; top: 0; transform-origin: 0 0; pointer-events: none; }");

const NULL = 0;
const READY = 1;
const LOADING = 2;
const ERROR = 3;
const FADE = 1;
const RADIANS = Math.PI / 180;
// No canvas is wider or taller than this many pixels.
const LIMIT = 4096;
const NONE = Object.freeze([]);
const MAP = new Float64Array(6);
const FRAME = { x: 0, y: 0, width: 0, height: 0 };

// What says the painter has colours of its own to give, and rotations.
const COLOURS = ["color", "colorVariation", "alpha", "alphaVariation", "redVariation", "greenVariation", "blueVariation"];
const TURNS = ["rotation", "rotationVariation", "rotationVelocity", "rotationVelocityVariation", "autoRotation"];
const given = (self, names) => names.some((name) => slot(self, name).explicit());

// The picture in each colour it was asked for, side by side: the colours are
// told apart by three bits a channel, and one of a kind is as it was first
// asked for.
const COLUMNS = 16;
const SIDE = 64;

class Tints {
  constructor() {
    this.cells = new Int16Array(512).fill(-1);
    this.count = 0;
    this.side = this.pitch = this.rows = 0;
    this.canvas = this.context = null;
    this.scratch = document.createElement("canvas");
    this.pen = this.scratch.getContext("2d", { willReadFrequently: true });
  }

  clear() {
    this.cells.fill(-1);
    this.count = 0;
  }

  // The picture changed: the atlas starts over at its size.
  begin(image) {
    this.clear();
    this.canvas = this.context = null;
    this.rows = 0;
    if (!image) return;
    this.side = Math.max(1, Math.min(SIDE, Math.max(image.naturalWidth, image.naturalHeight)));
    // A pixel between two cells, so that a copy takes nothing of the next.
    this.pitch = this.side + 1;
    this.scratch.width = this.scratch.height = this.side;
  }

  // The cell with the picture in this colour, its channels being bytes.
  cell(image, red, green, blue) {
    const key = ((red >> 5) << 6) | ((green >> 5) << 3) | (blue >> 5);
    let cell = this.cells[key];
    if (cell >= 0) return cell;
    cell = this.cells[key] = this.count++;
    if (cell >> 4 >= this.rows) this.grow();
    const { side, pen, pitch } = this;
    const left = (cell & 15) * pitch;
    const top = (cell >> 4) * pitch;
    pen.globalCompositeOperation = "copy";
    pen.drawImage(image, 0, 0, side, side);
    try {
      const pixels = pen.getImageData(0, 0, side, side);
      const data = pixels.data;
      for (let at = 0; at < data.length; at += 4) {
        data[at] = (data[at] * red) / 255;
        data[at + 1] = (data[at + 1] * green) / 255;
        data[at + 2] = (data[at + 2] * blue) / 255;
      }
      this.context.putImageData(pixels, left, top);
    } catch {
      // A picture from elsewhere may be drawn but not read: the canvas
      // multiplies it, which is as good where the picture is opaque or white.
      pen.globalCompositeOperation = "multiply";
      pen.fillStyle = `rgb(${red},${green},${blue})`;
      pen.fillRect(0, 0, side, side);
      pen.globalCompositeOperation = "destination-in";
      pen.drawImage(image, 0, 0, side, side);
      // The cell may have held another colour before the atlas was cleared.
      this.context.clearRect(left, top, side, side);
      this.context.drawImage(this.scratch, left, top);
    }
    return cell;
  }

  grow() {
    const rows = Math.max(1, this.rows * 2);
    const canvas = document.createElement("canvas");
    canvas.width = COLUMNS * this.pitch;
    canvas.height = rows * this.pitch;
    const context = canvas.getContext("2d");
    if (this.canvas) context.drawImage(this.canvas, 0, 0);
    this.canvas = canvas;
    this.context = context;
    this.rows = rows;
  }
}

// What a painter keeps of each particle of a group when the group's own
// numbers are another painter's: Qt's shadow datum.
function shadow(painter, group) {
  let kept = painter.$shadows.get(group);
  if (!kept || kept.facing.length < group.capacity) {
    const made = {
      color: new Uint8Array(group.capacity * 4).fill(255),
      spin: new Float32Array(group.capacity * 2),
      facing: new Uint8Array(group.capacity),
    };
    if (kept) {
      made.color.set(kept.color);
      made.spin.set(kept.spin);
      made.facing.set(kept.facing);
    }
    painter.$shadows.set(group, (kept = made));
  }
  return kept;
}

// Which sprite each particle of a group is at: since when in seconds, until
// when and for how long in milliseconds, and the frame last shown of one
// that goes on a frame at a time.
function playing(painter, group) {
  let kept = painter.$playing.get(group);
  if (!kept || kept.which.length < group.capacity) {
    const made = {
      which: new Uint16Array(group.capacity),
      since: new Float64Array(group.capacity),
      until: new Float64Array(group.capacity),
      span: new Float64Array(group.capacity),
      shown: new Int32Array(group.capacity),
    };
    if (kept) for (const name of Object.keys(made)) made[name].set(kept[name]);
    painter.$playing.set(group, (kept = made));
  }
  return kept;
}

// The sprites a sprite may be followed by, as pairs of an index and a
// weight, in the order of their names as Qt goes through them.
function follows(sprites) {
  return sprites.map((sprite) => {
    const to = sprite.to ?? {};
    const pairs = [];
    for (const name of Object.keys(to).sort()) {
      pairs.push(
        sprites.findIndex((other) => other.name === name),
        Number(to[name]),
      );
    }
    return pairs;
  });
}

export const ImageParticle = defineType("ImageParticle", ParticlePainter, {
  properties: {
    source: "",
    sprites: NONE,
    status: NULL,
    color: "white",
    colorVariation: 0,
    redVariation: 0,
    greenVariation: 0,
    blueVariation: 0,
    alpha: 1,
    alphaVariation: 0,
    // The particles', in degrees: the painter itself does not turn.
    rotation: 0,
    rotationVariation: 0,
    rotationVelocity: 0,
    rotationVelocityVariation: 0,
    autoRotation: false,
    spritesInterpolate: true,
    entryEffect: FADE,
  },
  resolve: { color: colorValue },
  enums: { None: 0, Fade: FADE, Scale: 2, Null: NULL, Ready: READY, Loading: LOADING, Error: ERROR },
  methods: {
    // Qt's `initialize`: the sprite, then the rotation, then the colour, each
    // only of a painter that was told one.
    $load(group, index, random) {
      const look = this.$look;
      if (!look) return;
      if (look.sprites) {
        const state = playing(this, group);
        const sprite = look.sprites[0];
        const span = sprite.$duration(random);
        state.which[index] = 0;
        state.span[index] = span;
        state.since[index] = group.data[index * STRIDE + T];
        state.shown[index] = -1;
        state.until[index] = this.$in.now + span - (sprite.randomStart && span > 0 ? Math.floor(random() * span) : 0);
      }
      if (look.turned) {
        group.spinOwner ??= this;
        const own = group.spinOwner === this ? group : shadow(this, group);
        own.spin[index * 2] = (look.rotation + look.rotationVariation - 2 * random() * look.rotationVariation) * RADIANS;
        own.spin[index * 2 + 1] =
          (look.rotationVelocity + look.rotationVelocityVariation - 2 * random() * look.rotationVelocityVariation) *
          RADIANS;
        own.facing[index] = look.autoRotation ? 1 : 0;
      }
      if (look.coloured) {
        group.colorOwner ??= this;
        const color = (group.colorOwner === this ? group : shadow(this, group)).color;
        const at = index * 4;
        color[at] = look.red * (1 - look.redVariation) + Math.floor(random() * 256) * look.redVariation;
        color[at + 1] = look.green * (1 - look.greenVariation) + Math.floor(random() * 256) * look.greenVariation;
        color[at + 2] = look.blue * (1 - look.blueVariation) + Math.floor(random() * 256) * look.blueVariation;
        color[at + 3] =
          look.alpha * look.opaque * (1 - look.alphaVariation) + Math.floor(random() * 256) * look.alphaVariation;
      }
    },
    $reset() {
      this.$shadows.clear();
      this.$playing.clear();
      this.$release();
    },
    // Nothing to show: the canvas keeps no pixels.
    $release() {
      const canvas = this.$canvas;
      if (canvas.width) canvas.width = canvas.height = 0;
    },
    $paint(sim) {
      const look = this.$look;
      const region = this.$region;
      const groups = this.$painted;
      const image = this.$image;
      let live = 0;
      for (let each = 0; each < groups.length; each++) live += groups[each].alive;
      if (!live || !region || !look?.visible || !(look.sprites || image)) return this.$release();
      const ratio = Math.min(window.devicePixelRatio || 1, LIMIT / region[2], LIMIT / region[3]);
      const width = Math.max(1, Math.round(region[2] * ratio));
      const height = Math.max(1, Math.round(region[3] * ratio));
      const canvas = this.$canvas;
      const context = this.$context;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      } else {
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, width, height);
      }
      const sprites = look.sprites;
      // Brighter than their alpha: drawn as Qt's shader does.
      const glows = look.bright && !sprites && lights(image);
      // Without that, Qt's particles add their light to what is behind them
      // the more the less alpha they have: one that is mostly transparent
      // only adds.
      context.globalCompositeOperation = look.additive && !glows ? "lighter" : "source-over";
      // From the system's coordinates to the canvas' pixels.
      const a = region[4] * ratio;
      const b = region[5] * ratio;
      const c = region[6] * ratio;
      const d = region[7] * ratio;
      const e = (region[8] - region[0]) * ratio;
      const f = (region[9] - region[1]) * ratio;
      context.setTransform(a, b, c, d, e, f);
      // How far from its middle a particle of size one reaches, in pixels.
      const reach = Math.hypot(a, b, c, d) * 0.7072;
      const time = sim.now / 1000;
      const entry = look.entry;
      const tints = this.$tints;
      let turned = false;
      for (let each = 0; each < groups.length; each++) {
        const group = groups[each];
        const { data, used, high } = group;
        const kept = this.$shadows.get(group);
        const color = look.coloured && group.colorOwner !== this && kept ? kept.color : group.color;
        const own = look.turned && group.spinOwner !== this && kept ? kept : group;
        const spin = own.spin;
        const facing = own.facing;
        const state = sprites ? playing(this, group) : null;
        for (let index = 0, at = 0; index < high; index++, at += STRIDE) {
          if (!used[index]) continue;
          const life = data[at + LIFE];
          if (!(life > 0)) continue;
          const age = time - data[at + T];
          const part = age / life;
          if (part < 0 || part > 1) continue;
          let size = data[at + SIZE] + (data[at + END] - data[at + SIZE]) * part * part;
          let fade = 1;
          if (entry) {
            // In over the first tenth of its life, out over the last quarter.
            const shown = Math.min(part * 10, 1) * (1 - Math.min(Math.max((part - 0.75) * 4, 0), 1));
            if (entry === FADE) fade = shown;
            else size *= shown;
          }
          if (size <= 0) continue;
          // As in Qt: smaller ones jitter as they move.
          if (size < 3) size = 3;
          const x = data[at + X] + data[at + VX] * age + 0.5 * data[at + AX] * age * age;
          const y = data[at + Y] + data[at + VY] * age + 0.5 * data[at + AY] * age * age;
          const cx = a * x + c * y + e;
          const cy = b * x + d * y + f;
          const far = size * reach;
          if (cx + far < 0 || cy + far < 0 || cx - far > width || cy - far > height) continue;
          const red = color[index * 4];
          const green = color[index * 4 + 1];
          const blue = color[index * 4 + 2];
          // The canvas has no colour brighter than its alpha, which Qt's
          // output may be: the alpha is the brightest channel's.
          const most = Math.max(red, green, blue, color[index * 4 + 3]);
          const opacity = (most / 255) * fade;
          if (opacity <= 0) continue;
          let angle = spin[index * 2] + spin[index * 2 + 1] * age;
          if (facing[index]) {
            const vx = data[at + VX] + data[at + AX] * age;
            const vy = data[at + VY] + data[at + AY] * age;
            if (vx || vy) angle += Math.atan2(vy, vx);
          }
          if (glows) {
            const cos = Math.cos(angle) * size;
            const sin = Math.sin(angle) * size;
            const part = fade / 255;
            lit(cx, cy, a * cos + c * sin, b * cos + d * sin, c * cos - a * sin, d * cos - b * sin, red * part, green * part, blue * part, color[index * 4 + 3] * part);
            continue;
          }
          let left = x - size / 2;
          let top = y - size / 2;
          if (angle) {
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            context.setTransform(a * cos + c * sin, b * cos + d * sin, c * cos - a * sin, d * cos - b * sin, cx, cy);
            left = top = -size / 2;
            turned = true;
          } else if (turned) {
            context.setTransform(a, b, c, d, e, f);
            turned = false;
          }
          context.globalAlpha = opacity;
          if (sprites) this.$sprite(sim, state, index, left, top, size, opacity);
          else if (red === most && green === most && blue === most) context.drawImage(image, left, top, size, size);
          else {
            const cell = tints.cell(
              image,
              Math.round((red * 255) / most),
              Math.round((green * 255) / most),
              Math.round((blue * 255) / most),
            );
            const pitch = tints.pitch;
            context.drawImage(tints.canvas, (cell & 15) * pitch, (cell >> 4) * pitch, tints.side, tints.side, left, top, size, size);
          }
        }
      }
      if (glows) {
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.globalAlpha = 1;
        shine(context, image, width, height);
      }
    },
    // The sprite that follows the one a particle is at: one of those it names,
    // by their weights, or itself.
    $follow(which, random) {
      const pairs = this.$look.follows[which];
      let total = 0;
      for (let at = 1; at < pairs.length; at += 2) total += pairs[at];
      let pick = random() * total;
      for (let at = 0; at < pairs.length; at += 2) {
        if (pick < pairs[at + 1] && pairs[at] >= 0) return pairs[at];
        pick -= pairs[at + 1];
      }
      return which;
    },
    // Draws the frame a particle's sprite is at: Qt's `spritesUpdate`.
    $sprite(sim, state, index, left, top, size, opacity) {
      const look = this.$look;
      const sprites = look.sprites;
      const context = this.$context;
      const time = sim.now / 1000;
      let which = state.which[index];
      if (which >= sprites.length) which = state.which[index] = 0;
      let span = state.span[index];
      // Its sprite ran out: the next one starts where that ended.
      while (span > 0 && sim.now >= state.until[index]) {
        which = state.which[index] = this.$follow(which, sim.random);
        span = state.span[index] = sprites[which].$duration(sim.random);
        state.since[index] = state.until[index] / 1000;
        state.until[index] += span;
        state.shown[index] = -1;
      }
      let count = sprites[which].$sheet[0];
      let frame;
      let progress = 0;
      if (span > 0) {
        const exact = Math.min(Math.max((time - state.since[index]) / (span / count / 1000), 0), count - 1);
        frame = Math.floor(exact);
        if (look.interpolate) progress = exact - frame;
      } else {
        // No duration: a frame for each frame drawn.
        frame = state.shown[index] + 1;
        if (frame >= count) {
          frame = 0;
          which = state.which[index] = this.$follow(which, sim.random);
          span = state.span[index] = sprites[which].$duration(sim.random);
          state.since[index] = time;
          state.until[index] = sim.now + span;
          count = sprites[which].$sheet[0];
        }
        state.shown[index] = frame;
      }
      const sprite = sprites[which];
      const sheet = sprite.$image;
      if (!sheet) return;
      if (sprite.$reverse) frame = count - 1 - frame;
      sprite.$frame(frame, FRAME);
      context.drawImage(sheet, FRAME.x, FRAME.y, FRAME.width, FRAME.height, left, top, size, size);
      if (progress > 0 && frame < count - 1) {
        // Towards the frame after it in the sheet.
        sprite.$frame(frame + 1, FRAME);
        context.globalAlpha = opacity * progress;
        context.drawImage(sheet, FRAME.x, FRAME.y, FRAME.width, FRAME.height, left, top, size, size);
      }
    },
  },
  setup(self) {
    const canvas = (self.$canvas = document.createElement("canvas"));
    canvas.className = "qq-particles";
    canvas.width = canvas.height = 0;
    self.$context = canvas.getContext("2d");
    self.$node.appendChild(canvas);
    // Geometry asks: the painter is where it would be if it were not turned.
    self.$upright = true;
    self.$image = self.$loading = null;
    self.$from = undefined;
    self.$tints = new Tints();
    self.$shadows = new Map();
    self.$playing = new Map();
    self.$region = null;
    self.$look = null;
    const refresh = () => self.$in?.refresh();
    effect(
      () => {
        const tint = self.color;
        const sprites = self.sprites == null ? NONE : Array.isArray(self.sprites) ? self.sprites : [self.sprites];
        const playable = sprites.filter((sprite) => sprite?.$frame);
        return {
          coloured: given(self, COLOURS),
          red: Math.round(tint.r * 255),
          green: Math.round(tint.g * 255),
          blue: Math.round(tint.b * 255),
          opaque: Math.round(tint.a * 255),
          alpha: self.alpha,
          alphaVariation: self.alphaVariation,
          redVariation: self.colorVariation + self.redVariation,
          greenVariation: self.colorVariation + self.greenVariation,
          blueVariation: self.colorVariation + self.blueVariation,
          turned: given(self, TURNS),
          rotation: self.rotation,
          rotationVariation: self.rotationVariation,
          rotationVelocity: self.rotationVelocity,
          rotationVelocityVariation: self.rotationVelocityVariation,
          autoRotation: self.autoRotation,
          entry: self.entryEffect,
          sprites: playable.length ? playable : null,
          follows: follows(playable),
          interpolate: Boolean(self.spritesInterpolate),
          visible: Boolean(self.visible),
          additive: self.alpha * tint.a < 0.5,
          // Whether a particle may be brighter than its alpha, which none
          // is that is as opaque as can be.
          bright: self.alpha * tint.a < 1 || self.alphaVariation > 0,
        };
      },
      (look) => {
        const old = self.$look;
        // A colour that moves is tinted anew, not as the one it was near.
        if (old && (old.red !== look.red || old.green !== look.green || old.blue !== look.blue)) self.$tints.clear();
        for (const sprite of old?.sprites ?? NONE) sprite.$shown = null;
        for (const sprite of look.sprites ?? NONE) sprite.$shown = refresh;
        self.$look = look;
        refresh();
      },
    );
    // Where the system is in the painter's coordinates, which is where the
    // canvas is. A system without a size is as large as the scene.
    effect(
      () => {
        const system = self.system;
        if (!system?.$sim) return null;
        const frame = system.width > 0 && system.height > 0 ? system : outermost(self);
        const width = frame.width;
        const height = frame.height;
        if (!(width > 0 && height > 0) || !between(frame, self, MAP)) return null;
        const [a, b, c, d, e, f] = MAP;
        const left = e + Math.min(0, a * width) + Math.min(0, c * height);
        const top = f + Math.min(0, b * width) + Math.min(0, d * height);
        const right = e + Math.max(0, a * width) + Math.max(0, c * height);
        const bottom = f + Math.max(0, b * width) + Math.max(0, d * height);
        if (!between(system, self, MAP)) return null;
        // The item turns with `rotation` as every item does, and the canvas
        // turns back.
        let css = `translate(${left}px,${top}px)`;
        if (self.rotation) {
          const [fx, fy] = ORIGINS[self.transformOrigin] ?? ORIGINS[4];
          const x = fx * self.width;
          const y = fy * self.height;
          css = `translate(${x}px,${y}px) rotate(${-self.rotation}deg) translate(${-x}px,${-y}px) ${css}`;
        }
        return [left, top, right - left, bottom - top, ...MAP, css];
      },
      (region) => {
        self.$region = region;
        if (region) {
          canvas.style.width = `${region[2]}px`;
          canvas.style.height = `${region[3]}px`;
          canvas.style.transform = region[10];
        }
        refresh();
      },
    );
    effect(
      () => String(self.source ?? ""),
      (source) => {
        // Asked again whenever any property of the painter is written.
        if (source === self.$from) return;
        self.$from = source;
        const status = slot(self, "status");
        self.$image = self.$loading = null;
        self.$tints.begin(null);
        if (!source) {
          status.write(NULL);
          return refresh();
        }
        const image = (self.$loading = new Image());
        status.write(LOADING);
        image.onload = () => {
          if (self.$loading !== image) return;
          self.$image = image;
          self.$tints.begin(image);
          status.write(READY);
          settle();
          refresh();
        };
        image.onerror = () => {
          if (self.$loading !== image) return;
          status.write(ERROR);
          settle();
        };
        sourced(image, source);
        refresh();
      },
    );
  },
});
