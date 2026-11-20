import QtQuick
import Ljos.Observer

// Ljós's Observer, the one `ljos observe` opens, on an app of this page:
// its objects, their properties as they change, its frames, its log. It
// asks through an `InspectorClient` given the token the `Inspector` here
// serves `target` under, and is answered from `target` itself. Anything
// that runs an app may hold one (a stage, a shell's panel, the front
// page): give it the app's root, and what the app said (`logs`, as
// `ljos-web/Ljos/Observer` reads a log), or the page's log is shown.
// Not in the qmldir: a page that never opens it fetches none of it.
Item {
    id: panel

    property var target: null
    property var logs: null
    property string title: ""
    // The token what is served answers to: another client may ask too.
    readonly property alias tokenFile: inspector.tokenFile

    Inspector {
        id: inspector
        target: panel.target
        logs: panel.logs
        title: panel.title
    }

    WindowContainer {
        anchors.fill: parent
        window: Observer {
            tokenFile: inspector.tokenFile
        }
    }
}
