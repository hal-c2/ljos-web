import QtQuick
import Ljos.Blocks

// AgentView's loader, given what Ljos.Blocks' ShellLoader cannot be given
// yet: its `source` and `fallback` are urls, where the dispatch app's
// modules come as a lazy import (boards.js) and a component, and its item
// is a QtObject, where the view reads the DispatchCard it made.
ShellLoader {
    // The lazy import of the module the view wants, or nothing.
    property var module
    // What stands in until then, or nothing.
    property var stand
    readonly property DispatchCard card: item
    source: module
    fallback: stand
}
