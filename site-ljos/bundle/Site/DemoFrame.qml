pragma Scripts: JavaScript
import Ljos.Core
import Ljos.Ui
import Site
import "../nav.js" as Nav
import "../observing.js" as Observing
import "../host.js" as Host

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
// (WebGL 2, WebGPU, wasm) keeps the picture, and says why in the
// toolbar's place, which is taller only where that takes a third line.
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
    // False for a demo offered only where WebAssembly is, that compiles
    // none of its own: a page's policy on compiling takes nothing from it.
    property bool compiles: true
    // True for a demo with a desktop copy of its own (an `X.native.js`
    // beside the module that loads it), which runs where the site runs on
    // the desktop too; there it needs nothing a browser has.
    property bool desktop: false
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
    // Room for Run at a finger's size on a phone, a little more than its
    // height beside a pointer; where the demo can't run, room for the
    // words that say why.
    readonly property int leastBar: Theme.narrow ? Theme.target + Theme.s : 52
    readonly property int barHeight: cannot ? Math.max(leastBar, Math.ceil(why.implicitHeight) + Theme.xs) : leastBar
    height: surfaceHeight + barHeight

    // Set once the page this frame was written into is the reader's:
    // the demo is never part of the page the build writes.
    property bool awake: false
    // Where the demo needs WebGPU itself (a View3D does not: without it
    // one of the renderers draws on WebGL 2), whether the browser gave the
    // page an adapter: 0 until it says, 1 if so (or where none is needed),
    // -1 if not, which keeps the picture as a browser without WebGPU does.
    property int adapter: needs.indexOf("webgpu") >= 0 ? 0 : 1
    // Where the demo compiles WebAssembly, whether the page can run it, as
    // its policy may refuse it: 0 until that is known, then as `adapter`.
    // A frame is given another demo as the page goes to it, so what was
    // found is kept apart from whether this one needs it.
    property int wasmFound: 0
    readonly property int wasm: compiles && needs.indexOf("wasm") >= 0 ? wasmFound : 1
    function askWasm() {
        if (awake && compiles && wasmFound === 0 && needs.indexOf("wasm") >= 0 && Nav.canRun(needs))
            Nav.wasmRuns().then((runs) => frame.wasmFound = runs ? 1 : -1);
    }
    onNeedsChanged: frame.askWasm()
    readonly property bool runsHere: Nav.canRun(needs) || (desktop && needs === "" && Nav.onDesktop())
    readonly property bool runnable: awake && runsHere && adapter === 1 && wasm === 1
    readonly property bool cannot: awake && (!runsHere || adapter === -1 || wasm === -1)

    function offset() {
        var y = 0;
        var root = scroller ? scroller.contentItem : null;
        for (var item = frame; item && item !== root; item = item.parent)
            y += item.y;
        return y;
    }
    // Where it stands in the scroller's view (Item's own `top` is final).
    readonly property real viewTop: scroller ? offset() - scroller.contentY : 0
    readonly property bool onScreen: !scroller || (viewTop < scroller.height && viewTop + surfaceHeight > 0)
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
        running: Nav.inBrowser() || Nav.onDesktop()
        onTriggered: {
            frame.awake = true;
            if (frame.adapter === 0 && Nav.canRun(frame.needs))
                Nav.gpuAdapted().then((found) => frame.adapter = found ? 1 : -1);
            frame.askWasm();
        }
    }

    Rectangle {
        anchors.fill: parent
        radius: Theme.radius
        fill: Theme.surface
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
                // Where it starts, read from the left; a right-to-left page
                // sets it as far from the right (LayoutMirroring).
                readonly property real startX: 1
                x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
                y: 1 + Math.round((frame.surfaceHeight - frame.pictureHeight) / 2)
                width: frame.width - 2
                height: frame.pictureHeight - 1
                visible: modelData !== "" && (frame.pictureDark === "" || (index === 1) === Theme.dark) && !(frame.drawn && loader.opacity === 1)
                format: Text.RichText
                text: modelData === "" ? "" : Nav.picture(frame.route, modelData, frame.width - 2, frame.pictureHeight - 1, frame.description)
            }
        }

        // Said where the demo cannot run here, in the bar where Run
        // would stand: never over its picture.
        Rectangle {
            visible: frame.cannot
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: Theme.s
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
            y: frame.surfaceHeight + 1
            width: parent.width - 2 * Theme.s
            height: frame.barHeight - 1
            fill: "transparent"

            Text {
                id: why
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width
                // The need this browser lacks; where it lacks none (WebGPU with no
                // adapter for the page, or the build writing the page), the
                // demo's main one. On the desktop no browser lacks anything:
                // the host says where the demo runs (host.native.js).
                text: Host.desktop ? Host.desktop.noDemo : "A picture of the demo: it runs in a browser with " + (Nav.lacks(frame.needs) || (frame.wasm === -1 ? "WebAssembly" : frame.needs.indexOf("webgl2") >= 0 ? "WebGL 2" : frame.needs.indexOf("webgpu") >= 0 ? "WebGPU" : "WebAssembly")) + ", which this one does not offer."
                color: Theme.text
                font.family: Theme.sans
                font.size: Theme.captionSize
                lineHeightMode: Text.FixedHeight
                lineHeight: Theme.captionLine
                wrap: Text.Wrap
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
        component: frame.demo
        source: frame.demo ? "" : frame.source
        opacity: frame.drawn ? 1 : 0
        Behavior on opacity {
            NumberAnimation {
                duration: Theme.enterPanel
                easing.type: Easing.OutCubic
            }
        }
        onLoaded: {
            item.active = bind(() => runner.running);
            item.calm = bind(() => Theme.calm);
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
        fill: "transparent"

        Rectangle {
            width: parent.width
            height: 1
            fill: Theme.divider
        }

        // One button through the run's phases, so the focus a keyboard
        // reader gave it stays as it changes.
        StageButton {
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: Theme.s
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
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
