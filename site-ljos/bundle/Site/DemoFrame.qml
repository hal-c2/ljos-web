// Ljós's Core before QtQuick: only its t`` is wanted here, and a name
// both have (Timer) stays QtQuick's, the later import.
import Ljos.Core
import QtQuick
import Site
import "../nav.js" as Nav
import "../observing.js" as Observing

// Where a live demo stands: a frame its own size from the first paint,
// holding a picture of the demo and the words for it, so nothing below
// moves when the demo comes. The picture is the demo's poster, and
// under it a toolbar with Run (Runner): nothing is ever drawn over the
// demo. The demo is made in a reader's browser once they press Run or
// its poster, fades in over its picture, and runs only while
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
    // What the demo is, for its control's name: "Run the 3D demo".
    property string what: "this demo"
    // The route of the page the frame stands on, which the picture's
    // address is written from.
    property string route: "/"
    // What the demo needs that a browser may not have: "webgl2",
    // "webgpu" (with an adapter for the page), "wasm".
    property string needs: ""
    // The flickable the page scrolls in, so the frame knows when it is
    // near the screen and when it is on it.
    property var scroller: null
    property real aspect: 420 / 720
    // The least height the demo's own area is given. A demo narrower
    // than its poster stacks what stood side by side, and needs more
    // height than the poster's shape gives at that width. A floor rather
    // than a breakpoint: the area grows smoothly as the frame narrows,
    // with no jump where the demo changes its layout, and a frame wide
    // enough that its picture is that tall keeps the picture's shape.
    property int least: 0

    // The demo's own area, its poster's shape or taller (`least`); the
    // toolbar under it.
    readonly property int pictureHeight: Math.round(width * aspect)
    readonly property int surfaceHeight: Math.max(pictureHeight, least)
    readonly property int barHeight: 48
    height: surfaceHeight + barHeight

    // Set once the page this frame was written into is the reader's:
    // the demo is never part of the page the build writes.
    property bool awake: false
    // Where the demo needs WebGPU itself (a View3D does not: without it
    // one of the renderers draws on WebGL 2), whether the browser gave the
    // page an adapter: 0 until it says, 1 if so (or where none is needed),
    // -1 if not, which keeps the picture as a browser without WebGPU does.
    property int adapter: needs.indexOf("webgpu") >= 0 ? 0 : 1
    readonly property bool runnable: awake && Nav.canRun(needs) && adapter === 1
    readonly property bool cannot: awake && (!Nav.canRun(needs) || adapter === -1)

    function offset() {
        var y = 0;
        var root = scroller ? scroller.contentItem : null;
        for (var item = frame; item && item !== root; item = item.parent)
            y += item.y;
        return y;
    }
    readonly property real top: scroller ? offset() - scroller.contentY : 0
    readonly property bool onScreen: !scroller || (top < scroller.height && top + surfaceHeight > 0)
    readonly property bool drawn: loader.status === Loader.Ready && loader.item !== null && loader.item.ready !== false

    // The Observer on what runs here: the demo, or the app a demo holds
    // where it says which (`observed`), so its tree starts at the app.
    readonly property string key: Observing.keyFor("demo")
    readonly property var observed: loader.item ? (loader.item.observed !== undefined ? loader.item.observed : loader.item) : null
    property bool observing: false
    function observerMoved() {
        observing = Observing.isShown(key);
    }
    onObservedChanged: Observing.retarget(key, observed)
    Component.onCompleted: Observing.watch(frame.observerMoved)
    Component.onDestruction: {
        Observing.unwatch(frame.observerMoved);
        Observing.close(key);
    }

    Timer {
        interval: 0
        running: Nav.inBrowser()
        onTriggered: {
            frame.awake = true;
            if (frame.adapter === 0 && Nav.canRun(frame.needs))
                Nav.gpuAdapted().then((found) => frame.adapter = found ? 1 : -1);
        }
    }

    Rectangle {
        anchors.fill: parent
        radius: Theme.radius
        color: Theme.surface
        border.color: Theme.divider
        border.width: 1
        clip: true

        // The picture is in the page as written (Nav.picture), so it
        // stands before the page runs and where it never does. It keeps
        // its own shape, in the middle of an area made taller than it.
        // Both are in the page, each shown in its scheme, so the page as
        // written already shows the reader's (the build writes a
        // difference of only what is shown as one page for both schemes).
        Repeater {
            model: frame.pictureDark === "" ? [frame.picture] : [frame.picture, frame.pictureDark]
            Text {
                required property string modelData
                required property int index
                x: 1
                y: 1 + Math.round((frame.surfaceHeight - frame.pictureHeight) / 2)
                width: frame.width - 2
                height: frame.pictureHeight - 1
                visible: modelData !== "" && (frame.pictureDark === "" || (index === 1) === Theme.dark) && !(frame.drawn && loader.opacity === 1)
                textFormat: Text.RichText
                text: modelData === "" ? "" : Nav.picture(frame.route, modelData, frame.width - 2, frame.pictureHeight - 1, frame.description)
            }
        }

        // Said where the demo cannot run here.
        Rectangle {
            visible: frame.cannot
            x: Theme.s
            y: frame.surfaceHeight - height - Theme.s
            width: parent.width - 2 * Theme.s
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
                // The need this browser lacks; where it lacks none (WebGPU with no
                // adapter for the page, or the build writing the page), the
                // demo's main one.
                text: "A picture of the demo: it runs in a browser with " + (Nav.lacks(frame.needs) || (frame.needs.indexOf("webgl2") >= 0 ? "WebGL 2" : frame.needs.indexOf("webgpu") >= 0 ? "WebGPU" : "WebAssembly")) + ", which this one does not offer."
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
        width: frame.width
        height: frame.surfaceHeight
        // Whatever a demo draws past its area is cut at the frame's
        // edge: a demo never draws over the page around it, nor under
        // its own toolbar.
        clip: true
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
        spanWidth: frame.width
        spanHeight: frame.surfaceHeight
        can: frame.runnable
        what: frame.what
        ready: frame.drawn
    }

    // The toolbar: within the frame, under the demo, never over it.
    Rectangle {
        y: frame.surfaceHeight
        width: frame.width
        height: frame.barHeight
        color: "transparent"

        Rectangle {
            width: parent.width
            height: 1
            color: Theme.divider
        }

        // One button through the run's phases, so the focus a keyboard
        // reader gave it stays as it changes.
        StageButton {
            x: Theme.s
            anchors.verticalCenter: parent.verticalCenter
            visible: runner.phase !== ""
            primary: runner.phase === "picture"
            busy: runner.phase === "loading" || runner.phase === "failed"
            text: {
                switch (runner.phase) {
                case "loading":
                case "failed":
                    return t`Starting…`;
                case "live":
                    return t`Pause`;
                case "paused":
                    return t`Resume`;
                default:
                    return t({ message: "Run", context: "stage" });
                }
            }
            label: {
                switch (runner.phase) {
                case "loading":
                case "failed":
                    return t`Starting ${frame.what}…`;
                case "live":
                    return t`Pause ${frame.what}`;
                case "paused":
                    return t`Resume ${frame.what}`;
                default:
                    return t`Run ${frame.what}`;
                }
            }
            onPressed: runner.act()
        }

        // Ljós's Observer on the demo while it runs: its objects,
        // properties, frames and log.
        ObserverButton {
            anchors.right: parent.right
            anchors.rightMargin: Theme.s
            anchors.verticalCenter: parent.verticalCenter
            visible: frame.drawn && frame.observed !== null
            checked: frame.observing
            label: t`Observer for ${frame.what}`
            onPressed: Observing.toggle(frame.key, frame.observed, null, frame.what)
        }
    }
}
