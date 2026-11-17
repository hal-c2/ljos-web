import QtQuick
import QtQuick.Controls

// A styled DialogButtonBox, which holds its buttons itself, with buttons a
// Repeater makes: fewer of them is fewer buttons in the box.
Item {
    id: root
    width: 400
    height: 300
    property int count: 3
    property alias box: box
    DialogButtonBox {
        id: box
        Repeater {
            model: root.count
            Button { required property int index; text: "B" + index }
        }
    }
}
