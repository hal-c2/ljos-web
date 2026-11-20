import QtQuick
import Ljos.Observer

// The Observer itself, unchanged, beside the application it observes.
Item {
    id: root
    width: 1280; height: 760
    property alias app: app
    property alias inspector: inspector
    property alias observer: observer

    Rectangle {
        id: app
        objectName: "app"
        width: 300; height: 200
        color: count % 2 ? "teal" : "white"
        property int count: 0
        Text { id: label; objectName: "label"; text: "n=" + app.count }
        MouseArea { id: area; anchors.fill: parent; onClicked: app.count++ }
    }

    Inspector { id: inspector; target: app }

    WindowContainer {
        x: 320; width: 960; height: 760
        window: Observer { id: observer; tokenFile: inspector.tokenFile; width: 960; height: 760 }
    }
}
