import QtQuick
import Ljos.Blocks

// AgentView's loader, given what Ljos.Blocks' ShellLoader cannot be given
// yet: its `source` and `fallback` are urls, where the dispatch app's
// modules come as a lazy import (boards.js) and a component, and its item
// is a QtObject, where the view reads the DispatchCard it made. Its
// `reload` is the web runtime's: the native ShellLoader's type has none.
ShellLoader {
    id: loader
    // The lazy import of the module the view wants, or nothing.
    property var module
    // What stands in until then, or nothing.
    property var stand
    readonly property DispatchCard card: item
    source: module
    fallback: stand

    // Makes the module again from what `module` gives now, and answers
    // why the swap happened (or did not).
    function reloadModule(): var {
        return loader.reload();
    }
}
