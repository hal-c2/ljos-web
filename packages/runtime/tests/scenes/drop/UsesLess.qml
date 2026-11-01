import QtQuick
import QtQuick.Layouts
import Shop

// The site's shell after a save that says less of its use than Uses.qml does.
RowLayout {
    objectName: "uses"
    Panel {
        id: panel
        objectName: "panel"
        Layout.preferredWidth: 88
    }
    Rectangle {
        objectName: "beside"
        height: 10
        implicitWidth: 10
    }
}
