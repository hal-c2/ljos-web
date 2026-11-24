.pragma library
// The dispatch app's two modules, each built from its own board.ts: the
// list it starts as (DispatchList.qml) and the board the replay's edit
// makes of it (DispatchBoard.qml). A view's loader takes `sourceFor(wanted)`
// as its source, the one function that names the module the view wants
// (what `wanted()` answers), so a reload of the loader is what puts the
// other in.
//
// Ljós on the desktop has no import() of a QML file yet: there it is the
// wanted module's address as the loader is given it.
// The address of a QML file beside this one, for the desktop, from its
// name without ".qml". The web compiler makes any QML file's name
// written out whole into an import of that file, which would put it in
// the first load of every page that imports this one.
var QML = ".qml";
function fileAt(name) { return Qt.resolvedUrl(name + QML); }

// The board alone, as a still poster draws it on the desktop.
function boardAt() {
    return fileAt("DispatchBoard");
}

function sourceFor(wanted) {
    if (Qt.platform.os !== "wasm")
        return fileAt(wanted() === "board" ? "DispatchBoard" : "DispatchList");
    return function () {
        return wanted() === "board" ? import("./DispatchBoard.qml") : import("./DispatchList.qml");
    };
}
