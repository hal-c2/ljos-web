// Item {
//     id: root; width: 200; height: 100
//     FileDialog {
//         id: files
//         title: "Choose a film"
//         nameFilters: ["Films (*.webm *.mp4)", "Sounds (*.wav)", "All files (*)"]
//         selectedNameFilter.index: 0
//         onVisibleChanged: log.push("files visible " + visible)
//         onResultChanged: log.push("files result " + result)
//         onSelectedFilesChanged: log.push("files files " + selectedFiles.length)
//         onSelectedFileChanged: log.push("files file " + (selectedFile !== ""))
//         onAccepted: log.push("files accepted")
//         onRejected: log.push("files rejected")
//     }
//     FileDialog { id: plain }
//     FolderDialog {
//         id: folder
//         onSelectedFolderChanged: log.push("folder folder")
//         onAccepted: log.push("folder accepted")
//         onRejected: log.push("folder rejected")
//     }
//     ColorDialog {
//         id: colors
//         selectedColor: "red"
//         onVisibleChanged: log.push("colors visible " + visible)
//         onResultChanged: log.push("colors result " + result)
//         onSelectedColorChanged: log.push("colors color " + selectedColor)
//         onAccepted: log.push("colors accepted")
//         onRejected: log.push("colors rejected")
//     }
//     ColorDialog { id: white }
//     MessageDialog {
//         id: message
//         title: "Leaving"
//         text: "The document was changed."
//         informativeText: "Save it?"
//         buttons: MessageDialog.Cancel | MessageDialog.Save | MessageDialog.Discard
//         onVisibleChanged: log.push("message visible " + visible)
//         onResultChanged: log.push("message result " + result)
//         onButtonClicked: (button, role) => log.push("message clicked " + button + " " + role)
//         onAccepted: log.push("message accepted")
//         onRejected: log.push("message rejected")
//         QtObject { id: inside }
//     }
//     MessageDialog { id: note; modality: Qt.NonModal; text: "Done." }
//     MediaPlayer { id: player; videoOutput: output }
//     VideoOutput { id: output; width: 100; height: 100 }
//     Image { id: picture; x: 100 }
// }
import { $object, QtObject } from "ljos-web/object";
import { Image, Item } from "ljos-web/QtQuick";
import {
  ColorDialog,
  FileDialog,
  filesIn,
  FolderDialog,
  MessageDialog,
  pickedFile,
  pickedFolder,
} from "ljos-web/QtQuick/Dialogs";
import { MediaPlayer, VideoOutput } from "ljos-web/QtMultimedia";
import { make } from "../scene.js";

const names = [
  "root",
  "files",
  "plain",
  "folder",
  "colors",
  "white",
  "message",
  "inside",
  "note",
  "player",
  "output",
  "picture",
];
export const objects = {
  log: [],
  FileDialog,
  FolderDialog,
  ColorDialog,
  MessageDialog,
  filesIn,
  pickedFile,
  pickedFolder,
};

export default function Dialogs() {
  for (const name of names) objects[name] = $object();
  const { log, root, files, plain, folder, colors, white, message, inside, note, player, output, picture } = objects;
  // What every dialog says of itself.
  const told = (name, dialog) => ({
    $self: dialog,
    onVisibleChanged: () => log.push(`${name} visible ${dialog.visible}`),
    onResultChanged: () => log.push(`${name} result ${dialog.result}`),
    onAccepted: () => log.push(`${name} accepted`),
    onRejected: () => log.push(`${name} rejected`),
  });
  return make(Item, { $self: root, width: 200, height: 100 }, () => [
    make(FileDialog, {
      ...told("files", files),
      title: "Choose a film",
      nameFilters: ["Films (*.webm *.mp4)", "Sounds (*.wav)", "All files (*)"],
      selectedNameFilter$index: 0,
      onSelectedFilesChanged: () => log.push(`files files ${files.selectedFiles.length}`),
      onSelectedFileChanged: () => log.push(`files file ${files.selectedFile !== ""}`),
    }),
    make(FileDialog, { $self: plain }),
    make(FolderDialog, {
      $self: folder,
      onSelectedFolderChanged: () => log.push("folder folder"),
      onAccepted: () => log.push("folder accepted"),
      onRejected: () => log.push("folder rejected"),
    }),
    make(ColorDialog, {
      ...told("colors", colors),
      selectedColor: "red",
      onSelectedColorChanged: () => log.push(`colors color ${colors.selectedColor}`),
    }),
    make(ColorDialog, { $self: white }),
    make(
      MessageDialog,
      {
        ...told("message", message),
        title: "Leaving",
        text: "The document was changed.",
        informativeText: "Save it?",
        get buttons() {
          return MessageDialog.Cancel | MessageDialog.Save | MessageDialog.Discard;
        },
        onButtonClicked: (button, role) => log.push(`message clicked ${button} ${role}`),
      },
      () => make(QtObject, { $self: inside }),
    ),
    make(MessageDialog, { $self: note, modality: 0, text: "Done." }),
    make(MediaPlayer, { $self: player, videoOutput: output }),
    make(VideoOutput, { $self: output, width: 100, height: 100 }),
    make(Image, { $self: picture, x: 100 }),
  ]);
}
