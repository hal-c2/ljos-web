// The rectangle's id is `box`.
import QtQuick

Item {
    width: 400
    height: 300
    property alias thing: box

    Rectangle { id: box; width: 10; height: 10 }
}
