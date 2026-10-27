// A font whose every glyph is a box half as wide as the font is tall, a
// space half of that, so that what a text measures is known anywhere: at 16
// pixels a letter is 8 wide, a bold one 10, and a line 16 tall, 13 of them
// above the baseline. Qt says the same of this scene, to the last number.
//
// Item {
//     id: root; width: 400; height: 300
//     FontLoader { id: boxes; source: "/assets/boxes.ttf" }
//     FontLoader { id: bold; source: "/assets/boxes-bold.ttf" }
//     FontLoader { id: missing; source: "data:font/ttf;base64,AAAA" }
//     FontLoader { id: unused }
//     component Boxed: Text { font.family: boxes.name; font.pixelSize: 16 }
//     Boxed { id: label; text: "Hello world" }
//     Boxed { id: heavy; y: 20; text: "Hello world"; font.bold: true }
//     Boxed { id: wrapped; y: 40; width: 80; text: "one two three four five"; wrapMode: Text.WordWrap }
//     Boxed { id: broken; y: 100; width: 80; text: "abcdefghijklmno"; wrapMode: Text.Wrap }
//     Boxed { id: elided; y: 140; width: 80; text: "Hello world again"; elide: Text.ElideRight }
//     Boxed { id: limited; y: 160; width: 80; text: "one two three four five"; wrapMode: Text.WordWrap; maximumLineCount: 2 }
//     Boxed { id: lines; y: 200; text: "ab\nabcd"; lineHeight: 1.5 }
//     Text { id: literal; y: 260; text: "abcd"; font.family: "Qml Solid Test"; font.pixelSize: 16 }
//     Boxed {
//         id: centred; x: 200; width: 200; height: 60; text: "Hello world"
//         horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter
//     }
//     Boxed {
//         id: cornered; x: 200; y: 60; width: 200; height: 60; text: "ab\nabcd"
//         horizontalAlignment: Text.AlignRight; verticalAlignment: Text.AlignBottom
//     }
//     Boxed { id: padded; x: 200; y: 120; text: "abcd"; padding: 10; leftPadding: 30 }
//     Boxed { id: spaced; x: 200; y: 160; text: "ab cd"; font.letterSpacing: 2; font.wordSpacing: 5 }
//     Boxed { id: upper; x: 200; y: 180; text: "ab cd"; font.capitalization: Font.AllUppercase }
//     Boxed {
//         id: fitted; x: 200; y: 200; width: 200; height: 24; text: "Hello world"
//         font.pixelSize: 40; fontSizeMode: Text.Fit; minimumPixelSize: 4
//     }
//     Text { id: points; x: 200; y: 240; text: "abcd"; font.family: boxes.name; font.pointSize: 12 }
//     Boxed { id: follower; x: 200; y: 260; width: label.implicitWidth / 2; text: label.text; wrapMode: Text.WordWrap }
//     TextMetrics {
//         id: measure; font.family: boxes.name; font.pixelSize: 16; text: "Hello world"; elide: Text.ElideLeft; elideWidth: 40
//     }
//     FontMetrics { id: face; font.family: boxes.name; font.pixelSize: 16 }
// }
import { $object } from "ljos-web/object";
import { Font, FontLoader, FontMetrics, Item, Text, TextMetrics } from "ljos-web/QtQuick";
import { make } from "../scene.js";

export const objects = {};

export default function TextBoxes() {
  // The props are not copied: that would read the bindings among them.
  const named = (Type, name, props) =>
    make(Type, Object.defineProperty(props, "$self", { value: (objects[name] = $object()), enumerable: true }));
  const boxed = (name, props) => {
    Object.defineProperty(props, "font$family", { get: () => objects.boxes.name, enumerable: true });
    if (!("font$pointSize" in props)) props.font$pixelSize ??= 16;
    return named(Text, name, props);
  };
  return make(Item, { $self: (objects.root = $object()), width: 400, height: 300 }, () => [
    named(FontLoader, "boxes", { source: "/assets/boxes.ttf" }),
    named(FontLoader, "bold", { source: "/assets/boxes-bold.ttf" }),
    named(FontLoader, "missing", { source: "data:font/ttf;base64,AAAA" }),
    named(FontLoader, "unused", {}),
    boxed("label", { text: "Hello world" }),
    boxed("heavy", { y: 20, text: "Hello world", font$bold: true }),
    boxed("wrapped", { y: 40, width: 80, text: "one two three four five", wrapMode: Text.WordWrap }),
    boxed("broken", { y: 100, width: 80, text: "abcdefghijklmno", wrapMode: Text.Wrap }),
    boxed("elided", { y: 140, width: 80, text: "Hello world again", elide: Text.ElideRight }),
    boxed("limited", { y: 160, width: 80, text: "one two three four five", wrapMode: Text.WordWrap, maximumLineCount: 2 }),
    boxed("lines", { y: 200, text: "ab\nabcd", lineHeight: 1.5 }),
    // Asked for by name before the font is there: nothing tells it but the font arriving.
    named(Text, "literal", { y: 260, text: "abcd", font$family: "Qml Solid Test", font$pixelSize: 16 }),
    boxed("centred", {
      x: 200,
      width: 200,
      height: 60,
      text: "Hello world",
      horizontalAlignment: Text.AlignHCenter,
      verticalAlignment: Text.AlignVCenter,
    }),
    boxed("cornered", {
      x: 200,
      y: 60,
      width: 200,
      height: 60,
      text: "ab\nabcd",
      horizontalAlignment: Text.AlignRight,
      verticalAlignment: Text.AlignBottom,
    }),
    boxed("padded", { x: 200, y: 120, text: "abcd", padding: 10, leftPadding: 30 }),
    boxed("spaced", { x: 200, y: 160, text: "ab cd", font$letterSpacing: 2, font$wordSpacing: 5 }),
    boxed("upper", { x: 200, y: 180, text: "ab cd", font$capitalization: Font.AllUppercase }),
    boxed("fitted", {
      x: 200,
      y: 200,
      width: 200,
      height: 24,
      text: "Hello world",
      font$pixelSize: 40,
      fontSizeMode: Text.Fit,
      minimumPixelSize: 4,
    }),
    boxed("points", { x: 200, y: 240, text: "abcd", font$pointSize: 12 }),
    boxed("follower", {
      x: 200,
      y: 260,
      get width() {
        return objects.label.implicitWidth / 2;
      },
      get text() {
        return objects.label.text;
      },
      wrapMode: Text.WordWrap,
    }),
    named(TextMetrics, "measure", {
      get font$family() {
        return objects.boxes.name;
      },
      font$pixelSize: 16,
      text: "Hello world",
      elide: Text.ElideLeft,
      elideWidth: 40,
    }),
    named(FontMetrics, "face", {
      get font$family() {
        return objects.boxes.name;
      },
      font$pixelSize: 16,
    }),
  ]);
}
