// Ljós's Core before QtQuick: only its t`` is wanted here, and a name
// both have (Timer) stays QtQuick's, the later import.
import Ljos.Core
import QtQuick
import Site
import "../observing.js" as Observing

// Where the Observer a stage's toolbar opens stands: docked along the
// right of a wide window, the page still there to click in beside it,
// and on a phone a sheet over the lower part of the screen, the app
// above it. It slides in, and out again when closed; only then is the
// Observer unmade, and what it served of the app let go of. The
// Observer itself (Site/ObserverPanel.qml) is fetched the first time a
// reader opens it (observing.js).
Item {
    id: dock

    // What is shown: { key, target, logs, title }, or null.
    property var shown: null
    readonly property bool open: shown !== null
    readonly property bool sheet: width < Theme.wideFrom
    // Made while open, and while it slides away.
    property bool held: false

    readonly property int panelWidth: sheet ? width : Math.min(620, Math.max(480, Math.round(width * 0.42)))
    readonly property int panelHeight: sheet ? Math.round(height * 0.72) : height

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
        anchors.fill: parent
        visible: dock.sheet && (dock.open || slide.running)
        color: Theme.scrim
        opacity: dock.open ? 1 : 0
        Behavior on opacity {
            NumberAnimation {
                duration: Theme.enterPanel
            }
        }
        MouseArea {
            anchors.fill: parent
            enabled: dock.open
            onClicked: Observing.close()
        }
    }

    Rectangle {
        id: box
        visible: dock.held
        width: dock.panelWidth
        height: dock.panelHeight
        x: dock.sheet ? 0 : dock.open ? dock.width - width : dock.width
        y: dock.sheet ? (dock.open ? dock.height - height : dock.height) : 0
        radius: dock.sheet ? Theme.radiusLarge : 0
        color: Theme.surface
        border.color: Theme.divider
        border.width: 1
        Accessible.role: Accessible.Pane
        Accessible.name: t`Observer`

        Behavior on x {
            enabled: !dock.sheet
            NumberAnimation {
                id: slide
                duration: Theme.enterPanel
                easing.type: Easing.OutCubic
                onRunningChanged: if (!running && !dock.open) dock.held = false
            }
        }
        Behavior on y {
            enabled: dock.sheet
            NumberAnimation {
                duration: Theme.enterPanel
                easing.type: Easing.OutCubic
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
            active: dock.held
            source: Observing.panel
            onLoaded: {
                item.target = Qt.binding(() => dock.shown ? dock.shown.target : null);
                item.logs = Qt.binding(() => dock.shown ? dock.shown.logs : null);
                item.title = Qt.binding(() => dock.shown ? dock.shown.title : "");
            }
        }
    }
}
