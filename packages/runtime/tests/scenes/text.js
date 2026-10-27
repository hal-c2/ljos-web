// Text in the default font, which Qt makes 12 pixels of Liberation Sans on
// the machine these sizes were read from: what `qml6` says of each of them is
// in the test. They are all at the origin, since only their sizes are read.
//
// Item {
//     id: root; width: 400; height: 300
//     readonly property string fox: "The quick brown fox jumps over the lazy dog"
//     readonly property string long: "Supercalifragilisticexpialidocious word"
//     Text { id: plain; text: "Hello, World" }
//     Text { id: large; text: "Hello, World"; font.pixelSize: 24 }
//     Text { id: points; text: "Hello, World"; font.pointSize: 12 }
//     Text { id: bold; text: "Hello, World"; font.bold: true }
//     Text { id: italic; text: "Hello, World"; font.italic: true }
//     Text { id: empty }
//     Text { id: heavy; text: "Hello, World"; font.pixelSize: 40; font.weight: Font.DemiBold }
//     Text { id: mono; text: "Hello, World"; font.pixelSize: 20; font.family: "Liberation Mono" }
//     Text { id: serif; text: "Hello, World"; font.pixelSize: 20; font.family: "Liberation Serif" }
//     Text { id: kerned; text: "AVAVAVToWo" }
//     Text { id: apart; text: "AVAVAV To Wo" }
//     Text { id: hanging; text: "elf" }
//     Text { id: wrap; text: root.fox; width: 100; wrapMode: Text.WordWrap }
//     Text { id: elideR; text: root.fox; width: 100; elide: Text.ElideRight }
//     Text { id: elideL; text: root.fox; width: 100; elide: Text.ElideLeft }
//     Text { id: elideM; text: root.fox; width: 100; elide: Text.ElideMiddle }
//     Text { id: max2e; text: root.fox; width: 100; wrapMode: Text.WordWrap; maximumLineCount: 2
//         elide: Text.ElideRight }
//     Text { id: max2; text: root.fox; width: 100; wrapMode: Text.WordWrap; maximumLineCount: 2 }
//     Text { id: h30e; text: root.fox; width: 100; height: 30; wrapMode: Text.WordWrap; elide: Text.ElideRight }
//     Text { id: h30; text: root.fox; width: 100; height: 30; wrapMode: Text.WordWrap }
//     Text { id: nowidth; text: root.fox; wrapMode: Text.WordWrap }
//     Text { id: lh; text: root.fox; width: 100; wrapMode: Text.WordWrap; lineHeight: 1.5 }
//     Text { id: lhf; text: root.fox; width: 100; wrapMode: Text.WordWrap; lineHeight: 20
//         lineHeightMode: Text.FixedHeight }
//     Text { id: two; text: "line one\nline two" }
//     Text { id: pad; text: "Hello, World"; padding: 10 }
//     Text { id: padfox; text: root.fox; width: 100; height: 100; padding: 10; wrapMode: Text.WordWrap
//         horizontalAlignment: Text.AlignRight; verticalAlignment: Text.AlignBottom }
//     Text { id: centre; text: "Hello, World"; width: 200; height: 100; horizontalAlignment: Text.AlignHCenter
//         verticalAlignment: Text.AlignVCenter }
//     Text { id: spaced; text: "Hello, World"; font.letterSpacing: 2; font.wordSpacing: 5 }
//     Text { id: upper; text: "Hello, World"; font.capitalization: Font.AllUppercase }
//     Text { id: longW; text: root.long; width: 100; wrapMode: Text.WordWrap }
//     Text { id: longWrap; text: root.long; width: 100; wrapMode: Text.Wrap }
//     Text { id: longAny; text: root.long; width: 100; wrapMode: Text.WrapAnywhere }
//     Text { id: hyphen; text: "well-known hyphen-ated words-here and/or slashes"; width: 60
//         wrapMode: Text.WordWrap }
//     Text { id: spaces; text: "a  b   c    d     e      f"; width: 30; wrapMode: Text.WordWrap }
//     Text { id: plainfmt; text: "<b>Hello</b>, <i>World</i>"; textFormat: Text.PlainText }
//     Text { id: fit; text: "Hello, World"; font.pixelSize: 48; width: 100; height: 30; fontSizeMode: Text.Fit
//         minimumPixelSize: 6 }
//     Text { id: hfit; text: root.fox; font.pixelSize: 48; width: 100; wrapMode: Text.WordWrap
//         fontSizeMode: Text.HorizontalFit; minimumPixelSize: 8 }
//     Text { id: fitwrap; text: root.fox; font.pixelSize: 48; width: 100; height: 50; wrapMode: Text.WordWrap
//         fontSizeMode: Text.Fit; minimumPixelSize: 8 }
//     Text { id: vfit; text: "Hello"; font.pixelSize: 48; height: 20; fontSizeMode: Text.VerticalFit
//         minimumPixelSize: 8 }
//     Text { id: auto; text: "<b>Hello</b>, <i>World</i>" }
//     Text { id: br; text: "Hello<br>World"; textFormat: Text.StyledText }
//     Text { id: head; text: "<h1>Head</h1>body"; textFormat: Text.StyledText }
//     Text { id: fontsize; text: "<font size='5' color='red'>Hello</font> World"; textFormat: Text.StyledText }
//     Text { id: rich; text: "<h1>Hello</h1><p>World</p>"; textFormat: Text.RichText }
//     TextMetrics { id: measure; text: "Hello, World"; elide: Text.ElideRight; elideWidth: 40 }
//     TextMetrics { id: big; text: "Hello"; font.pixelSize: 40 }
//     TextMetrics { id: tail; text: "jelly"; font.pixelSize: 40 }
//     FontMetrics { id: face }
//     TextInput { id: input; text: "Hello, World" }
//     TextInput { id: inputEmpty }
//     TextInput { id: inputPadded; text: "Hello"; padding: 5 }
//     TextInput { id: inputBoxed; text: "Hello"; width: 100; height: 40; horizontalAlignment: TextInput.AlignRight
//         verticalAlignment: TextInput.AlignVCenter }
//     TextInput { id: inputUpper; text: "Hello"; font.capitalization: Font.AllUppercase }
//     TextInput { id: inputHanging; text: "elf" }
//     TextEdit { id: edit; text: "line one\nline two" }
//     TextEdit { id: editHanging; text: "elf" }
//     TextEdit { id: editFox; text: root.fox; width: 100; wrapMode: TextEdit.WordWrap
//         horizontalAlignment: TextEdit.AlignRight }
//     TextEdit { id: editLow; text: "Hello"; padding: 5; width: 100; height: 60
//         verticalAlignment: TextEdit.AlignBottom }
//     TextEdit { id: editEnd; text: "abc\n" }
// }
import { $object } from "ljos-web/object";
import { Font, FontMetrics, Item, Text, TextEdit, TextInput, TextMetrics } from "ljos-web/QtQuick";
import { make } from "../scene.js";

export const objects = {};
const fox = "The quick brown fox jumps over the lazy dog";
const long = "Supercalifragilisticexpialidocious word";

const texts = {
  plain: { text: "Hello, World" },
  large: { text: "Hello, World", font$pixelSize: 24 },
  points: { text: "Hello, World", font$pointSize: 12 },
  bold: { text: "Hello, World", font$bold: true },
  italic: { text: "Hello, World", font$italic: true },
  empty: {},
  heavy: { text: "Hello, World", font$pixelSize: 40, font$weight: Font.DemiBold },
  mono: { text: "Hello, World", font$pixelSize: 20, font$family: "Liberation Mono" },
  serif: { text: "Hello, World", font$pixelSize: 20, font$family: "Liberation Serif" },
  kerned: { text: "AVAVAVToWo" },
  apart: { text: "AVAVAV To Wo" },
  hanging: { text: "elf" },
  wrap: { text: fox, width: 100, wrapMode: Text.WordWrap },
  elideR: { text: fox, width: 100, elide: Text.ElideRight },
  elideL: { text: fox, width: 100, elide: Text.ElideLeft },
  elideM: { text: fox, width: 100, elide: Text.ElideMiddle },
  max2e: { text: fox, width: 100, wrapMode: Text.WordWrap, maximumLineCount: 2, elide: Text.ElideRight },
  max2: { text: fox, width: 100, wrapMode: Text.WordWrap, maximumLineCount: 2 },
  h30e: { text: fox, width: 100, height: 30, wrapMode: Text.WordWrap, elide: Text.ElideRight },
  h30: { text: fox, width: 100, height: 30, wrapMode: Text.WordWrap },
  nowidth: { text: fox, wrapMode: Text.WordWrap },
  lh: { text: fox, width: 100, wrapMode: Text.WordWrap, lineHeight: 1.5 },
  lhf: { text: fox, width: 100, wrapMode: Text.WordWrap, lineHeight: 20, lineHeightMode: Text.FixedHeight },
  two: { text: "line one\nline two" },
  pad: { text: "Hello, World", padding: 10 },
  padfox: {
    text: fox,
    width: 100,
    height: 100,
    padding: 10,
    wrapMode: Text.WordWrap,
    horizontalAlignment: Text.AlignRight,
    verticalAlignment: Text.AlignBottom,
  },
  centre: {
    text: "Hello, World",
    width: 200,
    height: 100,
    horizontalAlignment: Text.AlignHCenter,
    verticalAlignment: Text.AlignVCenter,
  },
  spaced: { text: "Hello, World", font$letterSpacing: 2, font$wordSpacing: 5 },
  upper: { text: "Hello, World", font$capitalization: Font.AllUppercase },
  longW: { text: long, width: 100, wrapMode: Text.WordWrap },
  longWrap: { text: long, width: 100, wrapMode: Text.Wrap },
  longAny: { text: long, width: 100, wrapMode: Text.WrapAnywhere },
  hyphen: { text: "well-known hyphen-ated words-here and/or slashes", width: 60, wrapMode: Text.WordWrap },
  spaces: { text: "a  b   c    d     e      f", width: 30, wrapMode: Text.WordWrap },
  plainfmt: { text: "<b>Hello</b>, <i>World</i>", textFormat: Text.PlainText },
  fit: { text: "Hello, World", font$pixelSize: 48, width: 100, height: 30, fontSizeMode: Text.Fit, minimumPixelSize: 6 },
  hfit: {
    text: fox,
    font$pixelSize: 48,
    width: 100,
    wrapMode: Text.WordWrap,
    fontSizeMode: Text.HorizontalFit,
    minimumPixelSize: 8,
  },
  fitwrap: {
    text: fox,
    font$pixelSize: 48,
    width: 100,
    height: 50,
    wrapMode: Text.WordWrap,
    fontSizeMode: Text.Fit,
    minimumPixelSize: 8,
  },
  vfit: { text: "Hello", font$pixelSize: 48, height: 20, fontSizeMode: Text.VerticalFit, minimumPixelSize: 8 },
  auto: { text: "<b>Hello</b>, <i>World</i>" },
  br: { text: "Hello<br>World", textFormat: Text.StyledText },
  head: { text: "<h1>Head</h1>body", textFormat: Text.StyledText },
  fontsize: { text: "<font size='5' color='red'>Hello</font> World", textFormat: Text.StyledText },
  rich: { text: "<h1>Hello</h1><p>World</p>", textFormat: Text.RichText },
};

export default function Texts() {
  const named = (Type, name, props) =>
    make(Type, Object.defineProperty(props, "$self", { value: (objects[name] = $object()), enumerable: true }));
  return make(Item, { $self: (objects.root = $object()), width: 400, height: 300 }, () => [
    ...Object.entries(texts).map(([name, props]) => named(Text, name, props)),
    named(TextMetrics, "measure", { text: "Hello, World", elide: Text.ElideRight, elideWidth: 40 }),
    named(TextMetrics, "big", { text: "Hello", font$pixelSize: 40 }),
    named(TextMetrics, "tail", { text: "jelly", font$pixelSize: 40 }),
    named(FontMetrics, "face", {}),
    named(TextInput, "input", { text: "Hello, World" }),
    named(TextInput, "inputEmpty", {}),
    named(TextInput, "inputPadded", { text: "Hello", padding: 5 }),
    named(TextInput, "inputBoxed", {
      text: "Hello",
      width: 100,
      height: 40,
      horizontalAlignment: TextInput.AlignRight,
      verticalAlignment: TextInput.AlignVCenter,
    }),
    named(TextInput, "inputUpper", { text: "Hello", font$capitalization: Font.AllUppercase }),
    named(TextInput, "inputHanging", { text: "elf" }),
    named(TextEdit, "edit", { text: "line one\nline two" }),
    named(TextEdit, "editHanging", { text: "elf" }),
    named(TextEdit, "editFox", { text: fox, width: 100, wrapMode: TextEdit.WordWrap, horizontalAlignment: TextEdit.AlignRight }),
    named(TextEdit, "editLow", { text: "Hello", padding: 5, width: 100, height: 60, verticalAlignment: TextEdit.AlignBottom }),
    named(TextEdit, "editEnd", { text: "abc\n" }),
  ]);
}
