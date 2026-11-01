// The stand-in Qt's Basic button: 123 by 45, which no style of Ljós's is.
import QtQuick
import QtQuick.Templates as T

T.Button {
    id: control
    objectName: "stand-in Qt Basic"
    implicitWidth: 123
    implicitHeight: 45
    contentItem: Text { text: control.text }
}
