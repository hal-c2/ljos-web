// Sprite: one animation in a sheet of frames, and which may follow it.
// What plays it is another type's business: an ImageParticle gives each
// particle one.
import { defineType, effect, flush, QtObject } from "../object.js";
import { signal } from "#kernel";

export const Sprite = defineType("Sprite", QtObject, {
  properties: {
    name: "",
    // A frame's, when neither `frameDuration` nor a rate says.
    duration: -1,
    durationVariation: 0,
    randomStart: false,
    // `{ name: weight }`: the sprites this one may be followed by.
    to: undefined,
    source: "",
    reverse: false,
    frameSync: false,
    frameCount: 1,
    frameWidth: 0,
    frameHeight: 0,
    frameX: 0,
    frameY: 0,
    frameRate: 0,
    frameRateVariation: 0,
    frameDuration: 0,
    frameDurationVariation: 0,
  },
  methods: {
    // The name `frameCount` had before.
    get frames() {
      return this.frameCount;
    },
    set frames(value) {
      this.frameCount = value;
    },
    // How long this run of the animation takes, in milliseconds: Qt's
    // `variedDuration`. Nothing, when a frame is shown per frame drawn; a
    // second, when the sprite says no time at all. `duration` is a frame's,
    // as `frameDuration` is: Qt still reads it the old way.
    $duration(random) {
      if (this.frameSync) return 0;
      const frames = this.frameCount;
      const varied = (value, variation) => value + (variation ? random() * variation * 2 - variation : 0);
      if (this.frameRate > 0) return Math.max(0, (frames * 1000) / varied(this.frameRate, this.frameRateVariation));
      if (this.frameDuration > 0) {
        return Math.max(0, frames * Math.trunc(varied(this.frameDuration, this.frameDurationVariation)));
      }
      if (this.duration >= 0) return Math.max(0, frames * Math.trunc(varied(this.duration, this.durationVariation)));
      return 1000;
    },
    // Where frame `index` is in the sheet, put in `out`. The frames go on
    // in the rows below when the first row is full.
    $frame(index, out) {
      const image = this.$image;
      const [count, x, y, wide, tall] = this.$sheet;
      const width = wide || image.naturalWidth / count;
      const height = tall || image.naturalHeight;
      const first = Math.max(1, Math.floor((image.naturalWidth - x) / width));
      out.width = width;
      out.height = height;
      if (index < first) {
        out.x = x + index * width;
        out.y = y;
        return;
      }
      const row = Math.max(1, Math.floor(image.naturalWidth / width));
      out.x = ((index - first) % row) * width;
      out.y = y + (1 + Math.floor((index - first) / row)) * height;
    },
  },
  setup(self) {
    // The sheet once it is loaded, and what says where the frames are.
    self.$image = self.$loading = null;
    self.$from = undefined;
    // Whoever plays it is told when the sheet is there, and what reads
    // `$loaded()` is asked again.
    self.$shown = null;
    const [loaded, load] = signal(null, self.$owner);
    self.$loaded = loaded;
    self.$sheet = [1, 0, 0, 0, 0];
    self.$reverse = false;
    effect(
      () => self.source,
      (source) => {
        // Asked again whenever any property of the sprite is written.
        if (source === self.$from) return;
        self.$from = source;
        self.$image = self.$loading = null;
        load(null);
        if (!source) return;
        const image = (self.$loading = new Image());
        image.onload = () => {
          if (self.$loading !== image) return;
          self.$image = image;
          load(image);
          flush();
          self.$shown?.();
        };
        image.src = String(source);
      },
    );
    effect(
      () => [Math.max(1, self.frameCount), self.frameX, self.frameY, self.frameWidth, self.frameHeight, Boolean(self.reverse)],
      (sheet) => {
        self.$sheet = sheet;
        self.$reverse = sheet[5];
      },
    );
  },
});
