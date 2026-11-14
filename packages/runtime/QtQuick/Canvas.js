// Canvas: the browser's `<canvas>`, painted by `onPaint`.
//
// Qt's Context2D is the HTML one with a few things of its own, so what
// `getContext("2d")` gives is the browser's context, wrapped where the two
// differ: colours are QML's, a path is filled by the context's `fillRule`,
// the methods that return nothing in a browser return the context, and Qt
// has `ellipse`, `roundedRect` and `createConicalGradient`.
//
// The picture is as large as the item, one pixel for one: it is not made
// finer for a screen that has more of them.
import { allowedStyle, sourced } from "../guard.js";
import { onCleanup } from "solid-js";
import { Rect, Size } from "../QtQml/values.ts";
import { defineType, derived, effect, settle, slot } from "../object.ts";
import { clock } from "./animation/clock.js";
import { css } from "./color.js";
import { rules } from "./compute.js";
import { Item } from "./Item.js";

rules(".qq-canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; }");

// What `paint` is given: whole pixels, and it says so.
class Region extends Rect {
  toString() {
    return `QRect(${this.x}, ${this.y}, ${this.width}, ${this.height})`;
  }
}

const valid = (rect) => rect && rect.width > 0 && rect.height > 0;

// The smallest rectangle around both.
function united(one, other) {
  if (!valid(other)) return one;
  if (!one) return new Rect(other.x, other.y, other.width, other.height);
  const x = Math.min(one.x, other.x);
  const y = Math.min(one.y, other.y);
  return new Rect(x, y, Math.max(one.right, other.right) - x, Math.max(one.bottom, other.bottom) - y);
}

// What leaves something on the canvas: `painted` is emitted after these.
const DRAWS = new Set([
  "fill",
  "stroke",
  "fillRect",
  "strokeRect",
  "clearRect",
  "fillText",
  "strokeText",
  "drawImage",
  "putImageData",
  "reset",
]);

const EVEN_ODD = 0;
const WINDING = 1;

// The browser's context as Qt's.
function wrap(self, native) {
  const state = self.$canvas;
  // Qt.WindingFill, and what `save()` kept of it.
  let rule = WINDING;
  const rules = [];
  const fills = () => (rule === EVEN_ODD ? "evenodd" : "nonzero");
  // A gradient is wrapped for its colours: which wraps which.
  const natives = new WeakMap();
  const wrapped = new WeakMap();
  const gradient = (made, turned) => {
    const mine = {
      addColorStop(at, colour) {
        // Qt's conical gradient goes round the other way.
        made.addColorStop(turned ? 1 - at : at, css(colour));
        return mine;
      },
    };
    natives.set(mine, made);
    wrapped.set(made, mine);
    return mine;
  };
  // A colour as QML writes it, a gradient of ours, or what the browser made.
  const style = (value) => natives.get(value) ?? (typeof value === "string" || value?.css ? css(value) : value);
  // What can be drawn: a picture by its address, an Image, another Canvas.
  const source = (given) => {
    if (typeof given === "string") return state.picture(given);
    if (given?.$canvas) return given.$canvas.element;
    if (given?.$image) {
      const record = given.$image.record();
      return record ? state.picture(record.url, true) : null;
    }
    return given;
  };

  let proxy;
  const own = {
    get canvas() {
      return self;
    },
    get fillRule() {
      return rule;
    },
    set fillRule(value) {
      rule = value === EVEN_ODD ? EVEN_ODD : WINDING;
    },
    get fillStyle() {
      const value = native.fillStyle;
      return wrapped.get(value) ?? value;
    },
    set fillStyle(value) {
      native.fillStyle = style(value);
    },
    get strokeStyle() {
      const value = native.strokeStyle;
      return wrapped.get(value) ?? value;
    },
    set strokeStyle(value) {
      native.strokeStyle = style(value);
    },
    set shadowColor(value) {
      native.shadowColor = css(value);
    },
    set filter(value) {
      native.filter = allowedStyle(value);
    },
    fill() {
      native.fill(fills());
    },
    clip() {
      native.clip(fills());
    },
    save() {
      rules.push(rule);
      native.save();
    },
    restore() {
      if (rules.length) rule = rules.pop();
      native.restore();
    },
    reset() {
      rule = WINDING;
      rules.length = 0;
      if (native.reset) native.reset();
      // Giving a canvas its width again starts it over.
      else state.element.width = state.element.width;
    },
    // A closed outline of its own, not joined to what the path was at.
    ellipse(x, y, width, height) {
      native.moveTo(x + width, y + height / 2);
      native.ellipse(x + width / 2, y + height / 2, Math.abs(width) / 2, Math.abs(height) / 2, 0, 0, 2 * Math.PI);
      native.closePath();
    },
    roundedRect(x, y, width, height, xRadius, yRadius) {
      native.roundRect(x, y, width, height, [{ x: Math.max(0, xRadius), y: Math.max(0, yRadius) }]);
    },
    createLinearGradient: (...args) => gradient(native.createLinearGradient(...args)),
    createRadialGradient: (...args) => gradient(native.createRadialGradient(...args)),
    createConicalGradient: (x, y, angle) => gradient(native.createConicGradient(-angle, x, y), true),
    createPattern(image, repetition) {
      const picture = source(image);
      return picture ? native.createPattern(picture, repetition) : null;
    },
    // A picture that has not arrived is not drawn, as in Qt.
    drawImage(image, ...where) {
      const picture = source(image);
      if (picture) native.drawImage(picture, ...where);
    },
  };

  const descriptors = Object.getOwnPropertyDescriptors(own);
  const methods = new Map();
  // A method of the browser's, or one of the above: what returns nothing
  // returns the context, so that calls can follow one another.
  const method = (name, call) => {
    let made = methods.get(name);
    if (!made) {
      const draws = DRAWS.has(name);
      made = (...args) => {
        const result = call(...args);
        if (draws) state.drew();
        return result === undefined ? proxy : result;
      };
      methods.set(name, made);
    }
    return made;
  };
  proxy = new Proxy(native, {
    get(target, name) {
      const descriptor = descriptors[name];
      if (descriptor?.get) return descriptor.get();
      if (descriptor && "value" in descriptor) return method(name, descriptor.value);
      const value = target[name];
      return typeof value === "function" ? method(name, value.bind(target)) : value;
    },
    set(target, name, value) {
      const descriptor = descriptors[name];
      if (descriptor?.set) descriptor.set(value);
      else target[name] = value;
      return true;
    },
  });
  return proxy;
}

// Makes the context if there is none. Qt has the one kind too.
function context(self, type) {
  const state = self.$canvas;
  if (!state.context) {
    if (String(type).toLowerCase() !== "2d") {
      console.warn(`QML Canvas: Canvas: unable to use context type "${type}"`);
      return null;
    }
    state.context = wrap(self, state.element.getContext("2d"));
    slot(self, "contextType").write("2d");
    slot(self, "context").write(state.context);
  } else if (String(type).toLowerCase() !== "2d") {
    console.warn("QML Canvas: Canvas already initialized with a different context type");
    return null;
  }
  return state.context;
}

export const Canvas = defineType("Canvas", Item, {
  properties: {
    // Qt's is false until the item is in a window; there is no such wait
    // here.
    available: true,
    contextType: "",
    // Undefined until a context was asked for, by `contextType` or by
    // `getContext`.
    context: undefined,
    // The canvas is the item: none larger than it, shown in tiles.
    canvasSize: derived((self) => new Size(self.width, self.height)),
    tileSize: derived((self) => new Size(self.width, self.height)),
    canvasWindow: derived((self) => new Rect(0, 0, self.width, self.height)),
    renderTarget: 0,
    renderStrategy: 0,
  },
  enums: { Image: 0, FramebufferObject: 1, Immediate: 0, Threaded: 1, Cooperative: 2 },
  signals: ["paint", "painted", "imageLoaded"],
  methods: {
    getContext(type) {
      const made = context(this, type);
      settle();
      return made;
    },
    // The whole canvas is to be painted again: at the next frame, and once
    // however often this was asked.
    requestPaint() {
      this.markDirty(this.canvasWindow);
    },
    markDirty(area) {
      const state = this.$canvas;
      state.dirty = united(state.dirty, area);
      if (state.dirty) clock.add(state.job);
    },
    // Runs `callback` at the next frame, before anything is painted.
    requestAnimationFrame(callback) {
      if (typeof callback !== "function") return 0;
      const state = this.$canvas;
      const handle = ++state.handles;
      state.callbacks.set(handle, callback);
      clock.add(state.job);
      return handle;
    },
    cancelRequestAnimationFrame(handle) {
      this.$canvas.callbacks.delete(handle);
    },
    toDataURL(type = "image/png") {
      return this.$canvas.element.toDataURL(type);
    },
    // A page has no file to write.
    save() {
      return false;
    },
    loadImage(url) {
      this.$canvas.picture(String(url), true);
    },
    unloadImage(url) {
      this.$canvas.pictures.delete(String(url));
    },
    isImageLoaded(url) {
      return this.$canvas.pictures.get(String(url))?.state === "loaded";
    },
    isImageLoading(url) {
      return this.$canvas.pictures.get(String(url))?.state === "loading";
    },
    isImageError(url) {
      return this.$canvas.pictures.get(String(url))?.state === "error";
    },
  },
  setup(self) {
    const element = document.createElement("canvas");
    element.className = "qq-canvas";
    element.width = element.height = 0;
    self.$node.append(element);

    const state = (self.$canvas = {
      element,
      context: null,
      // What is to be painted, and what is to run before.
      dirty: null,
      callbacks: new Map(),
      handles: 0,
      drawn: false,
      pictures: new Map(),
      // A frame: the callbacks, or else the painting, as in Qt, where what
      // a callback asked to be painted is painted at the frame after.
      job: {
        skew: 0,
        idle: () => 0,
        advance() {
          if (state.callbacks.size) {
            const callbacks = [...state.callbacks.values()];
            state.callbacks.clear();
            const now = Date.now();
            for (const callback of callbacks) callback(now);
          } else if (state.dirty) {
            const { x, y, width, height } = state.dirty;
            state.dirty = null;
            self.paint(new Region(Math.floor(x), Math.floor(y), Math.ceil(width), Math.ceil(height)));
          }
          if (state.drawn) {
            state.drawn = false;
            self.painted();
          }
          if (!state.callbacks.size && !state.dirty && !state.drawn) clock.remove(state.job);
        },
      },
      // Something was drawn: `painted` says so, once a frame.
      drew() {
        state.drawn = true;
        clock.add(state.job);
      },
      // A picture by its address, once it has arrived; `load` fetches one
      // that was not asked for before.
      picture(url, load) {
        let entry = state.pictures.get(url);
        if (!entry && load) {
          const image = document.createElement("img");
          entry = { image, state: "loading" };
          state.pictures.set(url, entry);
          const arrived = (how) => () => {
            if (state.pictures.get(url) !== entry) return;
            entry.state = how;
            if (how === "loaded") self.imageLoaded();
            settle();
          };
          image.onload = arrived("loaded");
          image.onerror = arrived("error");
          sourced(image, url);
        }
        return entry?.state === "loaded" ? entry.image : null;
      },
    });
    onCleanup(() => {
      clock.remove(state.job);
      state.callbacks.clear();
      state.pictures.clear();
    });

    effect(
      () => self.contextType,
      (type) => {
        if (type && !state.context) context(self, type);
      },
    );
    // The picture is as large as the item, and is painted when it comes to
    // be and whenever its size changes: a canvas of another size is empty.
    effect(
      () => [Math.max(0, Math.ceil(self.width)), Math.max(0, Math.ceil(self.height))],
      ([width, height]) => {
        if (element.width === width && element.height === height) return;
        element.width = width;
        element.height = height;
        self.markDirty(new Rect(0, 0, width, height));
      },
    );
  },
});
