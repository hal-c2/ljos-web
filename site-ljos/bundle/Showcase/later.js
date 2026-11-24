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
// A showcase recording, imported once one is to play
// (Site/ShowcaseApp.qml's `source`). Not in a qmldir: what plays a
// video would then be in the files every page loads first.

var recording = browser ? function () { return import("./Recording.qml"); } : fileAt("Recording");
