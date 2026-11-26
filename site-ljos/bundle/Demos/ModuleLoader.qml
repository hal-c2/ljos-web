pragma Scripts: JavaScript
import Ljos.Ui

// A Loader given what Ljos.Ui's cannot be given yet: a module that comes
// as a lazy import (a function that answers `import("…")`) or as the live
// module a reader's edits made. Ljos.Ui's Loader takes its `source` as a
// url only, and its `component` as a Component, never missing. The file
// is plain JavaScript (the pragma) so those untyped values reach it; the
// files that use it stay typed throughout.
Loader {
    // The lazy import or live module, or nothing.
    property unknown module
    // The component made where nothing is in `module`, or nothing.
    property unknown made
    source: module
    component: made
}
