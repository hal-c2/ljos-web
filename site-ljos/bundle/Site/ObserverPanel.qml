import QtQuick
import Ljos.Observer
import Site

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

    // Never narrower than the Observer lays its pages out for: held in
    // less room, it is scrolled sideways to what is past the edge, as a
    // phone's sheet does, rather than drawn with its values squeezed out.
    Flickable {
        id: room
        anchors.fill: parent
        contentWidth: Math.max(width, Theme.observerWidth)
        contentHeight: height
        flickableDirection: Flickable.HorizontalFlick
        boundsBehavior: Flickable.StopAtBounds
        clip: true

        WindowContainer {
            width: room.contentWidth
            height: room.height
            window: Observer {
                tokenFile: inspector.tokenFile
            }
        }
    }
}
