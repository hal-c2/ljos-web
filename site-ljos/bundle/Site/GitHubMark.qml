import QtQuick
import Site
import Ljos.Core
import "../nav.js" as Nav

// The source, as an icon: GitHub's mark, a link named for where it goes.
// It is the page's own link (an `a`, as NavLink's is), so it is followed
// with no script and opened in a tab like any other.
Rectangle {
    id: link

    property string to: "https://github.com/hal-c2/ljos-ui"
    readonly property string href: Nav.at(Content.base, to)
    property int size: 20
    // The page it is on, which the picture's address is written from.
    property string route: "/"
    // The default look's pictures carry no name: every page is written in it.
    readonly property string picture: "/pictures/github-mark" + (Theme.lookName === "elegant" ? "" : "-" + Theme.lookName)

    implicitWidth: Theme.target
    implicitHeight: Theme.target
    radius: Theme.radiusSmall
    color: area.pressed ? Theme.surfacePressed : area.containsMouse ? Theme.surfaceHover : "transparent"

    activeFocusOnTab: true
    Accessible.role: Accessible.Link
    Accessible.name: t`Ljós on GitHub`
    Accessible.onPressAction: () => Nav.go(link.href)
    Keys.onPressed: (event) => {
        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
            Nav.go(link.href);
            event.accepted = true;
        }
    }

    // GitHub's mark, a picture as the name's is (Site/Brand.qml): drawn
    // with QtQuick.Shapes it would put that engine in every page's first
    // load, for one icon. A picture takes no colour from the page, so
    // the build writes one for each look and scheme (scripts/build.mjs). Both are
    // here and one is shown, as the theme toggle's moon and sun are: one
    // whose address followed the scheme would make the schemes' renders
    // differ in more than style, and each page carry both in full.
    Text {
        visible: !Theme.dark
        x: Math.round((link.width - link.size) / 2)
        y: Math.round((link.height - link.size) / 2)
        width: link.size
        height: link.size
        textFormat: Text.RichText
        text: Nav.picture(link.route, link.picture + ".svg", link.size, link.size, "")
        Accessible.ignored: true
    }
    Text {
        visible: Theme.dark
        x: Math.round((link.width - link.size) / 2)
        y: Math.round((link.height - link.size) / 2)
        width: link.size
        height: link.size
        textFormat: Text.RichText
        text: Nav.picture(link.route, link.picture + "-dark.svg", link.size, link.size, "")
        Accessible.ignored: true
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
