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
    property alias other: other
    property alias otherInspector: otherInspector
    property var answers: []

    Rectangle {
        id: app
        objectName: "app"
        width: 300; height: 200
        color: count % 2 ? "teal" : "white"
        property int count: 0
        property int doubled: count * 2
        // A member another item holds, by another name.
        property alias caption: label.text
        // An object the application makes and lets go of again (churn).
        property QtObject current: null
        Text { id: label; objectName: "label"; text: "n=" + app.count }
        MouseArea { id: area; x: 0; y: 50; width: 100; height: 50; onClicked: app.count++ }
        Rectangle {
            id: spinner
            x: 150; y: 50; width: 20; height: 20; color: "orange"
            NumberAnimation on rotation { id: spin; running: false; from: 0; to: 360; duration: 300 }
        }
        Timer { id: tick; interval: 50; onTriggered: app.count++ }
        // Its own `visible` and `enabled`, of what it is about: it is still
        // shown, and takes input.
        Item {
            id: shown
            objectName: "shown"
            x: 200; y: 120; width: 10; height: 10
            property bool visible: false
            property bool enabled: false
        }
        Component { id: made; Item {} }
        // An alias of an alias, which ends at `label.text`, and one of an
        // object, which holds no value of its own.
        property alias outer: middle.caption
        property alias held: label
        Item { id: middle; property alias caption: label.text }
        // A file's own `font`: one value, over the group a Text has.
        Text { id: fonted; objectName: "fonted"; property string font: "serif" }
    }

    Inspector { id: inspector; target: app; title: "app" }

    // Another application on the same page, served under a token of its own
    // once a test gives its Inspector the target.
    Rectangle {
        id: other
        objectName: "other"
        x: 310; width: 80; height: 80
        Text { id: otherLabel; objectName: "otherLabel"; text: "other" }
    }
    Inspector { id: otherInspector; title: "other" }

    InspectorClient {
        id: client
        tokenFile: inspector.tokenFile
        clientName: "test"
        onAnswered: (serial, tool, ok, result) => root.answers.push({ serial: serial, tool: tool, ok: ok, result: result })
    }

    function spinOnce() { spin.start() }
    function tickOnce() { tick.start() }
    function say(line) { console.log(line) }
    function churn() {
        const before = app.current;
        app.current = made.createObject(app);
        if (before) before.destroy();
    }
}
