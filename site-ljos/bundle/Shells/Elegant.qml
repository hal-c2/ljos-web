import QtQuick
import Ljos.Core
import Ljos.Blocks

// ljos.dev's own shell, and every page's as the build writes it: a
// header with the name, where to go, search and the reader's choices,
// the page under it as wide as a front page wants, and, on the docs,
// their sidebar and what is on the page beside it. Narrow, a phone's,
// the header is the name and one menu button, and the menu holds the
// rest.
//
// Nothing here is the site's: each part is a place (a Slot) the site
// puts its pieces in by name, `site.page` the page itself. So this file
// is one anyone may rewrite, in the page, and the site stands in what
// they make (Site/ShellSource.qml). `site` is the site's state: its
// router, the reader's preferences and the look.
Rectangle {
    id: shell
    objectName: "elegantShell"

    property var site: null
    readonly property var router: site ? site.router : null
    readonly property bool wide: site ? site.preferences.wide : width >= 1000
    readonly property bool calm: site ? site.preferences.calm : false
    readonly property bool docs: router !== null && router.docsRoute
    readonly property bool sidebarShown: wide && docs
    // With the Observer docked over the right, what is on the page goes,
    // so the app the reader clicks in keeps the room beside it.
    readonly property bool tocShown: sidebarShown && width >= 1200 && router.headings.length > 0 && !(site && site.docked > 0)
    readonly property int gutter: wide ? 32 : 20
    readonly property bool menuOpen: site ? site.menuOpen && !wide : false
    // A page other than the docs is this wide at most here: a front page
    // has the room to span.
    readonly property int pageWidest: 1280
    // The header's row stands over the page's grid, so the name lines up
    // with the page's first column and the reader's choices with its
    // last; on the docs, whose sidebar meets the window's edge, and on a
    // phone it keeps to the gutter.
    readonly property int inset: docs || !wide ? gutter : Math.max(gutter, Math.round((width - pageWidest) / 2))

    // The colours the site draws in, for this shell's own lines: none of
    // its own before it is given the site.
    QtObject {
        id: look
        readonly property color canvas: shell.site ? shell.site.theme.canvas : "transparent"
        readonly property color divider: shell.site ? shell.site.theme.divider : "transparent"
    }

    width: parent ? parent.width : 1440
    height: parent ? parent.height : 900
    color: look.canvas

    // The header. Each part of the shell is a landmark, so a reader goes
    // to the page, the docs or the menu as a sighted one looks.
    Rectangle {
        id: header
        z: 3
        width: parent.width
        height: 64
        color: look.canvas
        Accessible.role: Accessible.Section
        Accessible.name: "Ljós"

        Rectangle {
            y: parent.height - 1
            width: parent.width
            height: 1
            color: look.divider
        }
        // The brand and the sections, each on the header's middle line:
        // the row is the header's height so each part centres on it,
        // whatever height the other has.
        Row {
            x: shell.inset
            height: header.height
            spacing: 32

            Row {
                y: Math.round((header.height - height) / 2)
                Slot { name: "site.brand" }
            }
            Row {
                visible: shell.wide
                y: Math.round((header.height - height) / 2)
                Slot { name: "site.nav" }
            }
        }
        Row {
            x: parent.width - width - (shell.wide ? shell.inset : shell.gutter - 8)
            anchors.verticalCenter: parent.verticalCenter
            spacing: 12

            Item {
                visible: shell.wide
                width: 280
                height: 40
                Slot { name: "site.search" }
            }
            Row {
                visible: shell.wide
                anchors.verticalCenter: parent.verticalCenter
                Slot { name: "site.github" }
            }
            Row {
                visible: shell.wide
                anchors.verticalCenter: parent.verticalCenter
                Slot { name: "site.switcher" }
            }
            Row {
                visible: shell.wide
                anchors.verticalCenter: parent.verticalCenter
                Slot { name: "site.preferences" }
            }
            // A phone's one control: the menu.
            Row {
                visible: !shell.wide
                anchors.verticalCenter: parent.verticalCenter
                Slot { name: "site.menu" }
            }
        }
    }

    // The docs, beside the page.
    Item {
        id: sidebar
        visible: shell.sidebarShown
        y: header.height
        width: 264
        height: parent.height - y
        // Made where it shows: a narrow page would carry the docs' whole
        // list, hidden, in its first load.
        Loader {
            anchors.fill: parent
            active: shell.sidebarShown
            sourceComponent: Component {
                Item {
                    Slot { name: "site.sidebar" }
                }
            }
        }
    }
    Rectangle {
        visible: shell.sidebarShown
        x: sidebar.width
        y: header.height
        width: 1
        height: parent.height - y
        color: look.divider
    }

    // The page itself, the footer under it.
    Item {
        id: page
        x: shell.sidebarShown ? sidebar.width + 1 : 0
        y: header.height
        width: parent.width - x - (shell.tocShown ? toc.width : 0)
        height: parent.height - y
        Slot { name: "site.page" }
    }

    // On this page, beside it where there is room.
    Item {
        id: toc
        visible: shell.tocShown
        x: parent.width - width
        y: header.height
        width: 224
        height: parent.height - y
        Slot { name: "site.toc" }
    }

    // A phone's menu: search, where to go, the reader's choices, what is
    // on this page and the docs. It rises into place, or with reduced
    // motion only fades.
    Rectangle {
        id: menu
        z: 2
        Accessible.role: Accessible.Section
        Accessible.name: t`Menu`
        width: parent.width
        y: header.height + (shell.menuOpen || shell.calm ? 0 : -16)
        height: parent.height - header.height
        visible: !shell.wide && (shell.menuOpen || opacity > 0)
        opacity: shell.menuOpen ? 1 : 0
        color: look.canvas
        Behavior on opacity {
            NumberAnimation {
                duration: shell.menuOpen ? 250 : 100
                easing.type: Easing.OutCubic
            }
        }
        Behavior on y {
            NumberAnimation {
                duration: shell.menuOpen ? 250 : 100
                easing.type: Easing.OutCubic
            }
        }

        // What it holds is made when it opens and let go once it has
        // faded: closed, it is the docs' whole list again in every
        // page's first load, which a reader on a wide window never sees.
        Loader {
            anchors.fill: parent
            active: shell.menuOpen || menu.opacity > 0
            sourceComponent: Component {
                Flickable {
                    anchors.fill: parent
                    contentWidth: width
                    contentHeight: menuColumn.implicitHeight + 48
                    clip: true

                    Column {
                        id: menuColumn
                        x: shell.gutter
                        y: 24
                        width: parent.width - 2 * shell.gutter
                        spacing: 24

                        Item {
                            z: 2
                            width: parent.width
                            height: 44
                            Slot { name: "site.search" }
                        }
                        Column {
                            width: parent.width
                            Slot { name: "site.nav.large" }
                        }
                        Row {
                            spacing: 8
                            Slot { name: "site.github" }
                            Slot { name: "site.preferences" }
                        }
                        Row {
                            Slot { name: "site.switcher" }
                        }
                        Column {
                            visible: shell.docs
                            width: parent.width
                            Slot { name: "site.toc.inline" }
                        }
                        Rectangle {
                            width: parent.width
                            height: 1
                            color: look.divider
                        }
                        Column {
                            width: parent.width
                            Slot { name: "site.docs.inline" }
                        }
                    }
                }
            }
        }
    }
}
