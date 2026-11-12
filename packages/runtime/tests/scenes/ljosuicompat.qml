// The QtQuick form of `ljosuidialect.qml` beside it, before
// `ljos migrate`: the two draw the same (ljosui.spec.js).
import QtQuick

Item {
    id: root
    width: 400
    height: 300

    property int taps: 0
    property alias theBox: box
    property alias theLabel: label

    Column {
        spacing: 5

        Rectangle {
            id: box
            width: 100
            height: 50
            color: "tomato"
            radius: 4

            TapHandler { onTapped: root.taps++ }
        }

        Rectangle {
            width: 50
            height: 10
            color: "seagreen"
        }
    }

    Text {
        id: label
        y: 70
        text: "Hello"
        font.pixelSize: 20
        horizontalAlignment: Text.AlignHCenter
        wrapMode: Text.WordWrap
        textFormat: Text.PlainText
    }
}
