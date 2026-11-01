// `import QtQuick.Controls.Universal`: what the Universal style is in C++.
// The fonts of its controls, and `Universal`: the theme and the colours an
// object has, its own or those of what it is in. The numbers are Qt's
// (`qquickuniversalstyle.cpp`).
import { chosen, defineType, derived, QtObject } from "../../../object.js";
import { color as colour } from "../../color.js";
import { lazy } from "../../compute.js";
import { themed } from "../../Templates/theme.js";
import { around, chosenColour, fromArgb, preferred, said, Theme, themeOf } from "../attached.js";
import { configured } from "../settings.js";
import { signal } from "#kernel";

const header = { pixelSize: 24, weight: 300 };

themed("QtQuick.Controls.Universal", {
  font: { pixelSize: 15 },
  fonts: { GroupBox: { weight: 600 }, TabBar: header, TabButton: header },
});

// The colours an accent can be named as.
const ACCENTS = {
  Lime: 0xffa4c400,
  Green: 0xff60a917,
  Emerald: 0xff008a00,
  Teal: 0xff00aba9,
  Cyan: 0xff1ba1e2,
  Cobalt: 0xff3e65ff,
  Indigo: 0xff6a00ff,
  Violet: 0xffaa00ff,
  Pink: 0xfff472d0,
  Magenta: 0xffd80073,
  Crimson: 0xffa20025,
  Red: 0xffe51400,
  Orange: 0xfffa6800,
  Amber: 0xfff0a30a,
  Yellow: 0xffe3c800,
  Brown: 0xff825a2c,
  Olive: 0xff6d8764,
  Steel: 0xff647687,
  Mauve: 0xff76608a,
  Taupe: 0xff87794e,
};
const NAMES = Object.keys(ACCENTS);
const BY_NUMBER = Object.values(ACCENTS);
const Colour = Object.fromEntries(NAMES.map((name, index) => [name, index]));

// The colours of the system, under the light theme and under the dark one.
const SYSTEM = {
  altHighColor: [0xffffffff, 0xff000000],
  altLowColor: [0x33ffffff, 0x33000000],
  altMediumColor: [0x99ffffff, 0x99000000],
  altMediumHighColor: [0xccffffff, 0xcc000000],
  altMediumLowColor: [0x66ffffff, 0x66000000],
  baseHighColor: [0xff000000, 0xffffffff],
  baseLowColor: [0x33000000, 0x33ffffff],
  baseMediumColor: [0x99000000, 0x99ffffff],
  baseMediumHighColor: [0xcc000000, 0xccffffff],
  baseMediumLowColor: [0x66000000, 0x66ffffff],
  chromeAltLowColor: [0xff171717, 0xfff2f2f2],
  chromeBlackHighColor: [0xff000000, 0xff000000],
  chromeBlackLowColor: [0x33000000, 0x33000000],
  chromeBlackMediumLowColor: [0x66000000, 0x66000000],
  chromeBlackMediumColor: [0xcc000000, 0xcc000000],
  chromeDisabledHighColor: [0xffcccccc, 0xff333333],
  chromeDisabledLowColor: [0xff7a7a7a, 0xff858585],
  chromeHighColor: [0xffcccccc, 0xff767676],
  chromeLowColor: [0xfff2f2f2, 0xff171717],
  chromeMediumColor: [0xffe6e6e6, 0xff1f1f1f],
  chromeMediumLowColor: [0xfff2f2f2, 0xff2b2b2b],
  chromeWhiteColor: [0xffffffff, 0xffffffff],
  listLowColor: [0x19000000, 0x19ffffff],
  listMediumColor: [0x33000000, 0x33ffffff],
};

// What an object that nothing gave anything has: Qt's own, or what the
// application's settings say (the `Universal` group of its conf file). A
// colour is its `0xAARRGGBB`; `has`, whether there is one at all and not the
// theme's.
const OWN = {
  theme: Theme.Light,
  accent: ACCENTS.Cobalt,
  foreground: { value: SYSTEM.baseHighColor[0], has: false },
  background: { value: SYSTEM.altHighColor[0], has: false },
};
const [settings, configure] = signal(OWN);

// One of the accents by its number or its name, or any colour.
function argb(given) {
  const chose = given === undefined ? null : chosenColour(given, NAMES);
  return chose && (chose.custom ? chose.value : BY_NUMBER[chose.value]);
}

function state(self, object) {
  const up = lazy(self, () => around(Universal, object));
  const outer = (name) => (up() ? up().$style[name]() : settings()[name]);
  const one = (name) =>
    lazy(self, () => {
      const value = argb(said(self, name));
      return value == null ? outer(name) : { value, has: true };
    });
  return {
    theme: lazy(self, () => themeOf(self, up(), settings().theme)),
    accent: lazy(self, () => argb(said(self, "accent")) ?? outer("accent")),
    foreground: one("foreground"),
    background: one("background"),
  };
}

const theme = (self) => self.$style.theme();
const ground = (name, usual) => (self) => {
  const { value, has } = self.$style[name]();
  return fromArgb(has ? value : usual[theme(self)]);
};

const UniversalStyle = defineType("UniversalStyle", QtObject, {
  properties: {
    theme: undefined,
    accent: undefined,
    foreground: undefined,
    background: undefined,
    ...Object.fromEntries(
      Object.entries(SYSTEM).map(([name, both]) => {
        const made = both.map(fromArgb);
        return [name, derived((self) => made[theme(self)])];
      }),
    ),
  },
  resolve: {
    theme,
    accent: (self) => fromArgb(self.$style.accent()),
    foreground: ground("foreground", SYSTEM.baseHighColor),
    background: ground("background", SYSTEM.altHighColor),
  },
  // Emitted by nothing: no QML of the style listens for it.
  signals: ["paletteChanged"],
  methods: {
    color(which) {
      const value = BY_NUMBER[which];
      return value === undefined ? colour(null) : fromArgb(value);
    },
  },
  setup(self, props) {
    self.$style = state(self, props.$attachee);
  },
});

export const Universal = defineType("Universal", QtObject, {
  enums: { ...Theme, ...Colour },
  attached: UniversalStyle,
});

preferred("QtQuick.Controls.Universal");

// Qt reads these only where this is the style of the application: Material
// reads its own wherever it is imported.
configured("Universal", (group) => {
  if (chosen.get("QtQuick.Controls") !== "QtQuick.Controls.Universal") return;
  const foreground = argb(group.Foreground);
  const background = argb(group.Background);
  configure({
    theme: Theme[group.Theme] ?? OWN.theme,
    accent: argb(group.Accent) ?? OWN.accent,
    foreground: foreground == null ? OWN.foreground : { value: foreground, has: true },
    background: background == null ? OWN.background : { value: background, has: true },
  });
});
