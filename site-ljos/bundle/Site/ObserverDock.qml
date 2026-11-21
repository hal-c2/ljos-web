// Ljós's Core before QtQuick: only its t`` is wanted here, and a name
// both have (Timer) stays QtQuick's, the later import.
import Ljos.Core
import QtQuick
import Site
import "../observing.js" as Observing

// Where the Observer a stage's toolbar opens stands: docked along the
// right of a wide window, the page still there to click in beside it,
// and on a phone a sheet over the lower part of the screen, the app
// above it. It slides in, and out again when closed (asked for less
// motion, it fades in and out where it stands); only then is the
// Observer unmade, and what it served of the app let go of. The
// Observer itself (`ljos-web/observer/ObserverPanel.qml`) is fetched
// once a stage offers it, ahead of the first press (observing.js).
//
// The dock itself has no size: it is told the room it stands in (`room`
// wide, `roomHeight` tall, from where it is placed) and covers only what
// it shows there. An item over the page takes the clicks a browser gives
// what is under it, links and all, even with nothing in it to press.
Item {
    id: dock
    width: 0
    height: 0

    property real room: 0
    property real roomHeight: 0
    // What else stands beside the page in that room (a docs page's
    // sidebar), which the dock would leave where it is.
    property real beside: 0

    // What is shown: { key, target, logs, title }, or null.
    property var shown: null
    readonly property bool open: shown !== null
    // A sheet on a phone, and wherever docking would leave the page beside
    // it narrower than it is read at.
    readonly property bool sheet: room < Theme.wideFrom || room - beside - dockedWidth < Theme.pageNarrowest
    // Made while open, and while it slides or fades away. Only then is
    // anything of the dock over the page: a closed panel still follows
    // the room it would open into, and slides there unseen when the window
    // changes size, which is no sheet going away.
    property bool held: false
    // Asked for less motion, the panel does not travel: it stands where
    // it opens to and fades, as everything that moves on the site does
    // then (Theme.calm).
    readonly property bool still: Theme.calm
    // The stage the panel was made for. Moved to another stage, the
    // Observer is made anew: nothing of the first one's (the page it was
    // left on, an item picked, a value being edited) is about the second.
    readonly property string key: shown ? shown.key : ""
    property string madeFor: ""
    property bool renewing: false
    // Unmade, it is made for whichever stage opens it next.
    onHeldChanged: if (!held) madeFor = ""
    onKeyChanged: {
        if (key === "" || madeFor === "" || key === madeFor)
            return;
        renewing = true;
        Qt.callLater(() => dock.renewing = false);
    }

    // Docked, it is never narrower than Ljós's Observer lays its pages out
    // for: a narrower dock left a value no room to be read or edited. A
    // sheet is the phone's width, and the panel scrolls sideways in it.
    readonly property int dockedWidth: Math.min(760, Math.max(Theme.observerWidth, Math.round(room * 0.5)))
    readonly property int panelWidth: sheet ? room : dockedWidth
    readonly property int panelHeight: sheet ? Math.round(roomHeight * 0.72) : roomHeight

    function show(what) {
        held = true;
        shown = what;
    }
    function hide() {
        shown = null;
    }

    Component.onCompleted: Observing.attach(dock)
    Component.onDestruction: Observing.detach(dock)

    // A press beside a sheet closes it, as beside any sheet; a docked
    // panel leaves the page to be clicked in.
    Rectangle {
        width: dock.room
        height: dock.roomHeight
        visible: dock.sheet && dock.held
        color: Theme.scrim
        opacity: dock.open ? 1 : 0
        Behavior on opacity {
            NumberAnimation {
                duration: Theme.enterPanel
            }
        }
        // A press beside the sheet closes it, as a phone's sheets do. It
        // is no control of its own: the sheet's Close button is the one
        // a keyboard and a screen reader reach.
        MouseArea {
            anchors.fill: parent
            enabled: dock.open
            Accessible.ignored: true
            onClicked: Observing.close()
        }
    }

    Rectangle {
        id: box
        visible: dock.held
        width: dock.panelWidth
        height: dock.panelHeight
        x: dock.sheet ? 0 : dock.open || dock.still ? dock.room - width : dock.room
        y: dock.sheet ? (dock.open || dock.still ? dock.roomHeight - height : dock.roomHeight) : 0
        opacity: dock.still && !dock.open ? 0 : 1
        radius: dock.sheet ? Theme.radiusLarge : 0
        color: Theme.surface
        border.color: Theme.divider
        border.width: 1
        Accessible.role: Accessible.Pane
        Accessible.name: t`Observer`

        Behavior on x {
            enabled: !dock.sheet && !dock.still
            NumberAnimation {
                id: slideX
                duration: Theme.enterPanel
                easing.type: Easing.OutCubic
                onRunningChanged: if (!running && !dock.open) dock.held = false
            }
        }
        Behavior on y {
            enabled: dock.sheet && !dock.still
            NumberAnimation {
                id: slideY
                duration: Theme.enterPanel
                easing.type: Easing.OutCubic
                onRunningChanged: if (!running && !dock.open) dock.held = false
            }
        }
        Behavior on opacity {
            enabled: dock.still
            NumberAnimation {
                id: fade
                duration: Theme.enterPanel
                onRunningChanged: if (!running && !dock.open) dock.held = false
            }
        }

        // What the panel is of, and Close.
        Item {
            id: head
            width: parent.width
            height: 48

            // A sheet's handle: what it is to a thumb.
            Rectangle {
                visible: dock.sheet
                anchors.horizontalCenter: parent.horizontalCenter
                y: 6
                width: 36
                height: 4
                radius: 2
                color: Theme.border
            }
            Text {
                anchors.left: parent.left
                anchors.leftMargin: Theme.m
                anchors.right: closeButton.left
                anchors.rightMargin: Theme.s
                anchors.verticalCenter: parent.verticalCenter
                elide: Text.ElideRight
                text: dock.shown && dock.shown.title ? t`Observer · ${dock.shown.title}` : t`Observer`
                color: Theme.text
                font.family: Theme.sans
                font.pixelSize: 14
                font.weight: Font.DemiBold
            }
            StageButton {
                id: closeButton
                anchors.right: parent.right
                anchors.rightMargin: Theme.s
                anchors.verticalCenter: parent.verticalCenter
                text: t({ message: "Close", context: "observer" })
                label: t`Close the Observer`
                onPressed: Observing.close()
            }
            Rectangle {
                anchors.bottom: parent.bottom
                width: parent.width
                height: 1
                color: Theme.divider
            }
        }

        Loader {
            id: loader
            y: head.height
            width: parent.width
            height: parent.height - head.height
            active: dock.held && !dock.renewing
            source: Observing.panel
            onLoaded: {
                dock.madeFor = dock.key;
                item.minimumWidth = Theme.observerWidth;
                // The log and title before the target: the target is
                // served with what it is given then.
                item.logs = Qt.binding(() => dock.shown ? dock.shown.logs : null);
                item.title = Qt.binding(() => dock.shown ? dock.shown.title : "");
                item.target = Qt.binding(() => dock.shown ? dock.shown.target : null);
            }
        }
    }
}
