// Markup, links and the looks of a text, in the font of boxes: a letter is
// 8 pixels wide at 16, a bold one 10.
//
// Item {
//     id: root; width: 400; height: 300
//     FontLoader { id: boxes; source: "/assets/boxes.ttf" }
//     FontLoader { id: bold; source: "/assets/boxes-bold.ttf" }
//     component Boxed: Text { font.family: boxes.name; font.pixelSize: 16 }
//     Boxed { id: styled; text: "ab <b>cd</b> <u>ef</u>" }
//     Boxed { id: coloured; y: 20; text: "ab"; color: "red" }
//     Boxed { id: outlined; y: 40; text: "ab"; color: "white"; style: Text.Outline; styleColor: "red" }
//     Boxed { id: raised; y: 60; text: "ab"; style: Text.Raised; styleColor: "red" }
//     Boxed { id: sunken; y: 80; text: "ab"; style: Text.Sunken; styleColor: "red" }
//     Boxed {
//         id: linked; y: 100; text: "go <a href=\"there\">there</a> or <a href=\"https://example.org/\">away</a>"
//         linkColor: "green"
//         onLinkActivated: (link) => log.push("activated " + link)
//         onLinkHovered: (link) => log.push("hovered " + link)
//     }
//     Boxed { id: lined; y: 120; text: "ab<br>cdef"; textFormat: Text.StyledText }
//     Boxed { id: sized; y: 160; text: "<font color=\"#0000ff\" size=\"5\">ab</font>cd"; textFormat: Text.StyledText }
//     Boxed { id: rich; y: 200; text: "<p>ab</p><p>cdef</p>"; textFormat: Text.RichText }
//     Boxed {
//         id: wrapped; x: 200; width: 80; text: "<b>one two</b> three four five"
//         wrapMode: Text.WordWrap; textFormat: Text.StyledText
//     }
//     Boxed {
//         id: unsafe; x: 200; y: 60; textFormat: Text.RichText
//         text: "<b onclick=\"window.hacked = 1\">ab</b><script>window.hacked = 2</script>" +
//             "<iframe src=\"about:blank\"></iframe>cd"
//     }
//     Boxed { id: plain; x: 200; y: 80; text: "<b>ab</b>"; textFormat: Text.PlainText }
//     Boxed { id: struck; x: 200; y: 100; text: "ab"; font.underline: true; font.strikeout: true }
//     Boxed {
//         id: justified; x: 200; y: 120; width: 80; text: "one two three four five"
//         wrapMode: Text.WordWrap; horizontalAlignment: Text.AlignJustify
//     }
//     Boxed { id: arabic; x: 200; y: 180; width: 100; text: "مرحبا" }
// }
import { $object } from "ljos-web/object";
import { FontLoader, Item, Text } from "ljos-web/QtQuick";
import { make } from "../scene.js";

export const objects = { log: [] };

export default function Markup() {
  const { log } = objects;
  // The props are not copied: that would read the bindings among them.
  const named = (Type, name, props) =>
    make(Type, Object.defineProperty(props, "$self", { value: (objects[name] = $object()), enumerable: true }));
  const boxed = (name, props) => {
    Object.defineProperty(props, "font$family", { get: () => objects.boxes.name, enumerable: true });
    props.font$pixelSize = 16;
    return named(Text, name, props);
  };
  return make(Item, { $self: (objects.root = $object()), width: 400, height: 300 }, () => [
    named(FontLoader, "boxes", { source: "/assets/boxes.ttf" }),
    named(FontLoader, "bold", { source: "/assets/boxes-bold.ttf" }),
    boxed("styled", { text: "ab <b>cd</b> <u>ef</u>" }),
    boxed("coloured", { y: 20, text: "ab", color: "red" }),
    boxed("outlined", { y: 40, text: "ab", color: "white", style: Text.Outline, styleColor: "red" }),
    boxed("raised", { y: 60, text: "ab", style: Text.Raised, styleColor: "red" }),
    boxed("sunken", { y: 80, text: "ab", style: Text.Sunken, styleColor: "red" }),
    boxed("linked", {
      y: 100,
      text: 'go <a href="there">there</a> or <a href="https://example.org/">away</a>',
      linkColor: "green",
      onLinkActivated: (link) => log.push(`activated ${link}`),
      onLinkHovered: (link) => log.push(`hovered ${link}`),
    }),
    boxed("lined", { y: 120, text: "ab<br>cdef", textFormat: Text.StyledText }),
    boxed("sized", { y: 160, text: '<font color="#0000ff" size="5">ab</font>cd', textFormat: Text.StyledText }),
    boxed("rich", { y: 200, text: "<p>ab</p><p>cdef</p>", textFormat: Text.RichText }),
    boxed("wrapped", {
      x: 200,
      width: 80,
      text: "<b>one two</b> three four five",
      wrapMode: Text.WordWrap,
      textFormat: Text.StyledText,
    }),
    boxed("unsafe", {
      x: 200,
      y: 60,
      textFormat: Text.RichText,
      text: '<b onclick="window.hacked = 1">ab</b><script>window.hacked = 2</script><iframe src="about:blank"></iframe>cd',
    }),
    boxed("plain", { x: 200, y: 80, text: "<b>ab</b>", textFormat: Text.PlainText }),
    boxed("struck", { x: 200, y: 100, text: "ab", font$underline: true, font$strikeout: true }),
    boxed("justified", {
      x: 200,
      y: 120,
      width: 80,
      text: "one two three four five",
      wrapMode: Text.WordWrap,
      horizontalAlignment: Text.AlignJustify,
    }),
    boxed("arabic", { x: 200, y: 180, width: 100, text: "مرحبا" }),
  ]);
}
