.pragma library
// In the browser each is a function giving import() of its module, so
// it is fetched only when first asked for. Ljós on the desktop (`mise run
// site:native`) has no import() of a QML file yet, so there each is its
// file's address, which a Loader makes as it is asked for all the same.
var browser = Qt.platform.os === "wasm";
// The address of a QML file beside this one, for the desktop, from its
// name without ".qml". The web compiler makes any QML file's name
// written out whole into an import of that file, which would put it in
// the first load of every page that imports this one.
var QML = ".qml";
function fileAt(name) { return Qt.resolvedUrl(name + QML); }
// The shells a reader picks, each a module of its own that comes the
// first time it is picked: every page is written in Elegant, and a
// page's first load carries only that one (tests/payload.spec.js).
// In the browser each is one function, the same each time it is asked
// for, so the loader is not given a new source on every read.

var cyberpunk = browser ? function () { return import("./Cyberpunk.qml"); } : fileAt("Cyberpunk");

var workbench = browser ? function () { return import("./Workbench.qml"); } : fileAt("Workbench");

var desktop = browser ? function () { return import("./Desktop.qml"); } : fileAt("Desktop");
