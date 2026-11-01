import QtQuick
import QtQuick.Layouts

// A block that says where what is written inside a use of it goes.
Rectangle {
    objectName: "panel"
    width: 60
    height: 40
    Layout.preferredHeight: 33
    property int opened: 0
    default property alias content: inner.data
    Item {
        id: inner
        objectName: "inner"
        anchors.fill: parent
    }
}
