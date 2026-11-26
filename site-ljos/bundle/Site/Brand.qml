pragma Scripts: JavaScript
import Ljos.Ui
import Site
import Ljos.Core
import "../nav.js" as Nav

// The name, a link to the front page: one link, the logo in it, named
// for where it goes. The logo is the user's file as the README shows it
// (assets/ljos.svg: the panels and the script word), never redrawn or
// set in a shell's type, so no shell's look reaches it. It is in the
// page as written, so it stands before the page runs and where it never
// does (Nav.picture).
Item {
    id: home

    property string route: "/"
    // How tall the logo is drawn; a bar narrower than a header's (Desktop's
    // menu bar) asks for less, so the logo keeps room above and below.
    property int logoHeight: 40
    readonly property string href: Nav.at(Content.base, "/")

    implicitWidth: logo.width
    implicitHeight: logoHeight
    activeFocusOnTab: true
    Accessible.role: Accessible.Link
    Accessible.name: t`Ljós, home`
    Accessible.onPressAction: () => Nav.go(home.href)
    Keys.onPressed: (event) => {
        if (event.key === Key.Return || event.key === Key.Enter || event.key === Key.Space) {
            Nav.go(home.href);
            event.accepted = true;
        }
    }

    Text {
        id: logo
        height: home.logoHeight
        width: Math.round(height * Theme.logoAspect)
        anchors.verticalCenter: parent.verticalCenter
        format: Text.RichText
        text: Nav.picture(home.route, "/ljos.svg", width, height, "")
        Accessible.ignored: true
    }
    PointerArea {
        anchors.fill: parent
        Accessible.ignored: true
        cursorShape: Cursor.PointingHand
        onClicked: Nav.go(home.href)
    }
}
