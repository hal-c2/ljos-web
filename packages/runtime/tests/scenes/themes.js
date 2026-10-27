// import QtQuick.Controls
// import QtQuick.Controls.impl
//
// ApplicationWindow {
//     id: app; width: 300; height: 200
//     Item {
//         id: plain
//         Control { id: control }
//         Control { id: off; enabled: false }
//     }
//     Pane {
//         id: pane; font.pixelSize: 21; palette.button: "#010203"
//         ToolBar { id: bar }
//         GroupBox { id: box; Label { id: label } }
//         TabBar { id: tabs }
//     }
// }
//
// with the style `?style=` names, as the build chooses one: the types are
// those of QtQuick.Templates, which is what a style's are underneath.
import { $object, chosen, defineType } from "ljos-web/object";
import { Qt } from "ljos-web/QtQml";
import { Item } from "ljos-web/QtQuick";
import "ljos-web/QtQuick/Controls/Basic";
import "ljos-web/QtQuick/Controls/Fusion";
import "ljos-web/QtQuick/Controls/Material";
import "ljos-web/QtQuick/Controls/Universal";
import { Color } from "ljos-web/QtQuick/Controls/impl";
import { ApplicationWindow, Control, GroupBox, Label, Pane, ToolBar } from "ljos-web/QtQuick/Templates";
import { make } from "../scene.js";

chosen.set("QtQuick.Controls", `QtQuick.Controls.${new URLSearchParams(location.search).get("style")}`);

// A style says what font a type is set in by the type's name.
const TabBar = defineType("TabBar", Control);

export const objects = {};

export default function Themes() {
  const named = (name) => (objects[name] = $object());
  const [app, plain, control, off, pane, bar, box, label, tabs] = [
    "app",
    "plain",
    "control",
    "off",
    "pane",
    "bar",
    "box",
    "label",
    "tabs",
  ].map(named);
  objects.answers = () => [
    [app.font.pixelSize, app.font.weight, control.font.pixelSize, control.font.weight],
    [
      bar.font.pixelSize,
      bar.font.weight,
      box.font.pixelSize,
      box.font.weight,
      label.font.pixelSize,
      label.font.weight,
      tabs.font.pixelSize,
      tabs.font.weight,
    ],
    [app.palette.button, plain.palette.button, control.palette.button, control.palette.text].map(String),
    [off.palette.text, off.palette.active.text, off.palette.disabled.accent].map(String),
    [pane.palette.button, label.palette.button, label.palette.windowText].map(String),
    [
      Color.blend("#353637", "#ffffff", 0.5),
      Color.blend("#80ff0000", "#0000ff", 0.25),
      Color.blend("#010203", "#040609", 0.5),
      Color.blend("red", "red", 0.3),
    ].map(String),
    [
      Color.transparent("#308cc6", 0.5),
      Color.transparent("#80308cc6", 0.5),
      Color.transparent("red", 2),
      Color.transparent("red", -1),
    ].map(String),
    [Qt.styleHints.accessibility.contrastPreference !== Qt.HighContrast],
  ];
  return make(ApplicationWindow, { $self: app, width: 300, height: 200 }, () => [
    make(Item, { $self: plain }, () => [
      make(Control, { $self: control }),
      make(Control, { $self: off, enabled: false }),
    ]),
    make(Pane, { $self: pane, font$pixelSize: 21, palette$button: "#010203" }, () => [
      make(ToolBar, { $self: bar }),
      make(GroupBox, { $self: box }, () => [make(Label, { $self: label })]),
      make(TabBar, { $self: tabs }),
    ]),
  ]);
}
