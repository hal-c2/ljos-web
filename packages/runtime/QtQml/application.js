// What there is one of for a whole program: `Application` (which is
// `Qt.application`), its style hints and the input method. On the web the
// program is the page, so these read the document and the browser.
import { createRoot, onCleanup, runWithOwner } from "solid-js";
import { defineType, derived, flush, inside, QtObject, slot } from "../object.js";
import { locale } from "./locale.js";
import { enums } from "./namespace.js";
import { Rect } from "./values.js";
import { untrack } from "#kernel";

// An object made when first asked for, and owned by nobody: it lasts as
// long as the page does. QML reads a singleton through its type
// (`Application.font`), so the type has the object's members too.
export function singleton(Type) {
  let made;
  const get = () => (made ??= runWithOwner(null, () => createRoot(() => untrack(() => inside(null, () => Type({}))))));
  for (const key in Type.proto) {
    Object.defineProperty(Type, key, {
      get: () => get()[key],
      set: (value) => void (get()[key] = value),
      configurable: true,
    });
  }
  return get;
}

// Listens for as long as the object lives.
export function listen(target, event, handler) {
  target.addEventListener(event, handler);
  onCleanup(() => target.removeEventListener(event, handler));
}

const FONT = {
  family: "Sans Serif",
  styleName: "",
  bold: false,
  weight: 400,
  italic: false,
  underline: false,
  overline: false,
  strikeout: false,
  pointSize: 9,
  pixelSize: 12,
  capitalization: 0,
  letterSpacing: 0,
  wordSpacing: 0,
  hintingPreference: 0,
  kerning: true,
  preferShaping: true,
  features: {},
  variableAxes: {},
  contextFontMerging: false,
  preferTypoLineMetrics: false,
};

// A font as a value: what `Qt.font` makes and `Application.font` is.
export class Font {
  constructor(given = {}) {
    Object.assign(this, FONT, given);
    // Either size says the other, and so do weight and boldness.
    if ("pixelSize" in given && !("pointSize" in given)) this.pointSize = (this.pixelSize * 72) / 96;
    else this.pixelSize = Math.round((this.pointSize * 96) / 72);
    if ("bold" in given && !("weight" in given)) this.weight = given.bold ? 700 : 400;
    else this.bold = this.weight > 500;
  }
  toString() {
    const flag = (on) => (on ? 1 : 0);
    const { family, pointSize, weight, italic, underline, strikeout } = this;
    return `QFont(${family},${pointSize},-1,5,${weight},${flag(italic)},${flag(underline)},${flag(strikeout)},0,0,0,0,0,0,0,1,,0,0)`;
  }
}

// `Qt.font({ family: "Arial", bold: true })`.
export function font(given) {
  if (given === null || typeof given !== "object") throw new Error("Qt.font(): Invalid arguments");
  const known = Object.keys(given).filter((key) => key in FONT);
  if (!known.length) throw new Error("Qt.font(): Invalid argument: no valid font subproperties specified");
  return new Font(Object.fromEntries(known.map((key) => [key, given[key]])));
}

const { ApplicationState, ColorScheme } = enums;

function state() {
  if (document.visibilityState === "hidden") return ApplicationState.ApplicationHidden;
  return document.hasFocus() ? ApplicationState.ApplicationActive : ApplicationState.ApplicationInactive;
}

const ACCESSIBILITY = Object.freeze({
  contrastPreference: matchMedia("(prefers-contrast: more)").matches
    ? enums.ContrastPreference.HighContrast
    : enums.ContrastPreference.NoPreference,
});

// Its numbers are Qt's own defaults: no browser says how far a drag starts.
const StyleHints = defineType("StyleHints", QtObject, {
  properties: {
    // What a style draws stronger edges for: the browser knows.
    accessibility: derived(() => ACCESSIBILITY),
    colorScheme: ColorScheme.Light,
    cursorFlashTime: 1000,
    fontSmoothingGamma: 1.7,
    keyboardAutoRepeatRate: 30,
    keyboardAutoRepeatRateF: 30,
    keyboardInputInterval: 400,
    mouseDoubleClickInterval: 400,
    mouseDoubleClickDistance: 5,
    touchDoubleTapDistance: 10,
    mousePressAndHoldInterval: 800,
    mouseQuickSelectionThreshold: 10,
    passwordMaskCharacter: "●",
    passwordMaskDelay: 0,
    setFocusOnTouchRelease: false,
    showIsFullScreen: false,
    showIsMaximized: false,
    showShortcutsInContextMenus: true,
    contextMenuTrigger: 0,
    menuSelectionWraps: true,
    singleClickActivation: false,
    startDragDistance: 10,
    startDragTime: 500,
    startDragVelocity: 0,
    tabFocusBehavior: 255,
    useHoverEffects: derived(() => matchMedia("(hover: hover)").matches),
    useRtlExtensions: false,
    wheelScrollLines: 3,
  },
  setup(self) {
    // The scheme the browser asks pages for, until the program sets its own.
    const dark = matchMedia("(prefers-color-scheme: dark)");
    const scheme = slot(self, "colorScheme");
    scheme.provide(dark.matches ? ColorScheme.Dark : ColorScheme.Light);
    listen(dark, "change", () => {
      scheme.provide(dark.matches ? ColorScheme.Dark : ColorScheme.Light);
      flush();
    });
  },
});

export const styleHints = singleton(StyleHints);

// The on-screen keyboard is the browser's, and so is composition: what a
// page can do is ask for the keyboard and see where it is.
const InputMethod = defineType("InputMethod", QtObject, {
  properties: {
    visible: false,
    keyboardRectangle: derived(() => new Rect(0, 0, 0, 0)),
    locale: derived(() => locale()),
    inputDirection: derived((self) => self.locale.textDirection),
  },
  methods: {
    show() {
      navigator.virtualKeyboard?.show();
    },
    hide() {
      navigator.virtualKeyboard?.hide();
    },
    // The browser commits and resets a composition itself.
    commit() {},
    reset() {},
    update() {},
  },
  setup(self) {
    const keyboard = navigator.virtualKeyboard;
    if (!keyboard) return;
    listen(keyboard, "geometrychange", () => {
      const { x, y, width, height } = keyboard.boundingRect;
      slot(self, "keyboardRectangle").provide(new Rect(x, y, width, height));
      slot(self, "visible").provide(height > 0);
      flush();
    });
  },
});

export const inputMethod = singleton(InputMethod);

// `quit` and `exit` are what `Qt.quit()` and `Qt.exit(code)` emit: a page
// cannot end itself, so whoever embeds the program decides what ending is.
export const Application = defineType("Application", QtObject, {
  properties: {
    name: "",
    version: "",
    organization: "",
    domain: "",
    displayName: derived((self) => self.name),
    arguments: derived(() => []),
    state: ApplicationState.ApplicationActive,
    active: derived((self) => self.state === ApplicationState.ApplicationActive),
    layoutDirection: derived(() => (document.documentElement.dir === "rtl" ? 1 : 0)),
    font: derived(() => DEFAULT_FONT),
    styleHints: derived(() => styleHints()),
    supportsMultipleWindows: false,
  },
  signals: ["aboutToQuit", "quit", "exit"],
  setup(self) {
    const now = slot(self, "state");
    const update = () => {
      now.provide(state());
      flush();
    };
    now.provide(state());
    listen(document, "visibilitychange", update);
    listen(window, "focus", update);
    listen(window, "blur", update);
  },
});

const DEFAULT_FONT = new Font();

export const application = singleton(Application);
