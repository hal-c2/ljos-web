import QtQuick

// A Loader given what Ljos.Ui's cannot be given yet: a module that comes
// as a lazy import (a function that answers `import("…")`) or as the live
// module a reader's edits made. Ljos.Ui's Loader takes its `source` as a
// url only, and its `component` as a Component, never missing.
Loader {
    // The lazy import or live module, or nothing.
    property var module
    // The component made where nothing is in `module`, or nothing.
    property var made
    source: module
    sourceComponent: made
}
