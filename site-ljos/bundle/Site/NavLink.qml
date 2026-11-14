import QtQuick
import Site
import "../nav.js" as Nav

// One link of the shell: its words, and the page it names, `to`, from
// the site's root or as another site's address. Its role makes it the
// page's own link (an `a` whose address is `href`, named as
// `Accessible.name` says), so a reader can open it in a new tab, a
// crawler follows it with no script, and Tab reaches it; a plain press
// goes there as `Nav.go` does. The page the reader is on is the strong
// one. Given a width, its words wrap to it.
Item {
    id: link

    property string label: ""
    property string to: "/"
    readonly property string href: Nav.at(Content.base, to)
    property bool current: false
    property int size: Theme.bodySize
    property int line: Theme.bodyLine
    property bool muted: false

    implicitWidth: words.implicitWidth
    implicitHeight: words.implicitHeight

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
        width: link.width
        text: link.label
        color: link.current ? Theme.link : link.muted ? Theme.textMuted : Theme.text
        font.family: Theme.sans
        font.pixelSize: link.size
        font.weight: link.current ? Font.DemiBold : Font.Normal
        font.underline: area.containsMouse
        lineHeightMode: Text.FixedHeight
        lineHeight: link.line
        wrapMode: Text.Wrap
    }
    MouseArea {
        id: area
        anchors.fill: parent
        Accessible.ignored: true
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: Nav.go(link.href)
    }
}
