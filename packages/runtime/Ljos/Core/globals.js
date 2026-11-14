// The homes Ljós's API gives what Qt's `Qt` object held (docs/DIALECT.md
// §4.3.1): constructors, colours, `bind`, `later`, `url`, `App` and
// `Locale`. A file of Ljós's API has no `Qt`; it imports these by name
// from `Ljos.Core`. Each is what the `Qt` member it replaces does, so a
// value passes between a Ljós file and a kept Qt file unchanged.
import { application, inputMethod, styleHints } from "../../QtQml/application.js";
import { Locale as Formats, locale } from "../../QtQml/locale.js";
import { settle } from "../../object.js";
import { Qt } from "../../QtQml/Qt.js";
import { hsla as hslaOf, hsva as hsvaOf, rgba as rgbaOf } from "../../QtQuick/color.js";

export const point = (...args) => Qt.point(...args);
export const size = (...args) => Qt.size(...args);
export const rect = (...args) => Qt.rect(...args);
export const vector2d = (...args) => Qt.vector2d(...args);
export const vector3d = (...args) => Qt.vector3d(...args);
export const vector4d = (...args) => Qt.vector4d(...args);
export const quaternion = (...args) => Qt.quaternion(...args);
export const matrix4x4 = (...args) => Qt.matrix4x4(...args);

export const rgba = (r, g, b, a) => rgbaOf(r, g, b, a);
export const hsla = (h, s, l, a) => hslaOf(h, s, l, a);
export const hsva = (h, s, v, a) => hsvaOf(h, s, v, a);

// `Color.of(x)` is the colour `x` names, whose `darker`, `lighter`,
// `alpha`, `tint` and `equals` are Qt's `darker`, `lighter`, `alpha`,
// `tint` and `colorEqual`. What names no colour throws, as `Qt.color` does.
export const Color = Object.freeze({ of: (value) => Qt.color(value) });

// `bind(() => …)`: assigned to a property, binds it again.
export const bind = (compute) => Qt.binding(compute);

// `later(f, …args)`: once at the end of this turn however often it was
// asked, with the arguments it was last given.
export const later = (callback, ...args) => Qt.callLater(callback, ...args);

// `url("…")`, resolved against the file that wrote it, whose URL the
// compiler gives.
export const url = (value, base) => Qt.resolvedUrl(value, base);

// `Locale.current`, `Locale.named("de_DE")`; a locale writes dates with
// `formatDate`, `formatTime` and `formatDateTime`.
export const Locale = Object.freeze({
  ...Formats,
  Format: Object.freeze({ Long: Formats.LongFormat, Short: Formats.ShortFormat, Narrow: Formats.NarrowFormat }),
  get current() {
    return locale(Qt.uiLanguage);
  },
  named: (name) => locale(name),
});

// What the program says of itself and asks of where it runs: Qt's
// `application`, `quit`, `exit`, `openUrlExternally`, `platform`,
// `styleHints` (`hints`), `inputMethod` and `uiLanguage` (`language`).
const own = (name) => ({
  get: () => application()[name],
  set: (value) => void (application()[name] = value),
  enumerable: true,
});
const read = (get) => ({ get, enumerable: true });

export const App = Object.defineProperties(
  {
    quit: () => Qt.quit(),
    // A page has no process to give a code to: the code is said, and the
    // program is asked to end as `quit()` asks it.
    exit(code = 0) {
      if (code !== 0) console.warn(`App.exit(${code}): the code does not reach the process yet`);
      Qt.exit(code);
    },
    openUrlExternally: (target) => Qt.openUrlExternally(target),
  },
  {
    name: own("name"),
    version: own("version"),
    organization: own("organization"),
    domain: own("domain"),
    displayName: own("displayName"),
    arguments: read(() => application().arguments),
    state: read(() => application().state),
    active: read(() => application().active),
    layoutDirection: read(() => application().layoutDirection),
    screens: read(() => application().screens ?? []),
    // `Connections { target: App.quitting … }`: what is told as the
    // program is asked to end.
    quitting: read(() => application().aboutToQuit),
    platform: read(() => Qt.platform),
    hints: read(() => styleHints()),
    inputMethod: read(() => inputMethod()),
    // An assignment: what reads the language has it when this returns.
    language: {
      get: () => Qt.uiLanguage,
      set: (language) => {
        Qt.uiLanguage = language;
        settle();
      },
      enumerable: true,
    },
  },
);
