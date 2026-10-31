// Window: what an application's items live in, and Screen, what the window
// is on.
//
// On the web the root Window is the scene: it takes the size of the element
// it is mounted in, as a desktop window takes what the window manager gives
// it, whatever size its QML asks for. A Window inside another object is a
// layer floating over that scene.
//
// A Window is not an item. Its items are the children of its `contentItem`,
// which is what `parent` is for them (as in Qt).
import { onCleanup, runWithOwner } from "solid-js";
import { $string, contents, defineType, derived, effect, flush, inside, onChange, QtObject, slot } from "../object.js";
import { application, listen, singleton } from "../QtQml/application.js";
import { enums } from "../QtQml/namespace.js";
import { colorValue, css } from "./color.js";
import { toScene } from "./geometry.js";
import { Item } from "./Item.js";
import { signal, untrack } from "#kernel";

const sheet = new CSSStyleSheet();
sheet.replaceSync(`
.qq-window { position: absolute; left: 0; top: 0; box-sizing: border-box; overflow: hidden; }
.qq-window > .qq { isolation: isolate; }
.qq-layer { z-index: 2147483000; box-shadow: 0 2px 16px rgba(0, 0, 0, 0.3); }
`);
document.adoptedStyleSheets.push(sheet);

const { ScreenOrientation } = enums;
const ORIENTATIONS = {
  "portrait-primary": ScreenOrientation.PortraitOrientation,
  "landscape-primary": ScreenOrientation.LandscapeOrientation,
  "portrait-secondary": ScreenOrientation.InvertedPortraitOrientation,
  "landscape-secondary": ScreenOrientation.InvertedLandscapeOrientation,
};

const shape = (width, height) =>
  width >= height ? ScreenOrientation.LandscapeOrientation : ScreenOrientation.PortraitOrientation;

// The screen the page is on: the browser tells of one.
export const Screen = defineType("Screen", QtObject, {
  properties: {
    name: "",
    manufacturer: "",
    model: "",
    serialNumber: "",
    width: 0,
    height: 0,
    desktopAvailableWidth: 0,
    desktopAvailableHeight: 0,
    virtualX: 0,
    virtualY: 0,
    devicePixelRatio: 1,
    // Pixels to the millimetre: a CSS pixel is a 96th of an inch.
    logicalPixelDensity: 96 / 25.4,
    pixelDensity: derived((self) => (96 * self.devicePixelRatio) / 25.4),
    orientation: ScreenOrientation.LandscapeOrientation,
    primaryOrientation: derived((self) => shape(self.width, self.height)),
  },
  methods: {
    // How far to turn from one orientation to reach another, in degrees.
    angleBetween(a, b) {
      if (a === ScreenOrientation.PrimaryOrientation) a = this.primaryOrientation;
      if (b === ScreenOrientation.PrimaryOrientation) b = this.primaryOrientation;
      return ((((Math.log2(a) - Math.log2(b)) % 4) + 4) % 4) * 90;
    },
  },
  setup(self) {
    const read = () => {
      const { width, height, availWidth, availHeight, orientation } = window.screen;
      slot(self, "width").provide(width);
      slot(self, "height").provide(height);
      slot(self, "desktopAvailableWidth").provide(availWidth);
      slot(self, "desktopAvailableHeight").provide(availHeight);
      slot(self, "devicePixelRatio").provide(window.devicePixelRatio);
      slot(self, "orientation").provide(ORIENTATIONS[orientation?.type] ?? shape(width, height));
    };
    const update = () => {
      read();
      flush();
    };
    read();
    // Zooming and moving to another monitor resize the page too.
    listen(window, "resize", update);
    if (window.screen.orientation) listen(window.screen.orientation, "change", update);
  },
});

const screen = singleton(Screen);
const followed = new WeakSet();
// `Screen.width` in an item: the screen its window is on, of which there is
// one. The item's `Screen.onWidthChanged` hears of that one's changes.
Screen.attached = (self) => {
  const one = screen();
  if (!self?.$props || followed.has(self)) return one;
  followed.add(self);
  for (const key of Object.keys(self.$props)) {
    const property = /^Screen\$on([A-Z]\w*)Changed$/.exec(key)?.[1];
    if (!property) continue;
    const name = property[0].toLowerCase() + property.slice(1);
    runWithOwner(self.$owner, () => onChange(one, name, () => self.$props[key]?.()));
  }
  return one;
};

const Hidden = 0;
const AutomaticVisibility = 1;
const Windowed = 2;
const Minimized = 3;
const Maximized = 4;
const FullScreen = 5;

const UNBOUNDED = 16777215;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// The window an item is in, or null: found through its parents.
export function windowOf(item) {
  for (let at = item; at; at = at.parent) {
    if (at.$window) return at.$window;
  }
  return null;
}

// The outermost item above one that is in no window, when it is in the page.
function viewed(item) {
  let at = item;
  while (at?.parent) at = at.parent;
  return at?.$node?.isConnected ? at : null;
}

// The outermost object above one: where a floating window's layer goes.
function top(object) {
  let at = object;
  while (at.$parent) at = at.$parent.$window ?? at.$parent;
  return at;
}

// What the window's QML says its `visibility` is: `visibility` itself reads
// as Hidden while the window is not visible.
const wanted = (self) => slot(self, "visibility").get();

// How the window is shown when it is: what it was last shown as, else what
// its QML says.
function state(self) {
  const shown = self.$state();
  if (shown !== undefined) return shown;
  const given = wanted(self);
  return given > AutomaticVisibility ? given : Windowed;
}

// Whether the window takes all the room there is rather than its own size.
function fills(self) {
  if (self.$heldBy()) return false;
  if (self.$fill()) return true;
  const shown = state(self);
  return shown === Maximized || shown === FullScreen;
}

const WindowAttached = defineType("WindowAttached", QtObject, {
  properties: {
    window: derived((self) => windowOf(self.$item)),
    // A document that is an item is shown in a view of the item's size, as
    // the `qml` tool shows it: that view is the window of what is in it.
    width: derived((self) => self.window?.width ?? viewed(self.$item)?.width ?? 0),
    height: derived((self) => self.window?.height ?? viewed(self.$item)?.height ?? 0),
    active: derived((self) => self.window?.active ?? false),
    contentItem: derived((self) => self.window?.contentItem ?? null),
    visibility: derived((self) => self.window?.visibility ?? Hidden),
    activeFocusItem: derived((self) => self.window?.activeFocusItem ?? null),
  },
  setup(self, props) {
    self.$item = props.$attachee;
  },
});

export const Window = defineType("Window", QtObject, {
  properties: {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    minimumWidth: 0,
    minimumHeight: 0,
    maximumWidth: UNBOUNDED,
    maximumHeight: UNBOUNDED,
    // A window is shown by saying so, or by saying how.
    visible: derived((self) => wanted(self) > AutomaticVisibility),
    // Read and assigned through the accessor below; the slot is what the
    // window's QML binds.
    visibility: AutomaticVisibility,
    color: "white",
    title: $string,
    opacity: 1,
    flags: enums.WindowType.Window,
    modality: enums.WindowModality.NonModal,
    contentItem: derived((self) => self.$contentItem),
    // Everything declared in the window, items or not.
    data: derived((self) => self.$data()),
    screen: derived(() => screen()),
    // The window a floating one belongs to.
    transientParent: derived((self) => windowOf(self.$parent)),
    // Whatever handles focus provides these: `slot(window, "activeFocusItem")`.
    active: derived((self) => self.visible && application().active),
    activeFocusItem: null,
  },
  signals: ["closing"],
  enums: { Hidden, AutomaticVisibility, Windowed, Minimized, Maximized, FullScreen },
  resolve: {
    color: colorValue,
    // A window an item holds (WindowContainer) is where the item is and of
    // its size, and shows when the item does, whatever it says itself.
    x: (self, own) => (self.$heldBy() ? toScene(self.$heldBy())[4] : own()),
    y: (self, own) => (self.$heldBy() ? toScene(self.$heldBy())[5] : own()),
    visible: (self, own) => self.$heldBy()?.visible ?? own(),
    // The room there is, once the window is somewhere and fills it: until
    // then, and when it does not, the size it was given.
    width: (self, own) =>
      self.$heldBy()?.width ??
      (fills(self) ? self.$roomWidth() : undefined) ??
      clamp(own(), self.minimumWidth, self.maximumWidth),
    height: (self, own) =>
      self.$heldBy()?.height ??
      (fills(self) ? self.$roomHeight() : undefined) ??
      clamp(own(), self.minimumHeight, self.maximumHeight),
  },
  methods: {
    get visibility() {
      return this.visible ? state(this) : Hidden;
    },
    // How the window is shown, and that it is: assigning Hidden hides it,
    // AutomaticVisibility leaves it as it is.
    set visibility(visibility) {
      if (visibility === Hidden) slot(this, "visible").write(false);
      else if (visibility !== AutomaticVisibility) {
        this.$setState(visibility);
        slot(this, "visible").write(true);
      }
      flush();
    },
    show() {
      this.visibility = Windowed;
    },
    showNormal() {
      this.visibility = Windowed;
    },
    showMaximized() {
      this.visibility = Maximized;
    },
    showFullScreen() {
      this.visibility = FullScreen;
    },
    showMinimized() {
      this.visibility = Minimized;
    },
    hide() {
      this.visible = false;
    },
    // Asks first: a `closing` handler that clears `close.accepted` keeps
    // the window open.
    close() {
      const close = { accepted: true };
      this.closing(close);
      if (!close.accepted) return false;
      this.visible = false;
      return true;
    },
    // Over the other floating windows, or under them.
    raise() {
      const layer = this.$element;
      if (this.$parent) layer.parentNode?.append(layer);
    },
    lower() {
      const layer = this.$element;
      if (this.$parent) layer.parentNode?.insertBefore(layer, layer.parentNode.querySelector(".qq-layer"));
    },
    requestActivate() {
      window.focus();
      this.raise();
    },
    // Called by a WindowContainer that takes the window, and with null by
    // one that lets it go: it is then a window of its own again, shown if
    // it was.
    $hold(holder) {
      const element = this.$element;
      const shown = untrack(() => this.visible);
      this.$setHeldBy(holder);
      if (holder) holder.$node.append(element);
      else {
        slot(this, "visible").write(shown);
        const scene = top(this).$node;
        if (scene && scene !== element) scene.append(element);
        else element.remove();
      }
    },
    // The size the window asks for, held or not.
    $asked() {
      const side = (name, low, high) => clamp(slot(this, name).asked(), low, high);
      return [
        side("width", this.minimumWidth, this.maximumWidth),
        side("height", this.minimumHeight, this.maximumHeight),
      ];
    },
    // Called by `mount` for the object it mounted: the window is the scene.
    // With `{ fill: false }` the scene takes the window's size instead of
    // the window the scene's.
    $mounted(host, options) {
      if (options?.fill === false) {
        this.$host = host;
        this.$setFill(false);
      } else this.$measure();
      flush();
    },
    // How much room there is for a window that fills it.
    $measure() {
      const element = this.$element;
      if (!element.isConnected) return;
      this.$setRoomWidth(element.clientWidth);
      this.$setRoomHeight(element.clientHeight);
    },
  },
  setup(self) {
    const element = document.createElement("div");
    const root = !self.$parent;
    element.className = root ? "qq-window" : "qq-window qq-layer";
    self.$element = element;
    // The root window is what `mount` puts in the page; a floating one puts
    // itself over the scene, and is nobody's child item.
    if (root) self.$node = element;
    else top(self).$node?.append(element);
    onCleanup(() => element.remove());

    [self.$state, self.$setState] = signal(undefined, self.$owner);
    [self.$fill, self.$setFill] = signal(root, self.$owner);
    [self.$heldBy, self.$setHeldBy] = signal(null, self.$owner);
    [self.$roomWidth, self.$setRoomWidth] = signal(undefined, self.$owner);
    [self.$roomHeight, self.$setRoomHeight] = signal(undefined, self.$owner);
    [self.$data, self.$setData] = signal([], self.$owner);

    const content = inside(null, () =>
      Item({
        get width() {
          return self.width;
        },
        get height() {
          return self.height;
        },
      }),
    );
    content.$window = self;
    self.$contentItem = content;
    element.append(content.$node);

    // The room changes when the page is resized, with nothing here asking.
    const observer = new ResizeObserver(() => {
      self.$measure();
      flush();
    });
    observer.observe(element);
    onCleanup(() => observer.disconnect());

    const style = element.style;
    effect(
      () => (fills(self) ? null : [self.x, self.y, self.width, self.height, Boolean(self.$heldBy())]),
      (box) => {
        if (!box) {
          style.left = style.top = "0";
          style.width = style.height = "100%";
          self.$measure();
          return;
        }
        const [x, y, width, height, held] = box;
        // Where the page is on the screen is not the page's to say, and a
        // held window is where its holder is.
        style.left = root || held ? "0" : `${x}px`;
        style.top = root || held ? "0" : `${y}px`;
        style.width = `${width}px`;
        style.height = `${height}px`;
        // A scene that takes its window's size is as large as the window.
        const host = self.$host?.style;
        if (host) {
          host.width = style.width;
          host.height = style.height;
        }
      },
    );
    effect(
      () => [self.visible && state(self) !== Minimized, css(self.color), self.opacity, Boolean(self.$heldBy())],
      ([shown, background, opacity, held]) => {
        // Said outright for a floating window: it shows over a hidden one.
        style.visibility = shown ? (root || held ? "" : "visible") : "hidden";
        element.classList.toggle("qq-layer", !root && !held);
        style.background = background;
        style.opacity = opacity === 1 ? "" : opacity;
      },
    );
    if (!root) return;
    // The page's title is the window's, once it has one.
    effect(
      () => self.title,
      (title) => {
        if (title) document.title = title;
      },
    );
    // The whole screen, when the browser lets a page have it: it does only
    // while the user is doing something. Until then the window fills the
    // scene, which is the next best thing.
    effect(
      () => self.visible && state(self) === FullScreen,
      (full) => {
        if (full && navigator.userActivation?.isActive) element.requestFullscreen?.().catch(() => {});
        else if (!full && document.fullscreenElement === element) document.exitFullscreen();
      },
    );
    listen(document, "fullscreenchange", () => {
      if (document.fullscreenElement === element || self.visibility !== FullScreen) return;
      // Escape ends it without asking.
      self.visibility = Windowed;
    });
  },
  // The window's items are its content item's; the rest only has to live.
  // All of it is handed over: a Repeater is no item, and its items are.
  adopt(self, props) {
    const content = self.$contentItem;
    const made = contents(props, content);
    self.$setData(made);
    for (const child of made) content.$add(child);
  },
  attached: WindowAttached,
});
