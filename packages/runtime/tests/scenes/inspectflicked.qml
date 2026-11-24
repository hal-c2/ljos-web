import QtQuick
import Ljos.Observer

// An application with buttons a Flickable has scrolled out of its view: one
// whose centre is still on the root, over what is under the Flickable, and
// one whose centre is past the root's edge. A client asks of it as the
// Observer asks.
Item {
    id: root
    width: 400; height: 300
    property alias app: app
    property alias list: list
    property alias inspector: inspector
    property alias client: client
    property var answers: []

    Rectangle {
        id: app
        objectName: "app"
        width: 300; height: 200
        property int near: 0
        property int far: 0
        property int under: 0
        MouseArea { id: under; anchors.fill: parent; onClicked: app.under++ }
        Flickable {
            id: list
            x: 150; width: 100; height: 100
            contentWidth: 100; contentHeight: 400
            MouseArea { id: near; y: 150; width: 100; height: 40; onClicked: app.near++ }
            MouseArea { id: far; y: 350; width: 100; height: 40; onClicked: app.far++ }
        }
    }

    Inspector { id: inspector; target: app; title: "app" }

    InspectorClient {
        id: client
        tokenFile: inspector.tokenFile
        clientName: "test"
        onAnswered: (serial, tool, ok, result) => root.answers.push({ serial: serial, tool: tool, ok: ok, result: result })
    }
}
