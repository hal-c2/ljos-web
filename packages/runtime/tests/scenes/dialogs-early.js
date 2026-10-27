// Dialogs opened as soon as the page is there, before the user has done
// anything with it. `?early=` names the one that is: a browser opens one
// picker for one press.
//
// Item {
//     id: root; width: 200; height: 100
//     FileDialog {
//         id: files
//         onAccepted: log.push("files accepted " + selectedFiles.length)
//         onRejected: log.push("files rejected")
//         Component.onCompleted: if (early === "files") open()
//     }
//     ColorDialog {
//         id: colors
//         visible: early === "colors"
//         onRejected: log.push("colors rejected")
//     }
//     MessageDialog {
//         id: message
//         visible: early === "message"
//         text: "The application may not use the location."
//         onButtonClicked: (button, role) => { log.push("message clicked " + button); if (button === MessageDialog.Ok) accept() }
//         onAccepted: log.push("message accepted")
//     }
//     Component.onCompleted: console.log("dialogs made")
// }
import { $object } from "ljos-web/object";
import { Item } from "ljos-web/QtQuick";
import { ColorDialog, FileDialog, MessageDialog } from "ljos-web/QtQuick/Dialogs";
import { make } from "../scene.js";

const names = ["root", "files", "colors", "message"];
export const objects = { log: [] };

export default function Early() {
  for (const name of names) objects[name] = $object();
  const { log, root, files, colors, message } = objects;
  const early = new URLSearchParams(location.search).get("early");
  // The scene says when it is there: a test that asked the page would
  // itself count as the user.
  const made = () => console.log("dialogs made");
  return make(Item, { $self: root, width: 200, height: 100, Component$onCompleted: made }, () => [
    make(FileDialog, {
      $self: files,
      onAccepted: () => log.push(`files accepted ${files.selectedFiles.length}`),
      onRejected: () => log.push("files rejected"),
      Component$onCompleted: () => {
        if (early === "files") files.open();
      },
    }),
    make(ColorDialog, {
      $self: colors,
      visible: early === "colors",
      onRejected: () => log.push("colors rejected"),
    }),
    make(MessageDialog, {
      $self: message,
      visible: early === "message",
      text: "The application may not use the location.",
      onButtonClicked: function (button) {
        log.push(`message clicked ${button}`);
        if (button === MessageDialog.Ok) message.accept();
      },
      onAccepted: () => log.push("message accepted"),
    }),
  ]);
}
