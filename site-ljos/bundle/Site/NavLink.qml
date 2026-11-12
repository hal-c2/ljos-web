import QtQuick
import Site
import "../nav.js" as Nav

// One link of the shell: its words, the page it names a full
// navigation away. The page the reader is on is the strong one. A
// keyboard reaches it as a pointer does.
Item {
    id: link

    property string label: ""
    property string href: "/"
    property bool current: false
    property int size: 14

    implicitWidth: words.implicitWidth
    implicitHeight: words.implicitHeight + 4

    activeFocusOnTab: true
    Accessible.role: Accessible.Link
    Accessible.name: label
    Accessible.onPressAction: () => Nav.go(link.href)
    Keys.onPressed: (event) => {
        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
            Nav.go(link.href);
            event.accepted = true;
        }
    }

    Text {
        id: words
        anchors.verticalCenter: parent.verticalCenter
        text: link.label
        color: link.current ? Theme.accent : Theme.ink
        font.family: Theme.sans
        font.pixelSize: link.size
        font.bold: link.current
    }
    MouseArea {
        anchors.fill: parent
        Accessible.ignored: true
        cursorShape: Qt.PointingHandCursor
        onClicked: Nav.go(link.href)
    }
}
