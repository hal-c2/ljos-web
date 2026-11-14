import QtQuick
import Site
import "../nav.js" as Nav

// Where a live demo stands: a frame its own size from the first paint,
// holding a picture of the demo and the words for it, so nothing below
// moves when the demo comes. The demo itself is made in a reader's
// browser once the frame is near the screen, fades in over its picture,
// and runs only while it is on screen (`active`), gently where the
// reader asks for less motion (`calm`). A browser without what the demo
// needs (WebGPU, wasm) keeps the picture, and says why.
Item {
    id: frame

    property Component demo: null
    // A picture of the demo running, and what it shows, in words.
    property string picture: ""
    property string description: ""
    // The route of the page the frame stands on, which the picture's
    // address is written from.
    property string route: "/"
    // What the demo needs that a browser may not have: "webgpu", "wasm".
    property string needs: ""
    // The flickable the page scrolls in, so the frame knows when it is
    // near the screen and when it is on it.
    property var scroller: null
    property real aspect: 420 / 720

    height: Math.round(width * aspect)

    // Set once the page this frame was written into is the reader's:
    // the demo is never part of the page the build writes.
    property bool awake: false
    readonly property bool runnable: awake && Nav.canRun(needs)
    readonly property bool cannot: awake && !Nav.canRun(needs)

    function offset() {
        var y = 0;
        var root = scroller ? scroller.contentItem : null;
        for (var item = frame; item && item !== root; item = item.parent)
            y += item.y;
        return y;
    }
    readonly property real top: scroller ? offset() - scroller.contentY : 0
    // A quarter of a screen ahead is time enough to make a demo before
    // it is seen, and no more: a frame two screens down, under a reader
    // who never scrolls to it, would cost them a GPU device for nothing.
    readonly property real ahead: scroller ? scroller.height / 4 : 0
    readonly property bool near: !scroller || (top < scroller.height + ahead && top + height > -ahead)
    readonly property bool onScreen: !scroller || (top < scroller.height && top + height > 0)
    property bool started: false

    Timer {
        interval: 0
        running: Nav.inBrowser()
        onTriggered: frame.awake = true
    }

    Rectangle {
        anchors.fill: parent
        radius: Theme.radius
        color: Theme.surface
        border.color: Theme.divider
        border.width: 1
        clip: true

        // The picture is in the page as written (Nav.picture), so it
        // stands before the page runs and where it never does. It is
        // the frame's shape, so it fills the frame as it is.
        Text {
            x: 1
            y: 1
            width: frame.width - 2
            height: frame.height - 2
            visible: frame.picture !== "" && !(loader.status === Loader.Ready && loader.opacity === 1)
            textFormat: Text.RichText
            text: frame.picture === "" ? "" : Nav.picture(frame.route, frame.picture, frame.width - 2, frame.height - 2, frame.description)
        }

        // Said where the demo cannot run here.
        Rectangle {
            visible: frame.cannot
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            anchors.margins: Theme.s
            height: why.implicitHeight + 2 * Theme.xs
            radius: Theme.radiusSmall
            color: Theme.surfaceRaised
            border.color: Theme.border
            border.width: 1

            Text {
                id: why
                x: Theme.s
                y: Theme.xs
                width: parent.width - 2 * Theme.s
                text: "A picture of the demo: it runs in a browser with " + (frame.needs.indexOf("webgpu") >= 0 ? "WebGPU" : "WebAssembly") + ", which this one does not offer."
                color: Theme.text
                font.family: Theme.sans
                font.pixelSize: Theme.captionSize
                lineHeightMode: Text.FixedHeight
                lineHeight: Theme.captionLine
                wrapMode: Text.Wrap
            }
        }
    }

    Loader {
        id: loader
        anchors.fill: parent
        active: frame.runnable && (frame.near || frame.started)
        sourceComponent: frame.demo
        opacity: status === Loader.Ready ? 1 : 0
        Behavior on opacity {
            NumberAnimation {
                duration: Theme.enterPanel
                easing.type: Easing.OutCubic
            }
        }
        onLoaded: {
            frame.started = true;
            item.active = Qt.binding(() => frame.onScreen);
            item.calm = Qt.binding(() => Theme.calm);
        }
    }
}
