// The visual part of a native type's face: a `<canvas>` in the item's node,
// painted from the display list its hook builds, and the runtime's delivery
// of pointer, wheel and keys to its hooks (docs/LJOS_WEB.md A22). Only a
// page with a type on `Item` loads this.
import { getOwner, onCleanup } from "solid-js";
import { signal as counted, untrack } from "#kernel";
import { sourced } from "../guard.js";
import { effect, settle } from "../object.ts";
import { rules } from "../QtQuick/compute.js";
import { Item } from "../QtQuick/Item.js";
import { sceneToItem } from "../QtQuick/geometry.js";
import { CancelGrabExclusive, gone, hoverable, receive, wheels } from "../QtQuick/pointer.js";

const PAINT = 1;
const POINTER = 2;
const WHEEL = 4;
const KEY = 8;

const POINT_PRESS = 0;
const POINT_MOVE = 1;
const POINT_RELEASE = 2;
const POINT_CANCEL = 3;
const POINT_IN = 4;
const POINT_OUT = 5;

rules(".ljos-face { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; pointer-events: none; }");

// The ratio is a thing the browser tells of changing, never one to ask for.
let ratioVersion = null;
function ratio() {
  if (!ratioVersion) {
    const [version, bump] = counted(0, null);
    ratioVersion = version;
    const listen = () => {
      matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener(
        "change",
        () => {
          bump((n) => n + 1);
          listen();
          settle();
        },
        { once: true },
      );
    };
    listen();
  }
  ratioVersion();
  return devicePixelRatio;
}

// What `item::load_image` asks for: straight pixels, after the call that asked.
function loadImage(url, done) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  // Refused, it has no source to decode, and `done` is told so as of any failure.
  sourced(image, url);
  image.decode().then(
    () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
      done(width, height, new Uint8Array(data.buffer), undefined);
      settle();
    },
    (error) => {
      done(0, 0, undefined, String(error?.message ?? error));
      settle();
    },
  );
}

const pointerBits = (point) => point.button ?? 0;

function tellPointer(self, kind, point) {
  const at = point.in(self);
  return self.$wasm.ljosPointer(
    self.$rust.__ljos_id,
    kind,
    point.x,
    point.y,
    at.x,
    at.y,
    pointerBits(point),
    point.buttons ?? 0,
    point.modifiers ?? 0,
    point.id ?? 0,
  );
}

const methods = {
  $repaint() {
    this.$mine?.bump((n) => n + 1);
  },
  $press(point) {
    if (!(this.$hooks & POINTER)) return false;
    const used = tellPointer(this, POINT_PRESS, point);
    settle();
    return used;
  },
  $move(point) {
    tellPointer(this, POINT_MOVE, point);
    settle();
  },
  $release(point) {
    tellPointer(this, POINT_RELEASE, point);
    settle();
  },
  $grab(transition, point) {
    if (transition !== CancelGrabExclusive) return;
    tellPointer(this, POINT_CANCEL, point);
    settle();
  },
  $hovers(point) {
    if (!(this.$hooks & POINTER)) return false;
    const at = point.in(this);
    return at.x >= 0 && at.y >= 0 && at.x < this.width && at.y < this.height;
  },
  $hover(point, inside) {
    tellPointer(this, inside ? POINT_IN : POINT_OUT, point);
    settle();
  },
  $wheel(turn) {
    if (!(this.$hooks & WHEEL)) return false;
    const at = sceneToItem(this, turn.x, turn.y);
    const used = this.$wasm.ljosWheel(
      this.$rust.__ljos_id,
      turn.x,
      turn.y,
      at.x,
      at.y,
      turn.angleX,
      turn.angleY,
      turn.pixelX,
      turn.pixelY,
      turn.modifiers ?? 0,
    );
    settle();
    return used;
  },
  $keyPressed(event) {
    return key(this, true, event);
  },
  $keyReleased(event) {
    return key(this, false, event);
  },
};

function key(self, press, event) {
  if (!(self.$hooks & KEY)) return undefined;
  const used = self.$wasm.ljosKey(self.$rust.__ljos_id, press, event.key, event.modifiers ?? 0, event.text ?? "", event.isAutoRepeat === true);
  settle();
  if (used) event.accepted = true;
  return used;
}

function paints(self, wasm, id) {
  const canvas = document.createElement("canvas");
  canvas.className = "ljos-face";
  self.$node.append(canvas);
  const context = canvas.getContext("2d");
  const [version, bump] = counted(0, getOwner());
  self.$mine = { bump };
  effect(
    () => {
      version();
      const width = self.width;
      const height = self.height;
      const scale = ratio();
      // Tracked: what the hook reads here is what paints it again.
      wasm.ljosPaintRead(id);
      return { width, height, scale };
    },
    ({ width, height, scale }) => {
      const across = Math.max(0, Math.ceil(width * scale));
      const down = Math.max(0, Math.ceil(height * scale));
      if (canvas.width !== across || canvas.height !== down) {
        canvas.width = across;
        canvas.height = down;
      } else {
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, across, down);
      }
      context.setTransform(scale, 0, 0, scale, 0, 0);
      untrack(() => wasm.ljosPaintDraw(id, context, width, height));
    },
  );
}

export { Item };

// The second half of `defineFace`, for a type on `Item`.
export function visual(wasm) {
  wasm.ljosInstall(loadImage);
  return {
    methods,
    setup(self, rust) {
      const id = rust.__ljos_id;
      const hooks = wasm.ljosHooks(id);
      self.$wasm = wasm;
      self.$hooks = hooks;
      if (hooks & PAINT) paints(self, wasm, id);
      if (hooks & POINTER) {
        receive(self);
        // A move only looks for what hovers while something on the page does.
        hoverable(1);
        onCleanup(() => {
          hoverable(-1);
          gone(self);
        });
      }
      if (hooks & WHEEL) wheels();
    },
  };
}
