import QtQuick

// A block that passes on what a shell gives it, to a Text of its own.
Item {
    objectName: "headline"
    width: 100
    height: 20
    property string title: ""
    Text {
        objectName: "headlineText"
        text: parent.title
    }
}
