// A column, placing its texts, in an item that anchors fill out: the
// graph evaluates the texts' bindings as the column's effect places them,
// and an object a binding gives then is made in that effect's callback.
import Ljos.Ui
import Ljos.Layout

Item {
    width: 360
    height: 200
    property alias second: second

    Rectangle {
        anchors.fill: parent
        anchors.margins: 10

        Column {
            anchors.centerIn: parent
            spacing: 6
            Text { width: 300; text: "first"; font: Font.of({ pixelSize: 18 }) }
            Text { id: second; width: 300; text: "second"; font: Font.of({ pixelSize: 18 }) }
        }
    }
}
