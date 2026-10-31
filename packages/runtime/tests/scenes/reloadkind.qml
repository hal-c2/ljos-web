// `box` is a Rectangle.
import QtQuick

Item {
    width: 400
    height: 300
    property alias box: box
    property alias inner: inner
    property alias other: other

    Rectangle {
        id: box
        width: 10
        height: 10
        Rectangle { id: inner; width: 5; height: 5 }
    }
    Rectangle { id: other; y: 20; width: 10; height: 10 }
}
