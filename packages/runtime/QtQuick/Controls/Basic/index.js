// `import QtQuick.Controls.Basic`: what the Basic style is in C++. Its
// controls are Qt's QML; its colours are these.
import { colours } from "../../Palette.ts";
import { themed } from "../../Templates/theme.js";
import { preferred } from "../attached.js";

// What a SplitView's handle says of itself is this module's in Qt, and what
// a program that imports the controls names it by.
export { SplitHandle } from "../../Templates/SplitView.js";
// And so is the menu a field of any style is asked for.
export { ContextMenu } from "../../Templates/ContextMenu.js";
// And the overlay: a style's dialog asks whether it is in it.
export { Overlay } from "../../Templates/Popup.js";

themed("QtQuick.Controls.Basic", {
  palette: colours(
    {
      alternateBase: "#f7f7f7",
      base: "#ffffff",
      brightText: "#ffffff",
      button: "#e0e0e0",
      buttonText: "#26282a",
      dark: "#353637",
      highlight: "#0066ff",
      highlightedText: "#090909",
      light: "#f6f6f6",
      link: "#45a7d7",
      linkVisited: "#ff00ff",
      mid: "#bdbdbd",
      midlight: "#e4e4e4",
      shadow: "#28282a",
      text: "#353637",
      toolTipBase: "#ffffff",
      toolTipText: "#000000",
      window: "#ffffff",
      windowText: "#26282a",
      placeholderText: "#88353637",
      accent: "#308cc6",
    },
    {
      base: "#d6d6d6",
      brightText: "#4dffffff",
      buttonText: "#4d26282a",
      highlight: "#f0f6ff",
      text: "#7f353637",
      windowText: "#bdbebf",
      accent: "#919191",
    },
  ),
});

preferred("QtQuick.Controls.Basic");
