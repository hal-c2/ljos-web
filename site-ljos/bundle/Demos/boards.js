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
function sourceFor(wanted) {
    if (Qt.platform.os !== "wasm")
        return Qt.resolvedUrl(wanted() === "board" ? "DispatchBoard.qml" : "DispatchList.qml");
    return function () {
        return wanted() === "board" ? import("./DispatchBoard.qml") : import("./DispatchList.qml");
    };
}
