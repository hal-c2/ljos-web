// Fields among items that have focus: there is one focus, and the page's
// follows it.
//
// Item {
//     id: root; width: 400; height: 300
//     Keys.onPressed: (event) => log.push("root pressed " + event.key)
//     FocusScope {
//         id: scope; width: 200; height: 60
//         TextInput {
//             id: field; width: 150; height: 20; focus: true; text: "ab"
//             Keys.onPressed: (event) => { log.push("field pressed " + event.key); if (event.key === Qt.Key_X) event.accepted = true }
//             KeyNavigation.down: other
//             onAccepted: log.push("accepted " + text)
//             onActiveFocusChanged: log.push("field active " + activeFocus)
//         }
//     }
//     Item {
//         id: other; y: 80; width: 100; height: 20; activeFocusOnTab: true
//         Keys.onPressed: (event) => log.push("other pressed " + event.key)
//         onActiveFocusChanged: log.push("other active " + activeFocus)
//     }
//     TextEdit { id: notes; y: 120; width: 150; height: 60; Keys.onEscapePressed: log.push("notes escape") }
// }
import { $object } from "ljos-web/object";
import { FocusScope, Item, KeyNavigation, Keys, TextEdit, TextInput } from "ljos-web/QtQuick";
import { make } from "../scene.js";

const names = ["root", "scope", "field", "other", "notes"];
export const objects = { log: [] };

export default function KeysField() {
  for (const name of names) objects[name] = $object();
  const { log, root, scope, field, other, notes } = objects;
  return make(
    Item,
    {
      $self: root,
      width: 400,
      height: 300,
      Keys$onPressed: (event) => log.push(`root pressed ${event.key}`),
      $attach: [Keys],
    },
    () => [
      make(FocusScope, { $self: scope, width: 200, height: 60 }, () => [
        make(TextInput, {
          $self: field,
          width: 150,
          height: 20,
          focus: true,
          text: "ab",
          Keys$onPressed: (event) => {
            log.push(`field pressed ${event.key}`);
            // Qt.Key_X
            if (event.key === 0x58) event.accepted = true;
          },
          KeyNavigation$down: other,
          onAccepted: () => log.push(`accepted ${field.text}`),
          onActiveFocusChanged: () => log.push(`field active ${field.activeFocus}`),
          $attach: [Keys, KeyNavigation],
        }),
      ]),
      make(Item, {
        $self: other,
        y: 80,
        width: 100,
        height: 20,
        activeFocusOnTab: true,
        Keys$onPressed: (event) => log.push(`other pressed ${event.key}`),
        onActiveFocusChanged: () => log.push(`other active ${other.activeFocus}`),
        $attach: [Keys],
      }),
      make(TextEdit, {
        $self: notes,
        y: 120,
        width: 150,
        height: 60,
        Keys$onEscapePressed: (event) => log.push("notes escape"),
        $attach: [Keys],
      }),
    ],
  );
}
