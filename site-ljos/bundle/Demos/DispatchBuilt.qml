pragma Singleton
import QtQuick
import Demos

// DispatchSource, which the build writes from the dispatch app's two
// boards, read by name: it is not in a checkout until site-ljos's build
// runs, and CI's `ljos check` runs before it (see Site/Built.qml).
QtObject {
    // Each board's code ("list", "board"): its lines, the edit's lines
    // and its markup.
    readonly property var boards: DispatchSource
}
