import Ljos.Ui
import Ljos.Core
import Site

// The Observer dock's panel on the desktop (host.native.js `observer`):
// the panel itself is the browser's own, so this says where the desktop's
// Observer is. It takes what the dock gives a panel and shows none of it.
Item {
    property real minimumWidth: 0
    property unknown logs: undefined
    property string title: ""
    property unknown target: undefined

    Text {
        x: Theme.m
        y: Theme.m
        width: parent.width - 2 * Theme.m
        wrapMode: Text.Wrap
        text: t`This panel runs in the browser. On the desktop, the ljos observe command opens the Observer on a running app.`
        color: Theme.textMuted
        font.family: Theme.sans
        font.pixelSize: Theme.bodySize
    }
}
