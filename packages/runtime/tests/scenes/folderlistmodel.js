// import Qt.labs.folderlistmodel
// Item {
//     id: root; width: 400; height: 300
//     FolderListModel {
//         id: files; folder: "host:/dir"
//         onStatusChanged: log.push("status " + status + " " + count)
//         onCountChanged: log.push("count " + count)
//     }
//     Repeater {
//         id: rows; model: files
//         Rectangle {
//             required property string fileName; required property url fileUrl; required property bool fileIsDir
//             y: index * 20; width: 100; height: 18
//             property var all: [index, fileName, fileUrl, fileURL, fileIsDir, model.fileSuffix]
//             Component.onDestruction: log.push("destroyed " + fileName)
//         }
//     }
//     FolderListModel { id: pictures; nameFilters: ["*.png", "*.jpg"]; showDirs: false }
// }
//
// The page says what is in a folder: the one Qt was asked about, as it gave
// it unsorted.
import { $component, $define, $object } from "ljos-web/object";
import { FolderListModel, folders } from "ljos-web/Qt/labs/folderlistmodel";
import { Item, Rectangle, Repeater } from "ljos-web/QtQuick";
import { make } from "../scene.js";

const now = new Date(Date.UTC(2026, 9, 3, 11, 53, 36));
const table = {
  "host:/dir": [
    { fileName: "a2.PNG", fileSize: 4, fileModified: new Date(Date.UTC(2024, 1, 1)) },
    { fileName: "a10.png", fileSize: 2, fileModified: now },
    { fileName: "noext", fileSize: 0, fileModified: now },
    { fileName: "C.png", fileSize: 5, fileModified: new Date(Date.UTC(2024, 2, 1)) },
    { fileName: "a.tar.gz", fileSize: 1, fileModified: now },
    { fileName: "b.txt", fileSize: 3, fileModified: "2024-01-01T00:00:00Z" },
    { fileName: "Zdir", fileIsDir: true, fileSize: 40, fileModified: now },
    { fileName: "sub/", fileSize: 40, fileModified: now.getTime() },
    ".dot",
    ".hid/",
  ],
  "host:/dir/sub": ["deep file.txt"],
  // Where the host looks when it is not told where.
  "": [{ fileName: "home.jpg", fileUrl: "host:/home/home.jpg" }, "notes.txt"],
};

export const objects = { log: [], made: 0, asked: [], table, folders, FolderListModel };

folders.list = (url) => {
  objects.asked.push(url);
  return table[url];
};

export default function Folders() {
  const { log } = objects;
  for (const name of ["root", "files", "rows", "pictures"]) objects[name] = $object();
  const { root, files, rows, pictures } = objects;
  return make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(FolderListModel, {
      $self: files,
      folder: "host:/dir",
      onStatusChanged: () => log.push(`status ${files.status} ${files.count}`),
      onCountChanged: () => log.push(`count ${files.count}`),
    }),
    make(Repeater, {
      $self: rows,
      get model() {
        return files;
      },
      delegate: $component(($data) => {
        objects.made++;
        return $define(
          make(Rectangle, {
            get y() {
              return $data.index * 20;
            },
            width: 100,
            height: 18,
            Component$onDestruction: () => log.push(`destroyed ${$data.fileName}`),
          }),
          {
            all: [() => [$data.index, $data.fileName, $data.fileUrl, $data.fileURL, $data.fileIsDir, $data.model.fileSuffix]],
          },
        );
      }),
    }),
    make(FolderListModel, { $self: pictures, nameFilters: ["*.png", "*.jpg"], showDirs: false }),
  ]);
}
