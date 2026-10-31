// `import QtQuick.Controls.Imagine`: what the Imagine style is in C++. Its
// controls are Qt's QML, drawn with pictures; `Imagine` says where those
// are, for an object and everything in it. The colours are what Qt 6.11
// answers with the style, read from `qml6` (`qquickimaginetheme.cpp` sets
// some of them over Qt's own).
import { defineType, derived, QtObject } from "../../../object.js";
import { lazy } from "../../compute.js";
import { colours } from "../../Palette.js";
import { themed } from "../../Templates/theme.js";
import { around, preferred, said } from "../attached.js";
import { configured } from "../settings.js";
import { signal } from "#kernel";

// The font is Qt's own: Open Sans is the style's only where it is installed,
// which a page cannot ask.
themed("QtQuick.Controls.Imagine", {
  palette: colours(
    {
      alternateBase: "#f7f7f7",
      base: "#ffffff",
      brightText: "#ffffff",
      button: "#efefef",
      buttonText: "#ffffff",
      dark: "#9f9f9f",
      highlight: "#4fc1e9",
      highlightedText: "#ffffff",
      light: "#ffffff",
      link: "#0000ff",
      linkVisited: "#ff00ff",
      mid: "#b8b8b8",
      midlight: "#cacaca",
      shadow: "#767676",
      text: "#434a54",
      toolTipBase: "#ffffdc",
      toolTipText: "#ffffff",
      window: "#efefef",
      windowText: "#434a54",
      placeholderText: "#80000000",
      accent: "#308cc6",
    },
    {
      base: "#efefef",
      dark: "#bebebe",
      shadow: "#b1b1b1",
      text: "#ccd1d9",
      windowText: "#ccd1d9",
      accent: "#919191",
    },
  ),
});

// Where the style's own pictures are: inside its plugin, which the build
// reads them out of.
const OWN = "qrc:/qt-project.org/imports/QtQuick/Controls/Imagine/images/";

const slashed = (path) => (path.endsWith("/") ? path : `${path}/`);

// What an object that nothing gave a path has: Qt's own, or what the
// application's settings say (the `Imagine` group of its conf file).
const [all, configure] = signal(OWN);

const ImagineStyle = defineType("ImagineStyle", QtObject, {
  properties: {
    path: undefined,
    // The path as what a picture's source starts with. A path that is not
    // of Qt's resources is a file's to Qt, and here whatever address it is.
    url: derived((self) => {
      const path = slashed(self.path);
      return path.startsWith(":/") ? `qrc${path}` : path;
    }),
  },
  resolve: { path: (self) => self.$style.path() },
  setup(self, props) {
    const up = lazy(self, () => around(Imagine, props.$attachee));
    self.$style = {
      // Its own, said as a text, or that of what it is in.
      path: lazy(self, () => {
        const own = said(self, "path");
        return own === undefined ? (up() ? up().$style.path() : all()) : String(own);
      }),
    };
  },
});

export const Imagine = defineType("Imagine", QtObject, { attached: ImagineStyle });

preferred("QtQuick.Controls.Imagine");

// Qt reads this wherever the style is imported, as Material reads its own.
configured("Imagine", (group) => configure(group.Path ? slashed(group.Path) : OWN));
