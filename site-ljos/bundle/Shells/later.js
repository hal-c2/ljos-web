.pragma library
// The shells a reader picks, each a module of its own that comes the
// first time it is picked: every page is written in Marketing, and a
// page's first load carries only that one (tests/payload.spec.js).
// Each is one function, the same each time it is asked for, so the
// loader is not given a new source on every read.

function workbench() {
    return import("./Workbench.qml");
}

function desktop() {
    return import("./Desktop.qml");
}
