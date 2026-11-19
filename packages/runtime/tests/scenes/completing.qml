import QtQuick
import Ljos.Blocks

// A part made as the page settles whose `Component.onCompleted` runs
// then too, and appends a child and changes a text: what it makes is
// made in a type's setup (`createObject`), and so in the count on
// either side.
Column {
    ShellLoader {
        width: 200
        height: 80
        fallback: settled
    }
    Component {
        id: settled
        Column {
            id: box
            Text {
                id: label
                text: "Before it completes"
            }
            Component.onCompleted: {
                label.text = "Completed, and a child added";
                extra.createObject(box);
            }
        }
    }
    Component {
        id: extra
        Rectangle {
            width: 20
            height: 10
            color: "tomato"
            Text { text: "Added on completion" }
        }
    }
}
