import QtQuick
import Ljos.Observer

// Words and a button at opacity 0, by themselves or under an item that is,
// beside words that are drawn. A client asks of it as the Observer asks.
Item {
    id: root
    width: 200; height: 100
    property alias app: app
    property alias inspector: inspector
    property alias client: client
    property var answers: []

    Rectangle {
        id: app
        objectName: "app"
        width: 200; height: 100
        Text { id: plain; text: "plain" }
        Text { id: faded; y: 20; opacity: 0; text: "faded" }
        Item {
            id: veil
            y: 40; width: 100; height: 20
            opacity: 0
            Text { id: veiled; text: "veiled" }
        }
        Rectangle {
            id: hold
            y: 60; width: 80; height: 20
            opacity: 0
            Accessible.role: Accessible.Button
            Accessible.name: "Faded hold"
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
