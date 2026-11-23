// A field a reader types in, in an item that is given another parent while
// it has the focus: the item keeps its focus, and so does the field's
// element, whose keys go on into the same text where the caret was.
import QtQuick

Item {
    id: root
    width: 400
    height: 300

    property bool below: false
    property alias input: input
    property alias box: box

    Item { id: above; width: 400; height: 100 }
    Item { id: under; y: 150; width: 400; height: 100 }

    Rectangle {
        id: box
        parent: root.below ? under : above
        width: 200; height: 40
        TextInput {
            id: input
            anchors.fill: parent
            focus: true
        }
    }
}
