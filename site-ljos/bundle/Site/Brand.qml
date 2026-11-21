import QtQuick
import Site
import Ljos.Core
import "../nav.js" as Nav

// The name, a link to the front page: one link, the mark and the word
// in it, named for where it goes. The mark is in the page as written,
// so it stands before the page runs and where it never does
// (Nav.picture): the site's icon, the same file.
Item {
    id: home

    property string route: "/"
    // A tight bar (a workbench's, a desktop's) has the smaller one.
    property int size: 22
    readonly property string href: Nav.at(Content.base, "/")

    implicitWidth: mark.width + Theme.xs + wordmark.implicitWidth
    implicitHeight: 40
    activeFocusOnTab: true
    Accessible.role: Accessible.Link
    Accessible.name: t`Ljós, home`
    Accessible.onPressAction: () => Nav.go(home.href)
    Keys.onPressed: (event) => {
        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
            Nav.go(home.href);
            event.accepted = true;
        }
    }

    Text {
        id: mark
        width: Math.round(home.size * 1.27)
        height: width
        anchors.verticalCenter: parent.verticalCenter
        textFormat: Text.RichText
        text: Nav.picture(home.route, "/favicon.svg", mark.width, mark.width, "")
        Accessible.ignored: true
    }
    Text {
        id: wordmark
        x: mark.width + Theme.xs
        anchors.verticalCenter: parent.verticalCenter
        text: "Ljós"
        color: Theme.text
        font.family: Theme.sans
        font.pixelSize: home.size
        font.weight: Font.Bold
    }
    MouseArea {
        anchors.fill: parent
        Accessible.ignored: true
        cursorShape: Qt.PointingHandCursor
        onClicked: Nav.go(home.href)
    }
}
