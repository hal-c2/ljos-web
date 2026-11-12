// A whole file in Ljós's API, as `ljos migrate` writes it of
// `ljosuicompat.qml` beside it: the two draw the same (ljosui.spec.js).
import Ljos.Ui
import Ljos.Layout

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
            fill: "tomato"
            radius: 4

            Tap { onTapped: root.taps++ }
        }

        Rectangle {
            width: 50
            height: 10
            fill: "seagreen"
        }
    }

    // Under the column, not in it: a Text in a layout halts the wasm
    // kernel today, in Qt's form too.
    Text {
        id: label
        y: 70
        text: "Hello"
        font.size: 20
        align: Text.AlignHCenter
        wrap: Text.WordWrap
        format: Text.PlainText
    }
}
