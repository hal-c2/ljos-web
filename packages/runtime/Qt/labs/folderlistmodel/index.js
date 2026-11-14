// `import Qt.labs.folderlistmodel`: a model of what is in a folder.
//
// A browser has no folders to look in, so the page that embeds the program
// says what is in one: `folders.list = (url) => entries`, where an entry is a
// name (a folder's ends with `/`) or an object with the roles the host knows
// (`fileName`, and any of `fileIsDir`, `fileSize`, `fileModified`,
// `fileAccessed`, `fileUrl`, `filePath`). It may give a promise of them, and
// nothing (`null`) for a folder that does not exist. `folders.changed(url)`
// tells the models showing a folder that what is in it changed. With no host
// a folder has nothing in it, but for the one folder a browser does let a
// page look in: one the user picked in a FolderDialog.
import { onCleanup } from "solid-js";
import { defineType, derived, effect, settle, slot } from "../../../object.ts";
import { filesIn, pickedFile, pickedFolder } from "../../../QtQuick/Dialogs/files.js";
import { ready } from "../../../QtQuick/Image.js";
import { AbstractListModel, reset } from "../../../QtQuick/model.js";

const UNSORTED = 0;
const NAME = 1;
const TIME = 2;
const SIZE = 3;
const TYPE = 4;

const NULL = 0;
const READY = 1;
const LOADING = 2;

const ROLES = [
  "fileName",
  "filePath",
  "fileURL",
  "fileUrl",
  "fileBaseName",
  "fileSuffix",
  "fileSize",
  "fileModified",
  "fileAccessed",
  "fileIsDir",
];

// The models there are, for the host to tell.
const models = new Set();
let lister = null;

export const folders = {
  get list() {
    return lister;
  },
  set list(given) {
    lister = given;
    this.changed();
  },
  // Without a folder, all of them.
  changed(url) {
    for (const model of models) {
      // One that has yet to look will, and ask then.
      if (model.$wanted && (url === undefined || model.$shown === url)) look(model);
    }
    settle();
  },
};

const directory = (url) => (url === "" || url.endsWith("/") ? url : `${url}/`);

const date = (given) => (given instanceof Date ? given : new Date(given ?? Number.NaN));

function path(url) {
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return url;
  }
}

// An entry as a row: every role a delegate may ask for.
function row(entry, folder) {
  const given = typeof entry === "string" ? { fileName: entry } : entry;
  const named = String(given.fileName ?? "");
  const fileIsDir = given.fileIsDir ?? named.endsWith("/");
  const fileName = named.endsWith("/") ? named.slice(0, -1) : named;
  const fileUrl = given.fileUrl ?? given.fileURL ?? `${directory(folder)}${encodeURIComponent(fileName)}`;
  const dot = fileName.indexOf(".");
  return {
    fileName,
    filePath: given.filePath ?? path(fileUrl),
    fileURL: fileUrl,
    fileUrl,
    fileBaseName: dot < 0 ? fileName : fileName.slice(0, dot),
    fileSuffix: dot < 0 ? "" : fileName.slice(dot + 1),
    fileSize: Number(given.fileSize ?? 0),
    fileModified: date(given.fileModified),
    fileAccessed: date(given.fileAccessed ?? given.fileModified),
    fileIsDir: Boolean(fileIsDir),
  };
}

// `*.png`, `a?.txt`, `[bc]*` as a test of a whole name.
function wildcard(pattern, caseSensitive) {
  let source = "";
  for (let at = 0; at < pattern.length; at++) {
    const char = pattern[at];
    const close = char === "[" ? pattern.indexOf("]", at + 2) : -1;
    if (close > 0) {
      const set = pattern.slice(at + 1, close).replace(/[\\\]]/g, "\\$&");
      source += `[${set[0] === "!" ? `^${set.slice(1)}` : set}]`;
      at = close;
    } else if (char === "*") source += ".*";
    else if (char === "?") source += ".";
    else source += char.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
  }
  return new RegExp(`^${source}$`, caseSensitive ? "s" : "is");
}

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// The order Qt's QDir gives: by the field, then by name; folders before
// files when asked, whichever way the rest goes.
function order(rows, { sortField, sortReversed, showDirsFirst, sortCaseSensitive }) {
  if (sortField === UNSORTED && !showDirsFirst) return rows;
  const fold = sortCaseSensitive ? (text) => text : (text) => text.toLowerCase();
  const keyed = rows.map((row, index) => {
    const name = fold(row.fileName);
    return { row, index, name, type: name.slice(name.lastIndexOf(".") + 1 || name.length) };
  });
  keyed.sort((a, b) => {
    if (showDirsFirst && a.row.fileIsDir !== b.row.fileIsDir) return a.row.fileIsDir ? -1 : 1;
    if (sortField === UNSORTED) return a.index - b.index;
    let by = 0;
    if (sortField === TIME) by = compare(b.row.fileModified.getTime() || 0, a.row.fileModified.getTime() || 0);
    else if (sortField === SIZE) by = compare(b.row.fileSize, a.row.fileSize);
    else if (sortField === TYPE) by = compare(a.type, b.type);
    by ||= compare(a.name, b.name) || a.index - b.index;
    return sortReversed ? -by : by;
  });
  return keyed.map((each) => each.row);
}

// The rows of a folder's entries: the ones the model is to show, in its
// order.
function present(entries, folder, wanted) {
  const filters = (wanted.nameFilters ?? []).map((pattern) => wildcard(String(pattern), wanted.caseSensitive));
  const rows = [];
  if (wanted.showDotAndDotDot && wanted.showDirs) rows.push(row("./", folder), row("../", folder));
  for (const entry of entries) {
    const made = row(entry, folder);
    const { fileName, fileIsDir } = made;
    if (fileName === "." || fileName === ".." || fileName === "") continue;
    if (fileName[0] === "." && !wanted.showHidden) continue;
    if (fileIsDir ? !wanted.showDirs : !wanted.showFiles) continue;
    // Folders are shown whatever their names.
    if (!fileIsDir && filters.length && !filters.some((filter) => filter.test(fileName))) continue;
    rows.push(made);
  }
  return order(rows, wanted);
}

// The folder a folder is in, or nothing for one that is in none.
function parent(folder) {
  try {
    const url = new URL(folder);
    const inside = url.pathname.replace(/\/+$/, "");
    if (!inside) return "";
    url.pathname = inside.slice(0, inside.lastIndexOf("/")) || "/";
    return url.href.replace(/(?<=[^/:])\/$/, "");
  } catch {
    return "";
  }
}

function show(self, rows, status) {
  reset(self, rows);
  slot(self, "count").write(rows.length);
  settle();
  slot(self, "status").write(status);
  settle();
}

// The files of a folder the user picked, each by the URL that shows it.
// They are files at hand, and Qt has the picture of one the moment an Image
// is given it: a delegate places itself by how big its picture is as soon
// as it is made. So the pictures the model is to show are looked into
// before it shows them.
async function picked(folder, wanted) {
  const entries = (await filesIn(folder)).map(({ name, url, file }) => ({
    fileName: name,
    fileUrl: url,
    filePath: `${pickedFolder(folder).name}/${name}`,
    fileSize: file.size,
    fileModified: file.lastModified,
  }));
  const pictures = present(entries, folder, wanted).filter(({ fileUrl }) => pickedFile(fileUrl).type.startsWith("image/"));
  await Promise.all(pictures.map(({ fileUrl }) => ready(fileUrl)));
  return entries;
}

// Asks the host what is in the folder, and shows it. What is shown stays
// until the answer is here; an answer to a question since asked again is
// dropped.
function look(self) {
  const asked = (self.$asked = {});
  const folder = (self.$shown = self.$wanted.folder);
  self.$looking = true;
  slot(self, "status").write(LOADING);
  // Qt reads a folder on another thread: a model is never ready at once.
  Promise.resolve()
    .then(() => (pickedFolder(folder) ? picked(folder, self.$wanted) : lister ? lister(folder) : []))
    .then(
      (entries) => {
        if (self.$asked !== asked) return;
        self.$entries = entries;
        arrange(self);
      },
      (error) => {
        if (self.$asked !== asked) return;
        console.warn(`FolderListModel: ${error?.message ?? error}`);
        self.$entries = null;
        arrange(self);
      },
    );
}

// Shows the entries it has as the model now wants them.
function arrange(self) {
  self.$asked = null;
  self.$looking = false;
  const entries = self.$entries;
  if (entries == null) show(self, [], NULL);
  else show(self, present(Array.from(entries), self.$shown, self.$wanted), READY);
}

export const FolderListModel = defineType("FolderListModel", AbstractListModel, {
  properties: {
    folder: "",
    parentFolder: derived((self) => parent(self.folder ?? "")),
    nameFilters: ["*"],
    sortField: NAME,
    sortReversed: false,
    showFiles: true,
    showDirs: true,
    showDirsFirst: false,
    showDotAndDotDot: false,
    showHidden: false,
    caseSensitive: true,
    sortCaseSensitive: true,
    count: 0,
    status: NULL,
  },
  enums: { Unsorted: UNSORTED, Name: NAME, Time: TIME, Size: SIZE, Type: TYPE, Null: NULL, Ready: READY, Loading: LOADING },
  methods: {
    isFolder(index) {
      return this.$elements[index]?.fileIsDir ?? false;
    },
    // Qt knows `fileURL` in a delegate only.
    get(index, property) {
      return property === "fileURL" ? undefined : this.$elements[index]?.[property];
    },
    indexOf(file) {
      return this.$elements.findIndex((row) => row.fileUrl === String(file));
    },
  },
  setup(self) {
    self.$roles = ROLES;
    self.$entries = null;
    self.$asked = null;
    self.$looking = false;
    self.$shown = "";
    self.$wanted = null;
    models.add(self);
    onCleanup(() => models.delete(self));
    let folder;
    let key;
    effect(
      () => ({
        folder: String(self.folder ?? ""),
        nameFilters: [...(self.nameFilters ?? [])],
        sortField: self.sortField,
        sortReversed: self.sortReversed,
        showFiles: self.showFiles,
        showDirs: self.showDirs,
        showDirsFirst: self.showDirsFirst,
        showDotAndDotDot: self.showDotAndDotDot,
        showHidden: self.showHidden,
        caseSensitive: self.caseSensitive,
        sortCaseSensitive: self.sortCaseSensitive,
      }),
      (wanted) => {
        // Told again of what it already shows, it does not look again.
        const now = JSON.stringify(wanted);
        if (now === key) return;
        const first = key === undefined;
        key = now;
        self.$wanted = wanted;
        if (first || wanted.folder !== folder || self.$looking) {
          folder = wanted.folder;
          return look(self);
        }
        // The same folder shown another way: as Qt does, not at once.
        const asked = (self.$asked = {});
        slot(self, "status").write(LOADING);
        Promise.resolve().then(() => {
          if (self.$asked === asked) arrange(self);
        });
      },
    );
  },
});
