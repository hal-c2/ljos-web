// Fields to type in, in the font of boxes: a letter is 8 pixels wide at 16.
//
// Item {
//     id: root; width: 400; height: 300
//     FontLoader { id: boxes; source: "/assets/boxes.ttf" }
//     component Field: TextInput { font.family: boxes.name; font.pixelSize: 16 }
//     Field {
//         id: name; text: "Hello"
//         onAccepted: log.push("accepted " + text)
//         onEditingFinished: log.push("finished " + text)
//         onTextEdited: log.push("edited " + text)
//     }
//     Field {
//         id: boxed; y: 30; width: 200; height: 40; padding: 5; text: "abc"; color: "red"
//         selectionColor: "yellow"; selectedTextColor: "blue"
//         horizontalAlignment: TextInput.AlignRight; verticalAlignment: TextInput.AlignVCenter
//     }
//     Field { id: secret; y: 80; width: 150; text: "abc"; echoMode: TextInput.Password; passwordCharacter: "*" }
//     Field {
//         id: number; y: 110; width: 150; onAccepted: log.push("number " + text)
//         validator: IntValidator { bottom: 10; top: 30 }
//     }
//     Field { id: word; y: 140; width: 150; validator: RegularExpressionValidator { regularExpression: /[a-c]+/ } }
//     Field {
//         id: amount; y: 170; width: 150
//         validator: DoubleValidator { bottom: 0; top: 10; decimals: 2; notation: DoubleValidator.StandardNotation }
//     }
//     Field { id: short; y: 200; width: 150; text: "Hello, World"; maximumLength: 5 }
//     Field { id: fixed; y: 230; width: 150; text: "fixed"; readOnly: true; selectByMouse: false }
//     Text { id: mirror; y: 260; text: name.text + " " + name.cursorPosition + " " + name.selectedText + " " + name.activeFocus }
//     TextEdit {
//         id: notes; x: 220; width: 80; text: "one two three four five"; wrapMode: TextEdit.WordWrap
//         font.family: boxes.name; font.pixelSize: 16
//         onEditingFinished: log.push("notes finished")
//     }
//     TextEdit { id: lines; x: 220; y: 100; text: "ab\nabcd"; font.family: boxes.name; font.pixelSize: 16 }
//     TextEdit {
//         id: low; x: 220; y: 160; width: 150; height: 80; padding: 10; text: "abc"; font.family: boxes.name; font.pixelSize: 16
//         horizontalAlignment: TextEdit.AlignHCenter; verticalAlignment: TextEdit.AlignBottom
//     }
// }
import { $object } from "ljos-web/object";
import {
  DoubleValidator,
  FontLoader,
  IntValidator,
  Item,
  RegularExpressionValidator,
  Text,
  TextEdit,
  TextInput,
} from "ljos-web/QtQuick";
import { make } from "../scene.js";

export const objects = { log: [] };

export default function TextInputs() {
  const { log } = objects;
  // The props are not copied: that would read the bindings among them.
  const named = (Type, name, props) => {
    Object.defineProperty(props, "$self", { value: (objects[name] = $object()), enumerable: true });
    if (Type !== FontLoader && Type !== Text) {
      Object.defineProperty(props, "font$family", { get: () => objects.boxes.name, enumerable: true });
      props.font$pixelSize = 16;
    }
    return make(Type, props);
  };
  return make(Item, { $self: (objects.root = $object()), width: 400, height: 300 }, () => [
    named(FontLoader, "boxes", { source: "/assets/boxes.ttf" }),
    named(TextInput, "name", {
      text: "Hello",
      onAccepted: () => log.push(`accepted ${objects.name.text}`),
      onEditingFinished: () => log.push(`finished ${objects.name.text}`),
      onTextEdited: () => log.push(`edited ${objects.name.text}`),
    }),
    named(TextInput, "boxed", {
      y: 30,
      width: 200,
      height: 40,
      padding: 5,
      text: "abc",
      color: "red",
      selectionColor: "yellow",
      selectedTextColor: "blue",
      horizontalAlignment: TextInput.AlignRight,
      verticalAlignment: TextInput.AlignVCenter,
    }),
    named(TextInput, "secret", { y: 80, width: 150, text: "abc", echoMode: TextInput.Password, passwordCharacter: "*" }),
    named(TextInput, "number", {
      y: 110,
      width: 150,
      get validator() {
        return make(IntValidator, { bottom: 10, top: 30 });
      },
      onAccepted: () => log.push(`number ${objects.number.text}`),
    }),
    named(TextInput, "word", {
      y: 140,
      width: 150,
      get validator() {
        return make(RegularExpressionValidator, { regularExpression: /[a-c]+/ });
      },
    }),
    named(TextInput, "amount", {
      y: 170,
      width: 150,
      get validator() {
        return make(DoubleValidator, { bottom: 0, top: 10, decimals: 2, notation: DoubleValidator.StandardNotation });
      },
    }),
    named(TextInput, "short", { y: 200, width: 150, text: "Hello, World", maximumLength: 5 }),
    named(TextInput, "fixed", { y: 230, width: 150, text: "fixed", readOnly: true, selectByMouse: false }),
    named(Text, "mirror", {
      y: 260,
      get text() {
        const { name } = objects;
        return `${name.text} ${name.cursorPosition} ${name.selectedText} ${name.activeFocus}`;
      },
    }),
    named(TextEdit, "notes", {
      x: 220,
      width: 80,
      text: "one two three four five",
      wrapMode: TextEdit.WordWrap,
      onEditingFinished: () => log.push("notes finished"),
    }),
    named(TextEdit, "lines", { x: 220, y: 100, text: "ab\nabcd" }),
    named(TextEdit, "low", {
      x: 220,
      y: 160,
      width: 150,
      height: 80,
      padding: 10,
      text: "abc",
      horizontalAlignment: TextEdit.AlignHCenter,
      verticalAlignment: TextEdit.AlignBottom,
    }),
  ]);
}
