// Items found by the name their author gives them, and one with none.
import QtQuick

Item {
    width: 200
    height: 100

    property alias named: named

    Rectangle {
        id: named
        objectName: "card"
        width: 50
        height: 50
    }
    Rectangle {
        x: 60
        width: 50
        height: 50
    }
}
