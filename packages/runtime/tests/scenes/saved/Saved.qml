// The file the dev server's scenario saves over: a field to type into.
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
        color: "black"
    }
}
