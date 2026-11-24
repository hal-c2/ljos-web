.pragma library
// The dispatch app's two modules, each built from its own board.ts: the
// list it starts as (DispatchList.qml) and the board the replay's edit
// makes of it (DispatchBoard.qml). A view's loader takes `sourceFor(wanted)`
// as its source, the one function that names the module the view wants
// (what `wanted()` answers), so a reload of the loader is what puts the
// other in.
function sourceFor(wanted) {
    return function () {
        return wanted() === "board" ? import("./DispatchBoard.qml") : import("./DispatchList.qml");
    };
}

// The swap to the module the view now wants: a reload of the loader,
// which answers why it failed, or "". The desktop's boards.native.js
// gives the loader the wanted file's address instead.
function reload(shell, wanted) {
    return shell.reloadModule();
}

// What a still poster's loader stands its board on: the board's own
// component, here.
function still(board) {
    return board;
}
