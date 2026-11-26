import Ljos.Ui
import Ljos.Core
import Demos
import "play/snail-post" as Snail
import "../Demos/logic/live.ts" as Live
import "logic/world.ts" as World

// Snail Post, ljos-play's example (Showcase/play/snail-post/, its engine
// beside it in LjosPlay/, both as scripts/sync-play.mjs copied them), in
// the showcase's frame (Site/ShowcaseEngine.qml). The world's clock runs
// only while the frame is on screen and its tab is shown (`active`); where
// the reader asks for less motion (`calm`) the frame keeps the world's own
// timer still and steps its clock less often, so the snails go at less
// than their pace and never stop.
Item {
    id: demo
    width: 800
    height: 560

    // Driven by the page that embeds this file; harmless standalone.
    property bool active: true
    property bool calm: false
    // The world as the reader's edits make it (Showcase/example-live.js),
    // or nothing (or null) for the one the page was built with.
    property unknown live: undefined
    // How often a calm world steps, of how often its own timer does.
    readonly property real calmPace: 0.4

    // What the Observer is on: the world, not this frame round it.
    readonly property unknown observed: app.item

    // The world at the size its file gives it, as its picture was taken,
    // scaled to the frame: ljos-play draws each art pixel as whole device
    // pixels, so in a frame narrower than its own size it would round
    // down to a world half the size of the picture it replaces.
    Item {
        id: stage
        width: 800
        height: 560
        scale: Math.min(demo.width / stage.width, demo.height / stage.height)
        transformOrigin: Item.TopLeft
        x: (demo.width - stage.width * stage.scale) / 2
        y: (demo.height - stage.height * stage.scale) / 2

        ModuleLoader {
            id: app
            anchors.fill: parent
            made: Live.isLive(demo.live) ? undefined : own
            module: demo.live ?? undefined
        }
    }
    Component {
        id: own
        Snail.Main {}
    }

    // The world's own clock runs while the frame is seen, unless calm.
    HeldBinding {
        object: app.item
        property: "active"
        value: demo.active
    }
    HeldBinding {
        object: app.item
        property: "busy"
        value: !demo.calm
    }
    Timer {
        interval: World.slowBeat(app.item, demo.calmPace)
        repeat: true
        running: demo.active && demo.calm && app.item !== null
        onTriggered: World.step(app.item)
    }
}
