pragma Singleton
import QtQuick
import Site

// What the build writes into Content.qml, read by name. That file is not
// in a checkout until site-ljos's build runs, and CI's `ljos check` runs
// before it: a typed file that named it would read a name that is not in
// scope. The files that use it read it here, so they stay typed
// throughout. The showcase's apps are ShowcaseBuilt's, so this one, read
// on every page, does not bring them into the first load.
QtObject {
    // Where the site stands: "/" here, the base path where it is served
    // under one.
    readonly property string base: Content.base
}
