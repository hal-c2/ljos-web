pragma Scripts: JavaScript; import Ljos.Ui
import Ljos.Layout
import Ljos.Core
import Site
import "../nav.js" as Nav

// A section that rises into place the first time the reader scrolls to
// it: up a few pixels as it fades in, or with reduced motion only the
// fade. Only what is below the first screen when the page comes to life
// waits to be seen, so nothing the reader already sees ever moves; the
// build, a reader with no script and a page put back where the reader
// left it show it where it stands. Seen once, it stays: scrolled away
// and back, it is simply there. It waits on the page's own word that
// the view moved (Running.moved), never on a timer.
Item {
    id: rise

    default property alias content: holder.data
    // Waiting to be seen, and seen.
    property bool armed: false
    property bool seen: false

    implicitHeight: holder.implicitHeight
    width: parent ? parent.width : implicitWidth
    height: implicitHeight

    function look() {
        if (!armed || seen)
            return;
        var at = rise.mapToItem(null, 0, 0);
        // A little of it in view is enough: the reader is arriving.
        if (at.y < Running.viewBottom - 48 && at.y + rise.height > Running.viewTop)
            seen = true;
    }
    Component.onCompleted: {
        if (!Nav.inBrowser())
            return;
        later(() => {
            var at = rise.mapToItem(null, 0, 0);
            armed = Running.viewBottom > 0 && at.y >= Running.viewBottom;
        });
    }
    Connections {
        target: Running
        enabled: rise.armed && !rise.seen
        function onMoved() {
            rise.look();
        }
    }

    // How far below its place it still is, and how faded: a property of
    // its own each, so the step there is the shell's one easing.
    property real lift: armed && !seen ? Theme.riseTravel : 0
    property real shown: armed && !seen ? 0 : 1
    Behavior on lift {
        enabled: rise.seen
        NumberAnimation {
            duration: Theme.enterSection
            easing.type: Easing.OutQuart
        }
    }

    Column {
        id: holder
        // Lifted by its place, not a Translate: what it holds maps itself
        // to the page in the prerender too, where a transform can't be read.
        y: rise.lift
        width: rise.width
        opacity: rise.shown
        // On the opacity itself, not on `shown`: asked for less motion, an
        // animation of Ljós's API puts a number at its end at once and
        // still fades what fades.
        Behavior on opacity {
            enabled: rise.seen
            NumberAnimation {
                duration: Theme.enterSection
                easing.type: Easing.OutQuart
            }
        }
    }
}
