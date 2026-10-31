// The stand-in Qt's Imagine button: 77 by 33, which no style of Ljós's is.
import QtQuick
import QtQuick.Templates as T

T.Button {
    id: control
    objectName: "stand-in Qt Imagine"
    implicitWidth: 77
    implicitHeight: 33
    contentItem: Text { text: control.text }
}
