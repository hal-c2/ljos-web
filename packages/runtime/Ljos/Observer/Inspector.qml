import QtQml
import "inspecting.mjs" as Inspecting

// Serves `target`, an object of this page, to the `InspectorClient` given
// its `tokenFile`: what natively an application's inspector is, which
// `ljos observe` asks over the network. A new target is a reload of the one
// served; the Inspector gone, or its target null, nothing is.
QtObject {
    id: inspector

    // What is served: the root of an application.
    property var target: null
    // Where its log comes from (`ljos-web/Ljos/Observer`'s LogSource): the
    // page's console when null. Given another, the target is served anew.
    property var logs: null
    // The title the application's window is said to have.
    property string title
    // What the target is served under, and its address: empty while
    // nothing is.
    readonly property string tokenFile: last.tokenFile
    readonly property string url: last.url

    // What the members above are read from: only the runtime writes it.
    readonly property QtObject last: QtObject {
        property string tokenFile
        property string url
    }

    onTargetChanged: Inspecting.follow(inspector)
    // Another log or title is another application's: served anew.
    onLogsChanged: Inspecting.follow(inspector)
    onTitleChanged: Inspecting.follow(inspector)
    Component.onCompleted: Inspecting.follow(inspector, true)
    Component.onDestruction: Inspecting.release(inspector)
}
