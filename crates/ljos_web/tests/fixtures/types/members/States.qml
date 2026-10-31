import QtQuick

Rectangle {
    id: box
    states: State {
        name: "wide"
        PropertyChanges { box.widht: 10 }
    }
}
