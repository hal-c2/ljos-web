pragma Singleton
import QtQuick
import Site

// The apps the showcase shows (Showcase/products.json), which the build
// writes into ShowcaseApps.qml, read by name as Built reads Content. Its
// own singleton, so only the showcase's module carries them.
QtObject {
    readonly property var apps: ShowcaseApps.apps
}
