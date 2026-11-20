import QtQuick
import Site
import Ljos.Core
import "../shells.js" as Shells

// What the reader has chosen for this site: its colour scheme, whether
// it moves less, and which shell it is shown in. Each is kept for the
// next visit (scheme.js, motion.js, shells.js); a shell only shows the
// choices and asks for another.
QtObject {
    id: preferences

    // "system", "light" or "dark".
    readonly property string scheme: Theme.picked === "" ? "system" : Theme.picked
    readonly property bool dark: Theme.dark
    readonly property bool calm: Theme.calm

    // The shell the reader picked, and the one shown: a window narrower
    // than Theme.wideFrom has no room for a workbench's three columns or
    // a desktop's sidebar beside its documents, and shows the marketing
    // shell, which is laid out for a phone, until it is wide again.
    // Every page is prerendered in the marketing shell, so `shell` is
    // that until the page has been taken over (Main.qml).
    property string shell: "marketing"
    property bool wide: true
    readonly property string shown: wide ? shell : "marketing"
    readonly property bool narrowed: shell !== shown

    readonly property var shells: [
        { name: "marketing", label: t`Marketing`, about: t`A wide hero, then sections down the page.` },
        { name: "workbench", label: t`Workbench`, about: t`Files on the left, the page in the middle, and Source, Observer and Agent on the right.` },
        { name: "desktop", label: t`Desktop`, about: t`Menu bar, toolbar, sidebar, tabbed documents and a status bar.` }
    ]
    readonly property var schemes: [
        { name: "system", label: t`System` },
        { name: "light", label: t`Light` },
        { name: "dark", label: t`Dark` }
    ]

    function labelOf(name) {
        var found = shells.find((one) => one.name === name);
        return found ? found.label : name;
    }

    function setScheme(name) {
        Theme.pick(name === "system" ? "" : name);
    }
    function setCalm(wanted) {
        Theme.setCalm(wanted);
    }
    function setShell(name) {
        if (!shells.some((one) => one.name === name))
            return;
        preferences.shell = name;
        Shells.keep(name);
    }
}
