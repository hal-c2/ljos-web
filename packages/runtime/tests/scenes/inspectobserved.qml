import QtQuick
import Ljos.Observer

// An application and a client asking of it, as the Observer asks: the
// Inspector serves `app` under a token, and the client given that token is
// answered from it, in the shapes `ljos observe`'s inspector answers in.
Item {
    id: root
    width: 400; height: 300
    property alias app: app
    property alias inspector: inspector
    property alias client: client
    property alias spinner: spinner
    property var answers: []

    Rectangle {
        id: app
        objectName: "app"
        width: 300; height: 200
        color: count % 2 ? "teal" : "white"
        property int count: 0
        property int doubled: count * 2
        Text { id: label; objectName: "label"; text: "n=" + app.count }
        MouseArea { id: area; x: 0; y: 50; width: 100; height: 50; onClicked: app.count++ }
        Rectangle {
            id: spinner
            x: 150; y: 50; width: 20; height: 20; color: "orange"
            NumberAnimation on rotation { id: spin; running: false; from: 0; to: 360; duration: 300 }
        }
        Timer { id: tick; interval: 50; onTriggered: app.count++ }
    }

    Inspector { id: inspector; target: app }

    InspectorClient {
        id: client
        tokenFile: inspector.tokenFile
        clientName: "test"
        onAnswered: (serial, tool, ok, result) => root.answers.push({ serial: serial, tool: tool, ok: ok, result: result })
    }

    function spinOnce() { spin.start() }
    function tickOnce() { tick.start() }
    function say(line) { console.log(line) }
}
