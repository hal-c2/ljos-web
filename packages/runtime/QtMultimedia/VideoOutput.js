// VideoOutput: where a MediaPlayer's picture is shown.
//
// The picture is the player's own element, put in this item and fitted by
// the browser. What QML reads of it is computed as Qt computes it: the size
// of the frame, which is the item's implicit size, and the rectangle the
// frame is painted in.
import { defineType, derived, effect, settle } from "../object.js";
import { Rect } from "../QtQml/values.js";
import { lazy, rules } from "../QtQuick/compute.js";
import { Item } from "../QtQuick/Item.js";
import { signal, untrack } from "#kernel";

// What is inside the item is over the picture, and gets its presses.
rules(`
.qq-video { position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; }
`);

const STRETCH = 0;
const FIT = 1;
const CROP = 2;
const CLEAR = 0;
const KEEP = 1;
const STOPPED = 0;
const END = 6;
const FITS = ["fill", "contain", "cover"];
const NO_SIZE = Object.freeze({ width: 0, height: 0 });

// The size of the frame being shown, or nothing when none is: a player
// that is stopped shows none, unless it stopped at the end and the last
// frame is to stay.
function frame(self) {
  const { player, cleared } = self.$video;
  const playing = player();
  const size = playing?.$frame();
  if (!size || cleared()) return null;
  if (playing.playbackState !== STOPPED) return size;
  return playing.mediaStatus === END && self.endOfStreamPolicy === KEEP ? size : null;
}

// How many quarter turns clockwise the picture is shown at. Qt takes whole
// quarters only.
function turns(self) {
  const angle = Number(self.orientation) || 0;
  return angle % 90 === 0 ? (((angle / 90) % 4) + 4) % 4 : 0;
}

// The frame's size as it is shown: on its side, its sides change places.
function native(self) {
  const size = frame(self);
  if (!size) return NO_SIZE;
  return turns(self) % 2 ? { width: size.height, height: size.width } : size;
}

function source(self) {
  const size = frame(self);
  return size ? new Rect(0, 0, size.width, size.height) : new Rect(0, 0, 0, 0);
}

function content(self) {
  const { width, height } = self;
  const size = self.$video.native();
  const mode = self.fillMode;
  if (!size.width || !size.height || mode === STRETCH) return new Rect(0, 0, width, height);
  const scale =
    mode === CROP
      ? Math.max(width / size.width, height / size.height)
      : Math.min(width / size.width, height / size.height);
  const wide = size.width * scale;
  const tall = size.height * scale;
  return new Rect((width - wide) / 2, (height - tall) / 2, wide, tall);
}

// A rectangle that is as it was is the same rectangle: nothing changed.
function steady(self, compute) {
  let last;
  return lazy(self, () => {
    const now = compute(self);
    const same =
      last && last.x === now.x && last.y === now.y && last.width === now.width && last.height === now.height;
    return same ? last : (last = now);
  });
}

export const VideoOutput = defineType("VideoOutput", Item, {
  properties: {
    fillMode: FIT,
    endOfStreamPolicy: CLEAR,
    orientation: 0,
    mirrored: false,
    sourceRect: derived((self) => self.$video.source()),
    contentRect: derived((self) => self.$video.content()),
    implicitWidth: derived((self) => self.$video.native().width),
    implicitHeight: derived((self) => self.$video.native().height),
  },
  enums: {
    Stretch: STRETCH,
    PreserveAspectFit: FIT,
    PreserveAspectCrop: CROP,
    ClearOutput: CLEAR,
    KeepLastFrame: KEEP,
  },
  methods: {
    // Shows nothing until the player has another frame.
    clearOutput() {
      this.$video.clear(true);
      settle();
    },
    // What a MediaPlayer does with its `videoOutput`.
    $show(player) {
      const video = this.$video;
      const before = untrack(video.player);
      if (before && before !== player) this.$release(before);
      const { element } = player.$media;
      for (const type of ["playing", "seeked"]) element.addEventListener(type, video.fresh);
      this.$node.prepend(element);
      video.clear(false);
      video.show(player);
    },
    $release(player) {
      const video = this.$video;
      if (untrack(video.player) !== player) return;
      const { element } = player.$media;
      for (const type of ["playing", "seeked"]) element.removeEventListener(type, video.fresh);
      if (element.parentNode === this.$node) element.remove();
      element.style.cssText = "";
      video.show(null);
    },
  },
  setup(self) {
    const [player, show] = signal(null, self.$owner);
    const [cleared, clear] = signal(false, self.$owner);
    self.$video = {
      player,
      show,
      cleared,
      clear,
      // The player has a new frame: what was cleared is shown again.
      fresh() {
        if (!cleared()) return;
        clear(false);
        settle();
      },
      native: lazy(self, () => native(self)),
      source: steady(self, source),
      content: steady(self, content),
    };
    effect(
      () => [player(), Boolean(frame(self)), self.fillMode, turns(self), Boolean(self.mirrored), self.width, self.height],
      ([playing, shown, fillMode, quarters, mirrored, width, height]) => {
        const style = playing?.$media.element.style;
        if (!style) return;
        style.visibility = shown ? "" : "hidden";
        style.objectFit = FITS[fillMode] ?? FITS[FIT];
        // On its side the element is as wide as the item is high, about
        // the same middle.
        const sideways = quarters % 2 === 1;
        style.width = sideways ? `${height}px` : "";
        style.height = sideways ? `${width}px` : "";
        style.left = sideways ? `${(width - height) / 2}px` : "";
        style.top = sideways ? `${(height - width) / 2}px` : "";
        // Turned first, then mirrored.
        style.transform = `${mirrored ? "scaleX(-1) " : ""}${quarters ? `rotate(${quarters * 90}deg)` : ""}`.trim();
      },
    );
  },
});
