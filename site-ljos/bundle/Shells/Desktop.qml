import QtQuick
import Ljos.Core
import Ljos.Blocks
import Ljos.Controls as C

// The site as a desktop app: a menu bar whose menus do what they say
// (open a page, change the scheme, the motion and the shell), a toolbar,
// every page in a sidebar, the pages the reader opened as tabs, and a
// status bar with the page, how long the page took to come alive and how
// many objects are alive in it.
//
// Its parts are places (Slots) the site puts its pieces in by name, as
// the marketing shell's are: `site.page` is the very page another shell
// showed, still where the reader was on it. The tabs are this shell's
// own: which pages are open is how it shows the site, not the site's.
Rectangle {
    id: shell
    objectName: "desktopShell"

    property var site: null
    readonly property var router: site ? site.router : null
    readonly property var preferences: site ? site.preferences : null
    readonly property string route: router ? router.route : "/"
    // A page other than the docs is this wide at most here.
    readonly property int pageWidest: 1040
    // What the status bar says of the page: how long it took to come
    // alive (-1 until it has), and how many objects are alive in it.
    readonly property int hydratedMs: site ? site.hydratedIn : -1
    readonly property int aliveCount: site ? site.alive : 0

    // The pages open, in the order they were opened. Opened as the
    // reader goes, never bound to the route: a binding would make the
    // list the route alone again on every move, and lose the others.
    property var tabs: []
    function opened() {
        if (!shell.router)
            return;
        if (shell.tabs.indexOf(shell.route) < 0)
            shell.tabs = shell.tabs.concat([shell.route]);
        tabBar.currentIndex = shell.tabs.indexOf(shell.route);
    }
    onRouteChanged: shell.opened()
    // Given the site once made, as a shell that comes later is.
    onRouterChanged: shell.opened()
    Component.onCompleted: shell.opened()

    function close(at) {
        if (shell.tabs.length < 2)
            return;
        var open = shell.tabs.slice();
        var gone = open.splice(at, 1)[0];
        shell.tabs = open;
        if (gone === shell.route)
            shell.router.go(open[Math.min(at, open.length - 1)]);
        else
            tabBar.currentIndex = open.indexOf(shell.route);
    }

    QtObject {
        id: look
        readonly property color canvas: shell.site ? shell.site.theme.canvas : C.Theme.canvas
        readonly property color surface: shell.site ? shell.site.theme.surface : C.Theme.surface
        readonly property color divider: shell.site ? shell.site.theme.divider : C.Theme.border
        readonly property color textMuted: shell.site ? shell.site.theme.textMuted : C.Theme.textMuted
        readonly property string sans: shell.site ? shell.site.theme.sans : ""
    }

    width: parent ? parent.width : 1440
    height: parent ? parent.height : 900
    color: look.canvas

    // The header: both bars are one landmark, so a reader finds it by
    // the name it has in every shell.
    Item {
        id: header
        z: 4
        width: parent.width
        height: toolBar.y + toolBar.height
        Accessible.role: Accessible.Section
        Accessible.name: "Ljós"

        // The menu bar.
        Rectangle {
            id: menuBar
            z: 4
            width: parent.width
            height: 36
            color: look.surface

            Row {
                x: 8
                anchors.verticalCenter: parent.verticalCenter
                spacing: 2

                Row {
                    anchors.verticalCenter: parent.verticalCenter
                    Slot { name: "site.brand.small" }
                }
                C.Button {
                    anchors.verticalCenter: parent.verticalCenter
                    subtle: true
                    text: t`File`
                    onClicked: fileMenu.open()

                    C.Menu {
                        id: fileMenu
                        y: parent.height

                        C.MenuItem {
                            text: t`Open…`
                            iconName: "search"
                            shortcut: "/"
                            onTriggered: shell.site.find()
                        }
                        C.MenuItem {
                            text: t`Close tab`
                            iconName: "x"
                            enabled: shell.tabs.length > 1
                            onTriggered: shell.close(shell.tabs.indexOf(shell.route))
                        }
                    }
                }
                C.Button {
                    anchors.verticalCenter: parent.verticalCenter
                    subtle: true
                    text: t`View`
                    onClicked: viewMenu.open()

                    C.Menu {
                        id: viewMenu
                        y: parent.height

                        Repeater {
                            model: shell.preferences ? shell.preferences.schemes : []
                            C.MenuItem {
                                required property var modelData
                                text: modelData.label
                                checkable: true
                                checked: shell.preferences.scheme === modelData.name
                                onTriggered: shell.preferences.setScheme(modelData.name)
                            }
                        }
                        C.MenuSeparator {}
                        C.MenuItem {
                            text: t`Reduce motion`
                            checkable: true
                            checked: shell.preferences ? shell.preferences.calm : false
                            onTriggered: shell.preferences.setCalm(!shell.preferences.calm)
                        }
                        C.MenuSeparator {}
                        Repeater {
                            model: shell.preferences ? shell.preferences.shells : []
                            C.MenuItem {
                                required property var modelData
                                text: modelData.label
                                checkable: true
                                checked: shell.preferences.shell === modelData.name
                                onTriggered: shell.preferences.setShell(modelData.name)
                            }
                        }
                        C.MenuSeparator {}
                        C.MenuItem {
                            text: t`View this shell's source`
                            iconName: "code"
                            onTriggered: shell.site.showSource("desktop")
                        }
                    }
                }
                C.Button {
                    anchors.verticalCenter: parent.verticalCenter
                    subtle: true
                    text: t`Go`
                    onClicked: goMenu.open()

                    C.Menu {
                        id: goMenu
                        y: parent.height

                        C.MenuItem {
                            text: t`Back`
                            iconName: "arrow-left"
                            onTriggered: shell.site.back()
                        }
                        C.MenuItem {
                            text: t`Forward`
                            iconName: "arrow-right"
                            onTriggered: shell.site.forward()
                        }
                        C.MenuSeparator {}
                        C.MenuItem {
                            text: t`Home`
                            iconName: "house"
                            onTriggered: shell.router.go("/")
                        }
                        C.MenuItem {
                            text: t`Docs`
                            iconName: "file-text"
                            onTriggered: shell.router.go("/start/")
                        }
                        C.MenuItem {
                            text: t`Demos`
                            iconName: "play"
                            onTriggered: shell.router.go("/demos/")
                        }
                        C.MenuItem {
                            text: t`Showcase`
                            iconName: "image"
                            onTriggered: shell.router.go("/showcase/")
                        }
                    }
                }
                C.Button {
                    anchors.verticalCenter: parent.verticalCenter
                    subtle: true
                    text: t`Help`
                    onClicked: helpMenu.open()

                    C.Menu {
                        id: helpMenu
                        y: parent.height

                        C.MenuItem {
                            text: t`Your first app`
                            onTriggered: shell.router.go("/start/first-app/")
                        }
                        C.MenuItem {
                            text: t`Your own shell`
                            onTriggered: shell.router.go("/start/your-own-shell/")
                        }
                        C.MenuSeparator {}
                        C.MenuItem {
                            text: t`Ljós on GitHub`
                            iconName: "external-link"
                            onTriggered: shell.router.go(shell.router.github)
                        }
                    }
                }
            }
            Rectangle {
                y: parent.height - 1
                width: parent.width
                height: 1
                color: look.divider
            }
        }

        // The toolbar.
        Rectangle {
            id: toolBar
            z: 3
            y: menuBar.height
            width: parent.width
            height: 48
            color: look.canvas
            Accessible.role: Accessible.ToolBar
            Accessible.name: t`Toolbar`

            Row {
                x: 8
                anchors.verticalCenter: parent.verticalCenter
                spacing: 4

                C.Button {
                    anchors.verticalCenter: parent.verticalCenter
                    subtle: true
                    iconName: "arrow-left"
                    display: C.Button.IconOnly
                    text: t`Back`
                    onClicked: shell.site.back()
                }
                C.Button {
                    anchors.verticalCenter: parent.verticalCenter
                    subtle: true
                    iconName: "arrow-right"
                    display: C.Button.IconOnly
                    text: t`Forward`
                    onClicked: shell.site.forward()
                }
                C.Button {
                    anchors.verticalCenter: parent.verticalCenter
                    subtle: true
                    iconName: "house"
                    display: C.Button.IconOnly
                    text: t`Home`
                    onClicked: shell.router.go("/")
                }
                Item {
                    width: 12
                    height: 1
                }
                Item {
                    anchors.verticalCenter: parent.verticalCenter
                    width: Math.max(200, Math.min(480, toolBar.width - 520))
                    height: 36
                    Slot { name: "site.search" }
                }
            }
            Row {
                x: parent.width - width - 12
                anchors.verticalCenter: parent.verticalCenter
                spacing: 8

                Row {
                    anchors.verticalCenter: parent.verticalCenter
                    Slot { name: "site.github" }
                }
                Row {
                    anchors.verticalCenter: parent.verticalCenter
                    Slot { name: "site.switcher" }
                }
                Row {
                    anchors.verticalCenter: parent.verticalCenter
                    Slot { name: "site.preferences" }
                }
            }
            Rectangle {
                y: parent.height - 1
                width: parent.width
                height: 1
                color: look.divider
            }
        }
    }

    // The sidebar: every page.
    Rectangle {
        id: sidebar
        y: toolBar.y + toolBar.height
        width: 248
        height: statusBar.y - y
        color: look.surface
        Item {
            anchors.fill: parent
            Slot { name: "site.tree" }
        }
    }
    Rectangle {
        x: sidebar.width
        y: sidebar.y
        width: 1
        height: sidebar.height
        color: look.divider
    }

    // The pages open, as tabs, and the one shown under them.
    Item {
        id: documents
        x: sidebar.width + 1
        y: sidebar.y
        width: parent.width - x
        height: sidebar.height

        Rectangle {
            id: strip
            width: parent.width
            height: tabBar.height
            color: look.surface
            // Between the header and the page, so a landmark of its own.
            Accessible.role: Accessible.Section
            Accessible.name: t`Open pages`

            C.TabBar {
                id: tabBar
                width: parent.width
                Accessible.name: t`Open pages`

                Repeater {
                    model: shell.tabs
                    C.TabButton {
                        required property var modelData
                        required property int index
                        text: shell.router ? shell.router.nameOf(modelData) : modelData
                        iconName: modelData === "/" ? "house" : modelData.startsWith("/demos/") ? "play" : modelData === "/showcase/" ? "image" : "file-text"
                        onClicked: if (modelData !== shell.route) shell.router.go(modelData)
                    }
                }
            }
            Rectangle {
                y: parent.height - 1
                width: parent.width
                height: 1
                color: look.divider
            }
        }
        Item {
            id: page
            y: strip.height
            width: parent.width
            height: parent.height - y
            Slot { name: "site.page" }
        }
    }

    // The status bar.
    Rectangle {
        id: statusBar
        y: parent.height - height
        width: parent.width
        height: 28
        color: look.surface
        Accessible.role: Accessible.StatusBar
        Accessible.name: t`Status`

        Rectangle {
            width: parent.width
            height: 1
            color: look.divider
        }
        Row {
            x: 12
            anchors.verticalCenter: parent.verticalCenter
            spacing: 16

            Text {
                objectName: "statusRoute"
                text: shell.route
                color: look.textMuted
                font.family: shell.site ? shell.site.theme.mono : "monospace"
                font.pixelSize: 12
            }
            Text {
                objectName: "statusHydrated"
                visible: shell.hydratedMs >= 0
                text: t`Hydrated in ${hydratedMs} ms`
                color: look.textMuted
                font.family: look.sans
                font.pixelSize: 12
            }
            Text {
                objectName: "statusAlive"
                visible: shell.aliveCount > 0
                text: plural(aliveCount, { one: "# object alive", other: "# objects alive" })
                color: look.textMuted
                font.family: look.sans
                font.pixelSize: 12
            }
        }
    }
}
