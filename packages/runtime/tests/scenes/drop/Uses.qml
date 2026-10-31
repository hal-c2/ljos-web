import QtQuick
import QtQuick.Layouts
import Shop

// The site's own use of a block, with all a use may say besides what it sets.
RowLayout {
    objectName: "uses"
    Panel {
        id: panel
        objectName: "panel"
        Layout.preferredWidth: 77
        Layout.preferredHeight: 44
        focus: true
        property string key: ""
        Keys.onPressed: key = key + "a"
        property int extra: 3
        property alias said: words.text
        property string heard: ""
        signal pinged(string what)
        onPinged: (what) => heard = what
        function twice() {
            return extra * 2
        }
        Component.onCompleted: extra = extra + 1
        Text {
            id: words
            objectName: "words"
            text: "extra " + panel.extra + " in " + parent.objectName
        }
    }
    Rectangle {
        objectName: "beside"
        height: 10
        implicitWidth: 10
    }
}
