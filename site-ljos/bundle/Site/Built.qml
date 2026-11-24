pragma Singleton
import QtQuick
import Site

// What the build writes into the bundle (Content.qml, ShowcaseApps.qml),
// read by name. Those files are not in a checkout until site-ljos's build
// runs, and CI's `ljos check` runs before it: a typed file that named them
// would read a name that is not in scope. The files that use them read
// them here, so they stay typed throughout.
QtObject {
    // Where the site stands: "/" here, the base path where it is served
    // under one.
    readonly property string base: Content.base
    // The apps the showcase shows (Showcase/products.json).
    readonly property var apps: ShowcaseApps.apps
}
