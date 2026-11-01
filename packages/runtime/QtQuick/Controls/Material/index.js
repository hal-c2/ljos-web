// `import QtQuick.Controls.Material`: what the Material style is in C++. The
// fonts of its controls, and `Material`: the theme and the colours an object
// has, its own or those of what it is in, and every colour and measure the
// style's QML asks for. The numbers are Qt's (`qquickmaterialstyle.cpp`).
import { defineType, derived, QtObject } from "../../../object.js";
import { color as colour, hsla, rgba } from "../../color.js";
import { lazy } from "../../compute.js";
import { themed } from "../../Templates/theme.js";
import { around, chosenColour, fromArgb, preferred, said, Theme, themeOf } from "../attached.js";
import { configured } from "../settings.js";
import { signal } from "#kernel";

const Variant = { Normal: 0, Dense: 1 };
const COLOURS = [
  "Red",
  "Pink",
  "Purple",
  "DeepPurple",
  "Indigo",
  "Blue",
  "LightBlue",
  "Cyan",
  "Teal",
  "Green",
  "LightGreen",
  "Lime",
  "Yellow",
  "Amber",
  "Orange",
  "DeepOrange",
  "Brown",
  "Grey",
  "BlueGrey",
];
const SHADES = [
  "Shade50",
  "Shade100",
  "Shade200",
  "Shade300",
  "Shade400",
  "Shade500",
  "Shade600",
  "Shade700",
  "Shade800",
  "Shade900",
  "ShadeA100",
  "ShadeA200",
  "ShadeA400",
  "ShadeA700",
];
const numbered = (names) => Object.fromEntries(names.map((name, index) => [name, index]));
const Colour = numbered(COLOURS);
const Shade = numbered(SHADES);
const RoundedScale = {
  NotRounded: 0,
  ExtraSmallScale: 4,
  SmallScale: 8,
  MediumScale: 12,
  LargeScale: 16,
  ExtraLargeScale: 28,
  FullScale: 0xff,
};
const ContainerStyle = { Filled: 0, Outlined: 1 };

// A row for each colour, a column for each shade.
const TABLE = [
  "ffebee ffcdd2 ef9a9a e57373 ef5350 f44336 e53935 d32f2f c62828 b71c1c ff8a80 ff5252 ff1744 d50000",
  "fce4ec f8bbd0 f48fb1 f06292 ec407a e91e63 d81b60 c2185b ad1457 880e4f ff80ab ff4081 f50057 c51162",
  "f3e5f5 e1bee7 ce93d8 ba68c8 ab47bc 9c27b0 8e24aa 7b1fa2 6a1b9a 4a148c ea80fc e040fb d500f9 aa00ff",
  "ede7f6 d1c4e9 b39ddb 9575cd 7e57c2 673ab7 5e35b1 512da8 4527a0 311b92 b388ff 7c4dff 651fff 6200ea",
  "e8eaf6 c5cae9 9fa8da 7986cb 5c6bc0 3f51b5 3949ab 303f9f 283593 1a237e 8c9eff 536dfe 3d5afe 304ffe",
  "e3f2fd bbdefb 90caf9 64b5f6 42a5f5 2196f3 1e88e5 1976d2 1565c0 0d47a1 82b1ff 448aff 2979ff 2962ff",
  "e1f5fe b3e5fc 81d4fa 4fc3f7 29b6f6 03a9f4 039be5 0288d1 0277bd 01579b 80d8ff 40c4ff 00b0ff 0091ea",
  "e0f7fa b2ebf2 80deea 4dd0e1 26c6da 00bcd4 00acc1 0097a7 00838f 006064 84ffff 18ffff 00e5ff 00b8d4",
  "e0f2f1 b2dfdb 80cbc4 4db6ac 26a69a 009688 00897b 00796b 00695c 004d40 a7ffeb 64ffda 1de9b6 00bfa5",
  "e8f5e9 c8e6c9 a5d6a7 81c784 66bb6a 4caf50 43a047 388e3c 2e7d32 1b5e20 b9f6ca 69f0ae 00e676 00c853",
  "f1f8e9 dcedc8 c5e1a5 aed581 9ccc65 8bc34a 7cb342 689f38 558b2f 33691e ccff90 b2ff59 76ff03 64dd17",
  "f9fbe7 f0f4c3 e6ee9c dce775 d4e157 cddc39 c0ca33 afb42b 9e9d24 827717 f4ff81 eeff41 c6ff00 aeea00",
  "fffde7 fff9c4 fff59d fff176 ffee58 ffeb3b fdd835 fbc02d f9a825 f57f17 ffff8d ffff00 ffea00 ffd600",
  "fff8e1 ffecb3 ffe082 ffd54f ffca28 ffc107 ffb300 ffa000 ff8f00 ff6f00 ffe57f ffd740 ffc400 ffab00",
  "fff3e0 ffe0b2 ffcc80 ffb74d ffa726 ff9800 fb8c00 f57c00 ef6c00 e65100 ffd180 ffab40 ff9100 ff6d00",
  "fbe9e7 ffccbc ffab91 ff8a65 ff7043 ff5722 f4511e e64a19 d84315 bf360c ff9e80 ff6e40 ff3d00 dd2c00",
  "efebe9 d7ccc8 bcaaa4 a1887f 8d6e63 795548 6d4c41 5d4037 4e342e 3e2723 000000 000000 000000 000000",
  "fafafa f5f5f5 eeeeee e0e0e0 bdbdbd 9e9e9e 757575 616161 424242 212121 000000 000000 000000 000000",
  "eceff1 cfd8dc b0bec5 90a4ae 78909c 607d8b 546e7a 455a64 37474f 263238 000000 000000 000000 000000",
].map((row) => row.split(" ").map((hex) => (0xff000000 | parseInt(hex, 16)) >>> 0));

// How much lighter than the colour each shade of it is, of a colour that is
// not one of the table's: under the light theme the colour is its shade 500,
// under the dark one its shade 200.
const LIGHTER = [
  [0.52, 0.37, 0.26, 0.12, 0.06, 0, -0.06, -0.12, -0.18, -0.24, 0.54, 0.37, 0.06, -0.12],
  [0.26, 0.11, 0, -0.14, -0.2, -0.26, -0.32, -0.38, -0.44, -0.5, 0.28, 0.11, -0.2, -0.38],
];

// What differs by theme: the light theme's, then the dark one's.
const BACKGROUND = [0xfffffbfe, 0xff1c1b1f];
const PRIMARY_TEXT = [0xdd000000, 0xffffffff];
const themes = (light, dark) => [fromArgb(light), fromArgb(dark)];
const BY_THEME = {
  primaryTextColor: themes(...PRIMARY_TEXT),
  secondaryTextColor: themes(0x89000000, 0xb2ffffff),
  hintTextColor: themes(0x60000000, 0x4cffffff),
  dividerColor: themes(0x1e000000, 0x1effffff),
  iconColor: themes(0x89000000, 0xffffffff),
  iconDisabledColor: themes(0x42000000, 0x4cffffff),
  frameColor: themes(0x60000000, 0x4cffffff),
  rippleColor: themes(0x10000000, 0x20ffffff),
  // The dark one has no alpha in Qt either.
  switchUncheckedTrackColor: themes(0xffe7e0ec, 0x0049454f),
  switchDisabledUncheckedTrackColor: themes(0x1ee7e0ec, 0x1e49454f),
  switchDisabledCheckedTrackColor: themes(0x1e1c1b1f, 0x1ee6e1e5),
  switchDisabledUncheckedTrackBorderColor: themes(0x1e1c1b1f, 0x1ee6e1e5),
  switchUncheckedHandleColor: themes(TABLE[Colour.Grey][Shade.Shade600], TABLE[Colour.Grey][Shade.Shade400]),
  switchDisabledCheckedHandleColor: themes(0xfffffbfe, 0xff1c1b1f),
  switchDisabledCheckedIconColor: themes(0x611c1b1f, 0x61e6e1e5),
  switchDisabledUncheckedIconColor: themes(0x611c1b1f, 0x61e6e1e5),
  scrollBarColor: themes(0x40000000, 0x40ffffff),
  scrollBarHoveredColor: themes(0x60000000, 0x60ffffff),
  scrollBarPressedColor: themes(0x80000000, 0x80ffffff),
  backgroundDimColor: themes(0x99303030, 0x99fafafa),
  listHighlightColor: themes(0x1e000000, 0x1effffff),
  spinBoxDisabledIconColor: themes(0xffcccccc, 0xff666666),
  sliderDisabledColor: themes(0xff9e9e9e, 0xff616161),
  textFieldFilledContainerColor: themes(0xffe7e0ec, 0xff49454f),
};
const DIALOG = themes(0xffffffff, 0xff424242);
const RAISED = themes(0xffd6d7d7, 0x3fcccccc);
const HOVERED_HANDLE = [
  BY_THEME.switchUncheckedHandleColor[0].darker(1.4),
  BY_THEME.switchUncheckedHandleColor[1].lighter(1.2),
];
const DISABLED_HANDLE = [fromArgb(0x611c1b1f), fromArgb(TABLE[Colour.Grey][Shade.Shade800]).alpha(0.38)];
const SHADOW = fromArgb(0x40000000);
const TOOLTIP = fromArgb(TABLE[Colour.Grey][Shade.Shade700]);
const WHITE = fromArgb(0xffffffff);
const TRANSPARENT = fromArgb(0);
const INVALID = colour(null);
// The primary colours a tool bar's text is dark on.
const PALE = new Set(
  ["LightBlue", "Cyan", "Green", "LightGreen", "Lime", "Yellow", "Amber", "Orange", "Grey"].map((name) => Colour[name]),
);

// What differs by variant: the normal one's, then the dense one's.
const BY_VARIANT = {
  touchTarget: [48, 44],
  buttonVerticalPadding: [14, 10],
  buttonHeight: [40, 32],
  delegateHeight: [48, 40],
  dialogButtonBoxHeight: [52, 48],
  dialogTitleFontPixelSize: [24, 16],
  dialogRoundedScale: [RoundedScale.ExtraLargeScale, RoundedScale.LargeScale],
  frameVerticalPadding: [12, 8],
  menuItemHeight: [48, 32],
  menuItemVerticalPadding: [12, 8],
  switchIndicatorWidth: [52, 40],
  switchIndicatorHeight: [32, 22],
  switchNormalHandleHeight: [16, 10],
  switchCheckedHandleHeight: [24, 16],
  switchLargestHandleHeight: [28, 18],
  switchDelegateVerticalPadding: [8, 4],
  textFieldHeight: [56, 44],
  textFieldHorizontalPadding: [16, 12],
  textFieldVerticalPadding: [8, 4],
  tooltipHeight: [32, 22],
};

// What an object that nothing gave anything has: Qt's own, or what the
// application's settings say (the `Material` group of its conf file).
// `has` is whether there is a foreground (a background) at all, and not the
// theme's: `explicit`, whether the object was given it itself.
const OWN = {
  theme: Theme.Light,
  variant: Variant.Normal,
  primary: { value: Colour.Indigo, custom: false },
  accent: { value: Colour.Pink, custom: false },
  foreground: { value: 0xdd000000, custom: false, has: false, explicit: false },
  background: { value: 0xfffafafa, custom: false, has: false, explicit: false },
};
const [settings, configure] = signal(OWN);

function fonts(dense) {
  const medium = { weight: 500 };
  const large = { pixelSize: dense ? 13 : 16 };
  themed("QtQuick.Controls.Material", {
    font: { pixelSize: dense ? 13 : 14 },
    fonts: {
      Button: medium,
      DelayButton: medium,
      ItemDelegate: medium,
      TabBar: medium,
      ToolBar: medium,
      ToolSeparator: medium,
      ToolTip: dense ? { pixelSize: 10, weight: 500 } : medium,
      CheckDelegate: large,
      RadioDelegate: large,
      SwipeDelegate: large,
      SwitchDelegate: large,
      ComboBox: large,
      Menu: large,
      MenuBar: large,
      MenuBarItem: large,
      MenuItem: large,
      MenuSeparator: large,
      SpinBox: large,
      DoubleSpinBox: large,
      TextArea: large,
      TextField: large,
    },
  });
}
fonts(false);

configured("Material", (group) => {
  const foreground = chosenColour(group.Foreground, COLOURS);
  const background = chosenColour(group.Background, COLOURS);
  const all = {
    theme: Theme[group.Theme] ?? OWN.theme,
    variant: Variant[group.Variant] ?? OWN.variant,
    primary: chosenColour(group.Primary, COLOURS) ?? OWN.primary,
    accent: chosenColour(group.Accent, COLOURS) ?? OWN.accent,
    foreground: foreground ? { ...foreground, has: true, explicit: false } : OWN.foreground,
    background: background ? { ...background, has: true, explicit: false } : OWN.background,
  };
  configure(all);
  fonts(all.variant === Variant.Dense);
});

// What the object has of each thing that is handed down, as Qt keeps it: a
// colour is one of the table's by its number, or any other (`custom`) by its
// `0xAARRGGBB`.
function state(self, object) {
  const up = lazy(self, () => around(Material, object));
  const outer = (name) => (up() ? up().$style[name]() : settings()[name]);
  const one = (name) =>
    lazy(self, () => {
      const given = said(self, name);
      return (given === undefined ? null : chosenColour(given, COLOURS)) ?? outer(name);
    });
  // Set to what the theme has anyway, it is not set: it follows the theme.
  const other = (name, own, settle) =>
    lazy(self, () => {
      const given = said(self, name);
      const chose = given === undefined ? null : chosenColour(given, COLOURS);
      if (chose && (settings()[name].has || chose.value !== own[style.theme()])) {
        return { ...settle(chose), has: true, explicit: true };
      }
      const from = outer(name);
      return from.explicit ? { ...from, explicit: false } : from;
    });
  const style = {
    theme: lazy(self, () => themeOf(self, up(), settings().theme)),
    primary: one("primary"),
    accent: one("accent"),
    foreground: other("foreground", PRIMARY_TEXT, (chose) => chose),
    // The primary colour by its value is the primary colour: so does a tool
    // bar's text know which it is on.
    background: other("background", BACKGROUND, (chose) => {
      const primary = style.primary();
      return chose.custom && chose.value === (primaryArgb(primary) | 0xff000000) >>> 0 ? { value: primary.value, custom: false } : chose;
    }),
  };
  return style;
}

const theme = (self) => self.$style.theme();
// The shade a colour of the table is shown in.
const usual = (self) => (theme(self) === Theme.Light ? Shade.Shade500 : Shade.Shade200);
const primaryArgb = (primary) => (primary.custom ? primary.value : TABLE[primary.value][Shade.Shade500]);
const unit = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

function shaded(self, given, shade) {
  const amount = LIGHTER[theme(self)][shade];
  if (amount === undefined) return INVALID;
  const from = colour(given);
  if (amount === 0) return from;
  // Qt makes the colour as light as that in HSL, with the hue and the
  // saturation it has in HSV: a shade is not as pale as HSL's own would be.
  const hsl = hsla(from.hslHue, from.hslSaturation, from.hslLightness, from.a);
  const made = hsla(hsl.hsvHue, hsl.hsvSaturation, unit(hsl.hslLightness + amount), from.a);
  return rgba(made.r, made.g, made.b, made.a);
}

// A colour of the table in one of its shades, or any other made as light.
function tone({ value, custom }, shade, self) {
  if (!custom) return fromArgb(TABLE[value][shade]);
  return shade === usual(self) ? fromArgb(value) : shaded(self, fromArgb(value), shade);
}

const accent = (self, shade = usual(self)) => tone(self.$style.accent(), shade, self);

function background(self, shade = usual(self)) {
  const { value, custom, has } = self.$style.background();
  if (!has) return fromArgb(BACKGROUND[theme(self)]);
  const primary = self.$style.primary();
  return tone({ value, custom: custom || (primary.custom && value === primary.value) }, shade, self);
}

function toolText(self) {
  const primary = self.$style.primary();
  if (self.$style.foreground().has || primary.custom) return BY_THEME.primaryTextColor[theme(self)];
  return PALE.has(primary.value) ? BY_THEME.primaryTextColor[0] : BY_THEME.primaryTextColor[1];
}

function foreground(self) {
  const { value, custom, has } = self.$style.foreground();
  if (has) return fromArgb(custom ? value : TABLE[value][Shade.Shade500]);
  const behind = self.$style.background();
  if (!behind.custom && behind.value === self.$style.primary().value) return toolText(self);
  return BY_THEME.primaryTextColor[theme(self)];
}

const byTheme = Object.fromEntries(
  Object.entries(BY_THEME).map(([name, both]) => [name, derived((self) => both[theme(self)])]),
);
const byVariant = Object.fromEntries(
  Object.entries(BY_VARIANT).map(([name, both]) => [name, derived(() => both[settings().variant])]),
);
const dense = (normal) => (settings().variant === Variant.Dense ? normal / 2 : normal);

const MaterialStyle = defineType("MaterialStyle", QtObject, {
  properties: {
    theme: undefined,
    primary: undefined,
    accent: undefined,
    foreground: undefined,
    background: undefined,
    elevation: 0,
    roundedScale: RoundedScale.NotRounded,
    containerStyle: ContainerStyle.Filled,
    primaryColor: derived((self) => self.primary),
    accentColor: derived((self) => self.accent),
    backgroundColor: derived((self) => self.background),
    primaryHighlightedTextColor: derived((self) =>
      self.$style.foreground().explicit ? BY_THEME.primaryTextColor[theme(self)] : WHITE,
    ),
    textSelectionColor: derived((self) => accent(self).alpha(0.4)),
    dropShadowColor: SHADOW,
    highlightedRippleColor: derived((self) => accent(self).alpha((theme(self) === Theme.Light ? 30 : 50) / 255)),
    switchCheckedTrackColor: derived((self) => accent(self, theme(self) === Theme.Light ? usual(self) : Shade.Shade100)),
    switchUncheckedHoveredHandleColor: derived((self) => HOVERED_HANDLE[theme(self)]),
    switchCheckedHandleColor: derived((self) => (theme(self) === Theme.Light ? WHITE : accent(self, Shade.Shade800))),
    switchDisabledUncheckedHandleColor: derived((self) => DISABLED_HANDLE[theme(self)]),
    dialogColor: derived((self) => (self.$style.background().has ? background(self) : DIALOG[theme(self)])),
    tooltipColor: derived((self) => (self.$style.background().explicit ? background(self) : TOOLTIP)),
    toolBarColor: derived((self) => (self.$style.background().explicit ? background(self) : self.primary)),
    toolTextColor: derived(toolText),
    ...byTheme,
    ...byVariant,
  },
  resolve: {
    theme,
    primary: (self) => fromArgb(primaryArgb(self.$style.primary())),
    accent: (self) => accent(self),
    foreground,
    background: (self) => background(self),
  },
  // Emitted by nothing: no QML of the style listens for it.
  signals: ["themeOrAccentChanged"],
  methods: {
    color(which, shade = Shade.Shade500) {
      const argb = TABLE[which]?.[shade];
      return argb === undefined ? INVALID : fromArgb(argb);
    },
    shade(given, shade) {
      return shaded(this, given, shade);
    },
    // Told the theme, the background and the accent only so that whoever
    // asks is asked again when one changes: what it reads is the object's.
    buttonColor(_theme, _background, _accent, enabled, flat, highlighted, checked) {
      const light = theme(this) === Theme.Light;
      if (!enabled && !flat) return BY_THEME.dividerColor[theme(this)];
      if (this.$style.background().explicit) return background(this);
      if (highlighted) {
        const made = light
          ? checked
            ? accent(this).lighter()
            : accent(this)
          : accent(this, checked ? Shade.Shade100 : usual(this));
        return flat ? made.alpha(0.25) : made;
      }
      return flat ? TRANSPARENT : RAISED[theme(this)];
    },
    buttonLeftPadding(flat, hasIcon) {
      return dense(flat ? 12 : hasIcon ? 16 : 24);
    },
    buttonRightPadding(flat, hasIcon, hasText) {
      if (flat) return dense(hasIcon && hasText ? 16 : 12);
      return dense(hasText ? 24 : 16);
    },
  },
  setup(self, props) {
    self.$style = state(self, props.$attachee);
  },
});

export const Material = defineType("Material", QtObject, {
  enums: { ...Theme, ...Variant, ...Colour, ...Shade, ...RoundedScale, ...ContainerStyle },
  attached: MaterialStyle,
});

preferred("QtQuick.Controls.Material");
