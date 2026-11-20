import QtQuick
import Ljos.Core
import Ljos.Blocks
import Ljos.Controls as C

// The site as a workbench: every page of it on the left, as files are,
// the page in the middle, and on the right what it is made of and what
// is in it as it runs: its Source, an Observer of a running example, and
// the calls an Agent made to drive it.
//
// Its parts are places (Slots) the site puts its pieces in by name, as
// the marketing shell's are: `site.page` is the very page another shell
// showed, still where the reader was on it. `site.observer` and
// `site.agent` are places a part of the site that shows one adds to; till
// one does, each says what it will hold.
Rectangle {
    id: shell
    objectName: "workbenchShell"

    property var site: null
    readonly property var router: site ? site.router : null
    // A page other than the docs is this wide at most here.
    readonly property int pageWidest: 960

    QtObject {
        id: look
        readonly property color canvas: shell.site ? shell.site.theme.canvas : C.Theme.canvas
        readonly property color surface: shell.site ? shell.site.theme.surface : C.Theme.surface
        readonly property color divider: shell.site ? shell.site.theme.divider : C.Theme.border
        readonly property color text: shell.site ? shell.site.theme.text : C.Theme.text
        readonly property color textMuted: shell.site ? shell.site.theme.textMuted : C.Theme.textMuted
        readonly property string sans: shell.site ? shell.site.theme.sans : ""
    }

    width: parent ? parent.width : 1440
    height: parent ? parent.height : 900
    color: look.canvas

    // The bar: the name, the page's own, search and the reader's choices.
    Rectangle {
        id: bar
        z: 3
        width: parent.width
        height: 52
        color: look.surface
        Accessible.role: Accessible.Section
        Accessible.name: t`Main`

        Rectangle {
            y: parent.height - 1
            width: parent.width
            height: 1
            color: look.divider
        }
        Row {
            x: 16
            anchors.verticalCenter: parent.verticalCenter
            spacing: 16

            Row {
                anchors.verticalCenter: parent.verticalCenter
                Slot { name: "site.brand" }
            }
            Rectangle {
                anchors.verticalCenter: parent.verticalCenter
                width: 1
                height: 24
                color: look.divider
            }
            Text {
                anchors.verticalCenter: parent.verticalCenter
                width: Math.max(0, bar.width - 760)
                text: shell.router ? shell.router.title : ""
                color: look.textMuted
                font.family: look.sans
                font.pixelSize: 14
                elide: Text.ElideRight
            }
        }
        Row {
            x: parent.width - width - 12
            anchors.verticalCenter: parent.verticalCenter
            spacing: 8

            Item {
                width: 260
                height: 36
                anchors.verticalCenter: parent.verticalCenter
                Slot { name: "site.search" }
            }
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
    }

    // The files: every page of the site.
    Rectangle {
        id: files
        y: bar.height
        width: 264
        height: parent.height - y
        color: look.surface
        Accessible.role: Accessible.ComplementaryContent
        Accessible.name: t`Pages`

        Text {
            x: 16
            y: 12
            text: t`Pages`
            color: look.textMuted
            font.family: look.sans
            font.pixelSize: 12
            font.weight: Font.DemiBold
            font.capitalization: Font.AllUppercase
            font.letterSpacing: 0.6
            Accessible.ignored: true
        }
        Item {
            y: 32
            width: parent.width
            height: parent.height - y
            Slot { name: "site.tree" }
        }
    }
    Rectangle {
        x: files.width
        y: bar.height
        width: 1
        height: parent.height - y
        color: look.divider
    }

    // The page.
    Item {
        id: page
        x: files.width + 1
        y: bar.height
        width: panel.x - 1 - x
        height: parent.height - y
        Slot { name: "site.page" }
    }

    // What the page is made of, and what is in it as it runs.
    Rectangle {
        x: panel.x - 1
        y: bar.height
        width: 1
        height: parent.height - y
        color: look.divider
    }
    Rectangle {
        id: panel
        x: parent.width - width
        y: bar.height
        width: Math.round(Math.min(460, Math.max(340, shell.width * 0.28)))
        height: parent.height - y
        color: look.surface
        Accessible.role: Accessible.ComplementaryContent
        Accessible.name: t`Inspector`

        C.TabBar {
            id: tabs
            width: parent.width

            C.TabButton {
                text: t({ message: "Source", context: "stage tab" })
                iconName: "code"
            }
            C.TabButton {
                text: t`Observer`
                iconName: "eye"
            }
            C.TabButton {
                text: t`Agent`
                iconName: "sparkles"
            }
        }
        Item {
            y: tabs.height
            width: parent.width
            height: parent.height - y
            visible: tabs.currentIndex === 0
            Slot { name: "site.source" }
        }
        // The Observer of what runs on the page: a part of the site that
        // can show one (an embeddable Observer view, given the running
        // app to inspect) replaces this slot's own words.
        Item {
            y: tabs.height
            width: parent.width
            height: parent.height - y
            visible: tabs.currentIndex === 1
            Slot {
                name: "site.observer"
                delegate: Component {
                    C.EmptyState {
                        x: 16
                        y: 48
                        width: parent ? parent.width - 32 : 300
                        iconName: "eye"
                        title: t`Observer`
                        description: t`Nothing to show yet. Run the app to see inside it.`
                    }
                }
            }
        }
        Item {
            y: tabs.height
            width: parent.width
            height: parent.height - y
            visible: tabs.currentIndex === 2
            Slot {
                name: "site.agent"
                delegate: Component {
                    C.EmptyState {
                        x: 16
                        y: 48
                        width: parent ? parent.width - 32 : 300
                        iconName: "sparkles"
                        title: t`Agent`
                        description: t`No calls yet. Press Replay to watch an agent drive this app.`
                    }
                }
            }
        }
    }
}
