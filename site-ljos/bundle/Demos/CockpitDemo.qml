import Ljos.Ui
import Ljos.Core
import Site
import "Cockpit" as Svala
import "logic/live.ts" as Live

// Svala GT's cockpit (Demos/Cockpit/, the ljos-ui example as it is),
// in a page's frame. It is dark unless the reader picked light for the
// site: a night cabin is how it was drawn, and the site's own toggle is
// the reader saying otherwise. The car's drive and its player are held
// while the frame is paused or off screen; the reader's calm reaches the
// app as it reaches any page (motion.js marks it), and its Ljós
// animations calm as Ljós's do (the runtime's Ljos/Ui/motion.js), so
// nothing here changes how anything moves.
Item {
    id: demo
    width: 1600
    height: 900

    // Driven by the page that embeds this file; harmless standalone.
    property bool active: true
    property bool calm: false
    // The cockpit as the reader's edits make it (Demos/pro-live.js),
    // or nothing (or null) for the one the page was built with.
    property unknown live: undefined

    ModuleLoader {
        id: app
        anchors.fill: parent
        made: Live.isLive(demo.live) ? undefined : own
        module: demo.live ?? undefined
    }
    Component {
        id: own
        Svala.Main {}
    }

    // What the app holds that is not drawn, by the names it gives them.
    readonly property unknown theme: Live.resource(app.item, "theme")
    readonly property unknown car: Live.resource(app.item, "car")
    readonly property unknown player: Live.resource(app.item, "player")

    // Given when the site's scheme changes, not bound: the cockpit's own
    // settings change its look too, and the last one asked is the one
    // that shows.
    readonly property string look: Theme.picked === "light" ? "light" : "dark"
    onLookChanged: demo.giveLook()
    onThemeChanged: demo.giveLook()
    function giveLook(): void {
        const theme = demo.theme;
        if (typeof theme === "object" && theme !== null)
            theme.look = demo.look;
    }

    HeldBinding {
        object: demo.car
        property: "simulate"
        value: false
        when: !demo.active
        restoreMode: Binding.RestoreBindingOrValue
    }
    // The song holds its place and stays the one playing: it goes on from
    // there when the reader runs the cockpit again.
    HeldBinding {
        object: demo.player
        property: "running"
        value: false
        when: !demo.active
        restoreMode: Binding.RestoreBindingOrValue
    }
}
