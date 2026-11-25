pragma Singleton
import QtQuick
import Demos

// PantryProject, which the build writes from the Pantry's shell and
// blocks, read by name: it is not in a checkout until site-ljos's build
// runs, and CI's `ljos check` runs before it (see Site/Built.qml).
QtObject {
    // The shell the editor starts from, as text and as the build
    // highlighted it.
    readonly property string shellText: PantryProject.shellText
    readonly property string shellRich: PantryProject.shellRich
    // The blocks' files a visitor's shell compiles against, by path.
    readonly property var files: PantryProject.files
}
