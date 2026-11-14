import QtQuick

// Items that are links: an `a` each, with the address its `href` says,
// whether a MouseArea in it follows a press or nothing does.
Item {
    id: root
    width: 400
    height: 300
    property var log: []
    property string onward: "/start/"

    Item {
        id: held
        property string href: root.onward
        width: 120
        height: 30
        Accessible.role: Accessible.Link
        Accessible.name: "Start here"
        Text { text: "Start" }
        MouseArea { anchors.fill: parent; onClicked: root.log.push("held") }
    }

    Rectangle {
        id: bare
        property string href: "#bare"
        y: 40
        width: 120
        height: 30
        color: "steelblue"
        Accessible.role: Accessible.Link
        Accessible.name: "Bare"
    }

    Rectangle {
        id: button
        property string href: "/not-a-link/"
        y: 80
        width: 120
        height: 30
        color: "tomato"
        Accessible.role: Accessible.Button
        Accessible.name: "Press"
    }

    Item {
        id: script
        property string href: "javascript:void 0"
        y: 120
        width: 120
        height: 30
        Accessible.role: Accessible.Link
        Accessible.name: "Script"
    }

    function items() {
        return { held: held, bare: bare, button: button, script: script }
    }

    function step() {
        root.onward = "/start/first-app/"
    }
}
