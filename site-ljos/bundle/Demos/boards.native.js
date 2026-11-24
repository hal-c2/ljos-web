.pragma library
// boards.js on the desktop (`mise run site:native` puts it in that
// file's place). Ljós on the desktop has no import() of a QML file yet,
// and its ShellLoader no reload: the loader is given the wanted module's
// address, and a new address is the swap.
var QML = ".qml";

function sourceFor(wanted) {
    return Qt.resolvedUrl((wanted() === "board" ? "DispatchBoard" : "DispatchList") + QML);
}

// The loader makes the new address's shell at once and says in `error`
// why it fell back ("" once the shell shows), so that is the answer,
// which the stage clears its busy state on.
function reload(shell, wanted) {
    shell.module = sourceFor(wanted);
    return Promise.resolve().then(function () {
        return shell.error;
    });
}

// A still poster's board, by its address.
function still(board) {
    return Qt.resolvedUrl("DispatchBoard" + QML);
}
