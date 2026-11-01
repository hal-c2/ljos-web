// A reload of a field that the user typed into: only its colour is edited.
import QtQuick
import QtQuick.Templates as T

Item {
    width: 400
    height: 300
    property alias field: field

    T.TextField {
        id: field
        x: 10
        y: 10
        width: 200
        color: "red"
    }
}
