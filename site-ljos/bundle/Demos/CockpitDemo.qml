import QtQuick
import Site
import "Cockpit" as Svala

// Svala GT's cockpit (Demos/Cockpit/, the ljos-ui example as it is),
// in a page's frame. It is dark unless the reader picked light for the
// site: a night cabin is how it was drawn, and the site's own toggle is
// the reader saying otherwise. The car's drive is held while the frame
// is off screen; the reader's calm reaches the app as it reaches any
// page (motion.js marks it), and its Ljós animations calm as Ljós's do
// (the runtime's Ljos/Ui/motion.js), so nothing here changes how
// anything moves.
Item {
    id: demo
    width: 1600
    height: 900

    // Driven by the page that embeds this file; harmless standalone.
    property bool active: true
    property bool calm: false
    // The cockpit as the reader's edits make it (Demos/cockpit-live.js),
    // or null for the one the page was built with.
    property var live: null

    Loader {
        id: app
        anchors.fill: parent
        sourceComponent: demo.live ? null : own
        source: demo.live ?? undefined
    }
    Component {
        id: own
        Svala.Main {}
    }

    // What the app holds that is not drawn, by the names it gives them.
    function named(name) {
        return app.item ? Array.from(app.item.resources).find((object) => object.objectName === name) ?? null : null;
    }
    readonly property var theme: named("theme")
    readonly property var car: named("car")

    // Given when the site's scheme changes, not bound: the cockpit's own
    // settings change its look too, and the last one asked is the one
    // that shows.
    readonly property string look: Theme.picked === "light" ? "light" : "dark"
    onLookChanged: if (demo.theme) demo.theme.look = demo.look
    onThemeChanged: if (demo.theme) demo.theme.look = demo.look

    Binding {
        target: demo.car
        property: "simulate"
        value: false
        when: !demo.active
        restoreMode: Binding.RestoreBindingOrValue
    }
}
