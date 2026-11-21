import QtQuick
import Ljos.Controls

// Brekka Grid's dispatch, a made-up grid operator's: one card of the
// shift's tickets, on the window's canvas. Run it with
// `ljos run --mcp --watch Main.qml` and an agent can read, drive and
// edit it while it runs.
Rectangle {
    id: shell
    objectName: "dispatchWindow"

    // The window it opens as on a desktop. A host that sizes it, such
    // as a Loader, gives it another, and the card lays itself out for that.
    width: 720
    height: 560
    color: Theme.canvas

    readonly property alias card: card
    signal logged(string line)

    // A short window scrolls the card rather than cut it off.
    Flickable {
        anchors.fill: parent
        contentWidth: width
        contentHeight: card.height + 32
        boundsBehavior: Flickable.StopAtBounds
        clip: true

        DispatchCard {
            id: card
            width: Math.min(shell.width - 32, 680)
            x: Math.round((shell.width - width) / 2)
            y: Math.max(16, Math.round((shell.height - height) / 2))
            onLogged: (line) => shell.logged(line)
        }
    }
}
