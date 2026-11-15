import QtQuick
import Site
import "../nav.js" as Nav

// Where a live demo stands: a frame its own size from the first paint,
// holding a picture of the demo and the words for it, so nothing below
// moves when the demo comes. The picture is the demo's poster, with a
// Run button on it (Runner): the demo is made in a reader's browser
// once they press it, fades in over its picture, and runs only while
// it is on screen and its tab is shown (`active`), gently where the
// reader asks for less motion (`calm`). One more demo or example
// started past the page's budget (Running) stops it: it is unmade, and
// its poster waits for Run again. A browser without what the demo needs
// (WebGL 2, WebGPU, wasm) keeps the picture, and says why.
//
// Made is not drawn: a demo whose drawing starts after it is made (a
// renderer that starts, a shader that compiles) says so as `ready`, and
// its picture stands until it is, and for good where it never is.
Item {
    id: frame

    // The demo, as a function that imports its module (Demos/later.js),
    // so what it draws with is fetched only for a demo that runs; or as
    // a component the page has already.
    property var source: undefined
    property Component demo: null
    // A picture of the demo running, and what it shows, in words. The
    // demos follow the reader's scheme, so a picture of one in the dark
    // stands where the reader's is dark; without one, the light serves
    // both.
    property string picture: ""
    property string pictureDark: ""
    property string description: ""
    // The Run button's name, for a screen reader: "Run the 3D demo".
    property string label: "Run this demo"
    // The route of the page the frame stands on, which the picture's
    // address is written from.
    property string route: "/"
    // What the demo needs that a browser may not have: "webgl2",
    // "webgpu", "wasm".
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
    readonly property bool onScreen: !scroller || (top < scroller.height && top + height > 0)
    readonly property bool drawn: loader.status === Loader.Ready && loader.item !== null && loader.item.ready !== false

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
        // Both are in the page, each shown in its scheme, so the page as
        // written already shows the reader's (the build writes a
        // difference of only what is shown as one page for both schemes).
        Repeater {
            model: frame.pictureDark === "" ? [frame.picture] : [frame.picture, frame.pictureDark]
            Text {
                required property string modelData
                required property int index
                x: 1
                y: 1
                width: frame.width - 2
                height: frame.height - 2
                visible: modelData !== "" && (frame.pictureDark === "" || (index === 1) === Theme.dark) && !(frame.drawn && loader.opacity === 1)
                textFormat: Text.RichText
                text: modelData === "" ? "" : Nav.picture(frame.route, modelData, frame.width - 2, frame.height - 2, frame.description)
            }
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
                text: "A picture of the demo: it runs in a browser with " + (frame.needs.indexOf("webgl2") >= 0 ? "WebGL 2" : frame.needs.indexOf("webgpu") >= 0 ? "WebGPU" : "WebAssembly") + ", which this one does not offer."
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
        // DECISION: made when the reader presses Run, not as the frame
        // nears the screen: a demo the reader never asks for costs them
        // no GPU device, and one the budget stops gives its device back.
        active: frame.runnable && runner.started
        sourceComponent: frame.demo
        source: frame.demo ? undefined : frame.source
        opacity: frame.drawn ? 1 : 0
        Behavior on opacity {
            NumberAnimation {
                duration: Theme.enterPanel
                easing.type: Easing.OutCubic
            }
        }
        onLoaded: {
            item.active = Qt.binding(() => runner.running);
            item.calm = Qt.binding(() => Theme.calm);
        }
    }

    Runner {
        id: runner
        anchors.fill: parent
        can: frame.runnable
        label: frame.label
    }
}
