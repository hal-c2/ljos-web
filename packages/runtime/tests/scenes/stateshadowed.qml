// A file that declares `states`, `state` or `transitions` of its own over an
// Item's: each is the file's, and the item's states go by the item's own.
import QtQuick

Item {
    id: root
    width: 300
    height: 200
    property bool narrow: true
    property var heard: []

    // What it was told, as a request's handler keeps the steps it went through.
    Item {
        id: listed
        property string states: ""
        function add(text) {
            states += text
        }
    }

    // What it is busy with, beside states that a `when` decides.
    Rectangle {
        id: named
        width: 50
        height: 50
        property string state: "wide"
        onStateChanged: root.heard.push(state)
        states: [
            State {
                name: "narrow"
                when: root.narrow
                PropertyChanges {
                    target: named
                    width: 20
                }
            },
            State {
                name: "wide"
                PropertyChanges {
                    target: named
                    width: 120
                }
            }
        ]
    }

    // Records of its own, which are no Transition.
    Rectangle {
        id: moved
        width: 50
        height: 50
        property var transitions: [{ enabled: true, from: "*", to: "*" }]
        states: State {
            name: "narrow"
            when: root.narrow
            PropertyChanges {
                target: moved
                width: 20
            }
        }
    }

    function read() {
        return [listed.states, named.state, named.width, moved.transitions.length, moved.width, root.heard.join()]
    }

    function widen() {
        listed.add("1")
        named.state = "busy"
        root.narrow = false
    }
}
