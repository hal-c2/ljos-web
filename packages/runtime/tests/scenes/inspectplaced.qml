import QtQuick

Item {
    width: 100; height: 100
    Item {
        y: 30
        Repeater {
            model: 2
            Rectangle { id: cell; x: index * 20; width: 10; height: 10 }
        }
    }
    Item { id: hidden; x: 5; y: 7; width: 20; height: 30; visible: false }
}
