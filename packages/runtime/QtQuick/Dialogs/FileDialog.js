// FileDialog and FolderDialog: the browser's file picker.
//
// What the user picks reaches QML as URLs: a `blob:` one for a file, which
// `Image.source` and `MediaPlayer.source` take, and one made up for a
// folder, whose files `filesIn` lists (see files.js).
import { defineType, derived, group, slot } from "../../object.ts";
import { Dialog } from "./Dialog.js";
import { fileUrl, folderUrl, pickedFolder } from "./files.js";
import { picker } from "./picker.js";

const OPEN_FILE = 0;
const OPEN_FILES = 1;
const SAVE_FILE = 2;

const ALL = Object.freeze(["All Files (*)"]);
const NONE = Object.freeze([]);

// What a picker's type list is keyed by. It is a kind of file to the
// browser, which adds the suffixes it knows for the kind: none, for this.
const KIND = "application/x-file";
// A suffix as a picker takes it, the dot not counted.
const SUFFIX = /^[A-Za-z0-9+]+(\.[A-Za-z0-9+]+)*$/;

const list = (value) => (value == null ? [] : typeof value === "string" ? [value] : Array.from(value));

// "Images (*.png *.jpg)" as Qt takes it apart: the name before the first
// parenthesis, the globs between it and the last one, and of each glob what
// follows "*.".
function parse(filter) {
  const text = String(filter ?? "");
  const from = text.indexOf("(");
  const to = text.lastIndexOf(")");
  if (from < 0 || to < from) return { name: text, globs: [], extensions: [] };
  const globs = text.slice(from + 1, to).split(" ").filter(Boolean);
  const extensions = globs.map((glob) => {
    const at = glob.indexOf("*.");
    return at < 0 ? glob : glob.slice(at + 2);
  });
  return { name: text.slice(0, from).trim(), globs, extensions };
}

// The suffixes a filter lets through, as a browser lists them: nothing for
// a filter that says more than a list of suffixes can, "*" among them.
function suffixes(filter) {
  const found = [];
  for (const glob of parse(filter).globs) {
    const suffix = glob.startsWith("*.") ? glob.slice(2) : "";
    if (!SUFFIX.test(suffix) || suffix.length > 15) return null;
    found.push(`.${suffix}`);
  }
  return found.length ? found : null;
}

// The filter the picker starts with: the selected one, or the first.
const first = (self) => Math.max(0, self.selectedNameFilter.index);
const selected = (self) => list(self.nameFilters)[self.selectedNameFilter.index];

// Where the picker starts: a folder picked before, where the browser can
// be told.
const start = (self) => pickedFolder(self.currentFolder)?.handle;

export const FileDialog = defineType("FileDialog", Dialog, {
  properties: {
    fileMode: OPEN_FILE,
    nameFilters: ALL,
    selectedNameFilter: group({
      index: -1,
      name: derived((self) => parse(selected(self)).name),
      extensions: derived((self) => parse(selected(self)).extensions),
      globs: derived((self) => parse(selected(self)).globs),
    }),
    currentFolder: "",
    selectedFile: "",
    selectedFiles: NONE,
  },
  enums: { OpenFile: OPEN_FILE, OpenFiles: OPEN_FILES, SaveFile: SAVE_FILE },
  resolve: {
    // Qt reads -1 until a filter is selected, and the first for an index
    // that names none.
    selectedNameFilter$index(self, own) {
      const index = own();
      if (index === -1) return -1;
      return Number.isInteger(index) && index >= 0 && index < list(self.nameFilters).length ? index : 0;
    },
  },
  methods: {
    $present() {
      // A page has nowhere to save to.
      if (this.fileMode === SAVE_FILE) return this.reject();
      this.$picker.present();
    },
    $dismiss() {
      this.$picker.dismiss();
    },
  },
  setup(self) {
    self.$picker = picker(self, {
      ask() {
        if (typeof window.showOpenFilePicker !== "function") return null;
        const options = { multiple: self.fileMode === OPEN_FILES };
        const filters = list(self.nameFilters);
        const chosen = first(self);
        // The picker starts with the first type it is given, and offers
        // every file besides.
        if (suffixes(filters[chosen])) {
          options.types = [filters[chosen], ...filters.filter((_, index) => index !== chosen)]
            .filter(suffixes)
            .map((filter) => ({ description: parse(filter).name, accept: { [KIND]: suffixes(filter) } }));
        }
        const folder = start(self);
        if (folder) options.startIn = folder;
        return window
          .showOpenFilePicker(options)
          .then((handles) => Promise.all(handles.map((handle) => handle.getFile())));
      },
      // An input has one list of suffixes, and offers every file besides.
      prepare(input) {
        input.multiple = self.fileMode === OPEN_FILES;
        input.accept = suffixes(list(self.nameFilters)[first(self)])?.join(",") ?? "";
      },
      read: (files) => files,
      took(files) {
        const urls = files.map(fileUrl);
        slot(self, "selectedFiles").write(urls);
        slot(self, "selectedFile").write(urls[0]);
        self.accept();
      },
    });
  },
});

export const FolderDialog = defineType("FolderDialog", Dialog, {
  properties: {
    currentFolder: "",
    selectedFolder: "",
  },
  methods: {
    $present() {
      this.$picker.present();
    },
    $dismiss() {
      this.$picker.dismiss();
    },
  },
  setup(self) {
    self.$picker = picker(self, {
      ask() {
        if (typeof window.showDirectoryPicker !== "function") return null;
        const options = { mode: "read" };
        const folder = start(self);
        if (folder) options.startIn = folder;
        return window.showDirectoryPicker(options).then((handle) => ({ name: handle.name, handle }));
      },
      prepare(input) {
        input.webkitdirectory = true;
      },
      // Every file under the folder, each with its path from the folder's
      // name on. A folder with none in it cannot be told from no folder.
      read(files) {
        const name = files[0]?.webkitRelativePath.split("/")[0];
        return name ? { name, files } : null;
      },
      took(folder) {
        slot(self, "selectedFolder").write(folderUrl(folder));
        self.accept();
      },
    });
  },
});
