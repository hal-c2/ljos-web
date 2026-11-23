.pragma library
// The dispatch app's two modules, each built from its own board.ts: the
// list it starts as (DispatchList.qml) and the board the replay's edit
// makes of it (DispatchBoard.qml). A view's loader takes `sourceFor(view)`
// as its source, the one function that names the module the view wants
// (`view.wanted`), so a reload of the loader is what puts the other in.
function sourceFor(view) {
    return function () {
        return view.wanted === "board" ? import("./DispatchBoard.qml") : import("./DispatchList.qml");
    };
}
