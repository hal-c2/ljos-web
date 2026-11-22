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
// its poster (or, for one that starts itself, once it is on screen),
// fades in over its picture, and runs only while
// it is on screen and its tab is shown (`active`), gently where the
// reader asks for less motion (`calm`). One more demo or example
// started past the page's budget (Running) stops it: it is unmade, and
// its poster waits for Run again. The front page's replay alone has its
// toolbar over it (`barOnTop`): its controls are the first thing read,
// tabbed to and seen. A browser without what the demo needs
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
    // Or a poster the page draws with its own parts, in both schemes at
    // once: a demo whose picture is the page's own components needs no
    // image to be fetched, and its words stay text a reader can select.
    property Component poster: null
    // What this page gives its demo and poster, set on each as it is
    // made: one demo can stand on two pages, each wanting it a little
    // differently (`{ tabs: false }`), and a demo fetched later has no
    // tag here to set them on.
    property var settings: ({})
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
    // For the front page's replay alone (README, "What runs, and when"):
    // it starts once on screen, unless the reader asked for less motion.
    // Once only: what a reader pauses, or the budget stops, stays so.
    property bool startsItself: false
    property bool startedItself: false
    readonly property bool startable: startsItself && runnable && !Theme.calm && runner.onScreen && Running.shown
    onStartableChanged: {
        if (!startable || startedItself)
            return;
        startedItself = true;
        runner.run();
    }

    // Its toolbar over it, in no frame of its own, with a line of `note`
    // beside its one button; the poster can be used before any Run, so a
    // press on it runs nothing.
    property bool barOnTop: false
    property string note: ""
    readonly property int surfaceY: barOnTop ? barHeight : 0
    // A demo that plays to an end and says it has stopped (`playing`)
    // offers Play, never a Pause of what stands still.
    readonly property bool replayable: barOnTop && loader.item !== null && loader.item.playing === false && (runner.phase === "live" || runner.phase === "paused")

    // The demo's own area, its poster's shape or taller (`least`); the
    // toolbar under it, or over it (`barOnTop`).
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
    readonly property bool runnable: awake && Nav.canRun(needs) && adapter === 1 && wasm === 1
    readonly property bool cannot: awake && (!Nav.canRun(needs) || adapter === -1 || wasm === -1)

    function give(item) {
        Object.keys(settings).forEach((name) => item[name] = settings[name]);
    }

    function offset() {
        var y = 0;
        var root = scroller ? scroller.contentItem : null;
        for (var item = frame; item && item !== root; item = item.parent)
            y += item.y;
        return y;
    }
    readonly property real top: scroller ? offset() - scroller.contentY : 0
    readonly property bool onScreen: !scroller || (top + surfaceY < scroller.height && top + surfaceY + surfaceHeight > 0)
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
            frame.askWasm();
        }
    }

    // Declared before the demo where it stands over it, so Tab and a
    // screen reader come to it first; after it where it stands under.
    Loader {
        z: 1
        width: frame.width
        height: frame.barHeight
        active: frame.barOnTop
        visible: frame.barOnTop
        sourceComponent: toolbar
    }

    Rectangle {
        anchors.fill: parent
        radius: Theme.radius
        color: frame.barOnTop ? "transparent" : Theme.surface
        border.color: Theme.divider
        border.width: frame.barOnTop ? 0 : 1
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
                y: frame.surfaceY + 1 + Math.round((frame.surfaceHeight - frame.pictureHeight) / 2)
                width: frame.width - 2
                height: frame.pictureHeight - 1
                visible: modelData !== "" && (frame.pictureDark === "" || (index === 1) === Theme.dark) && !(frame.drawn && loader.opacity === 1)
                textFormat: Text.RichText
                text: modelData === "" ? "" : Nav.picture(frame.route, modelData, frame.width - 2, frame.pictureHeight - 1, frame.description)
            }
        }

        Loader {
            readonly property int inset: frame.barOnTop ? 0 : 1
            x: inset
            y: frame.surfaceY + inset
            width: frame.width - 2 * inset
            height: frame.surfaceHeight - inset
            // Where the demo starts itself its poster is hidden, not unmade:
            // the page is still being taken over as written when it starts.
            active: frame.poster !== null && (frame.startsItself || !(frame.drawn && loader.opacity === 1))
            visible: !(frame.drawn && loader.opacity === 1)
            sourceComponent: frame.poster
            onLoaded: frame.give(item)
        }

        // Said where the demo cannot run here, in the bar where Run
        // would stand: never over its picture.
        Rectangle {
            visible: frame.cannot
            x: Theme.s
            y: frame.barOnTop ? 1 : frame.surfaceHeight + 1
            width: parent.width - 2 * Theme.s
            height: frame.barHeight - 1
            color: "transparent"

            Text {
                id: why
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width
                // The need this browser lacks; where it lacks none (WebGPU with no
                // adapter for the page, or the build writing the page), the
                // demo's main one.
                text: "A picture of the demo: it runs in a browser with " + (Nav.lacks(frame.needs) || (frame.wasm === -1 ? "WebAssembly" : frame.needs.indexOf("webgl2") >= 0 ? "WebGL 2" : frame.needs.indexOf("webgpu") >= 0 ? "WebGPU" : "WebAssembly")) + ", which this one does not offer."
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
        y: frame.surfaceY
        // Over a poster that takes presses, nothing lies until it runs.
        visible: !frame.barOnTop || active
        width: frame.width
        height: frame.surfaceHeight
        // Whatever a demo draws past its area is cut at the frame's
        // edge: a demo never draws over the page around it, nor under
        // its own toolbar.
        clip: true
        // DECISION: made when the reader presses Run, not as the frame
        // nears the screen: a demo the reader never asks for costs them
        // no GPU device, and one the budget stops gives its device back.
        // The one exception takes no GPU device (`startsItself`).
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
            frame.give(item);
            item.active = Qt.binding(() => runner.running);
            item.calm = Qt.binding(() => Theme.calm);
        }
    }

    Runner {
        id: runner
        y: frame.surfaceY
        spanWidth: frame.width
        spanHeight: frame.surfaceHeight
        pressRuns: !frame.barOnTop
        can: frame.runnable
        what: frame.what
        ready: frame.drawn
    }

    // The toolbar: within the frame, under the demo, never over it.
    Loader {
        y: frame.surfaceHeight
        width: frame.width
        height: frame.barHeight
        active: !frame.barOnTop
        visible: !frame.barOnTop
        sourceComponent: toolbar
    }

    Component {
        id: toolbar

        Rectangle {
            width: frame.width
            height: frame.barHeight
            color: "transparent"

            Rectangle {
                visible: !frame.barOnTop
                width: parent.width
                height: 1
                color: Theme.divider
            }

            // One button through the run's phases, so the focus a keyboard
            // reader gave it stays as it changes.
            StageButton {
                x: frame.barOnTop ? Theme.xxs : Theme.s
                anchors.verticalCenter: parent.verticalCenter
                visible: runner.phase !== ""
                primary: runner.phase === "picture" || frame.replayable
                busy: runner.phase === "loading" || runner.phase === "failed"
                text: {
                    if (frame.replayable)
                        return t`Play`;
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
                    if (frame.replayable)
                        return t`Play ${frame.what}`;
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
                onPressed: {
                    if (!frame.replayable)
                        return runner.act();
                    loader.item.play();
                    runner.ask();
                }
            }

            Text {
                visible: frame.note !== ""
                anchors.right: parent.right
                anchors.rightMargin: Theme.xxs
                anchors.verticalCenter: parent.verticalCenter
                text: frame.note
                color: Theme.textMuted
                font.family: Theme.sans
                font.pixelSize: Theme.captionSize
            }

            // Ljós's Observer on the demo while it runs: its objects,
            // properties, frames and log.
            ObserverButton {
                anchors.right: parent.right
                anchors.rightMargin: Theme.s
                anchors.verticalCenter: parent.verticalCenter
                visible: !frame.barOnTop && frame.drawn && frame.observed !== null
                checked: frame.observing
                label: t`Observer for ${frame.what}`
                // What the demo's app said, where the demo keeps it apart from
                // the page's console.
                onPressed: Observing.toggle(frame.key, frame.observed, loader.item && loader.item.logs !== undefined ? loader.item.logs : null, frame.what)
            }
        }
    }
}
