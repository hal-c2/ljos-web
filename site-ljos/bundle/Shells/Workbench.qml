import QtQuick
import Ljos.Core
import Ljos.Blocks
import Ljos.Controls as C

// The site as an editor's workspace: the site's own QML and pages as a
// tree of files on the left, the pages opened as tabs over the page, and
// on the right what the page is made of: its Source. Under them the
// problems in the open file, and along the bottom what runs.
//
// The Source holds this very file as the site ships it: an edit that
// compiles is the shell from then on, the page and what runs on it kept.
//
// Its parts are places (Slots) the site puts its pieces in by name, as
// the Elegant shell's are: `site.page` is the very page another shell
// showed, still where the reader was on it. The Observer opens on the
// page itself (`site.observe()`); there are no Observer or Agent tabs to
// stand empty.
Rectangle {
    id: shell
    objectName: "workbenchShell"

    property var site: null
    readonly property var router: site ? site.router : null
    readonly property bool wide: site ? site.preferences.wide : width >= 1000
    readonly property bool menuOpen: site ? site.menuOpen && !wide : false
    readonly property bool calm: site ? site.preferences.calm : false
    readonly property string route: router ? router.route : "/"
    // A page other than the docs is this wide at most here.
    readonly property int pageWidest: 960

    readonly property var opened: site ? site.opened : [route]
    readonly property var problems: site ? site.problems : []
    readonly property var calls: site ? site.calls : []
    readonly property int alive: site ? site.alive : 0
    readonly property string renderer: site ? site.renderer : ""
    readonly property int hydratedMs: site ? site.hydratedIn : -1

    // What the reader has shown and hidden.
    property bool explorerOpen: true
    property bool inspectorOpen: true
    property alias panelShown: panelTabs.currentIndex
    // On a phone, the one pane shown: the explorer, the page, the
    // inspector or the problems.
    property int view: 1
    // The folders the reader opened or shut, by name; the others are as
    // they start (`opens`).
    property var folded: ({})

    function isOpen(folder, start) {
        return shell.folded[folder] !== undefined ? !shell.folded[folder] : start;
    }
    function fold(folder, open) {
        var next = Object.assign({}, shell.folded);
        next[folder] = !open;
        shell.folded = next;
    }
    function inspect() {
        shell.inspectorOpen = true;
        if (!shell.wide)
            shell.view = 2;
    }

    // Going to a page on a phone shows it.
    onRouteChanged: if (!shell.wide) shell.view = 1

    // What the reader has shown and hidden outlives this shell: an edit
    // of this file makes it again, as coming back to it does. Put back
    // once the site is had, after the route it brings has moved the
    // view, and kept from then on.
    readonly property var arranged: ({ explorerOpen: shell.explorerOpen, inspectorOpen: shell.inspectorOpen, panelShown: shell.panelShown, view: shell.view, folded: shell.folded, route: shell.route })
    property bool restored: false
    onArrangedChanged: if (site && restored) site.keep(objectName, arranged)
    function restore() {
        if (!site || restored)
            return;
        var was = site.kept(objectName);
        if (was) {
            shell.explorerOpen = was.explorerOpen;
            shell.inspectorOpen = was.inspectorOpen;
            shell.panelShown = was.panelShown;
            shell.folded = was.folded;
            // A page gone to elsewhere meanwhile is shown.
            shell.view = was.route === shell.route ? was.view : 1;
        }
        restored = true;
        site.keep(objectName, arranged);
    }
    onSiteChanged: {
        if (!site)
            return;
        site.measureRenderer();
        Qt.callLater(shell.restore);
    }
    Component.onCompleted: {
        if (!site)
            return;
        site.measureRenderer();
        Qt.callLater(shell.restore);
    }

    QtObject {
        id: look
        readonly property var theme: shell.site ? shell.site.theme : null
        readonly property color canvas: theme ? theme.canvas : C.Theme.canvas
        readonly property color surface: theme ? theme.surface : C.Theme.surface
        readonly property color raised: theme ? theme.surfaceRaised : C.Theme.surface
        readonly property color hover: theme ? theme.surfaceHover : C.Theme.surface
        readonly property color selected: theme ? theme.surfaceSelected : C.Theme.surface
        readonly property color divider: theme ? theme.divider : C.Theme.border
        readonly property color accent: theme ? theme.accent : C.Theme.text
        readonly property color focus: theme ? theme.focusRing : C.Theme.text
        readonly property color text: theme ? theme.text : C.Theme.text
        readonly property color muted: theme ? theme.textMuted : C.Theme.textMuted
        readonly property color danger: theme ? theme.danger : C.Theme.text
        readonly property string sans: theme ? theme.sans : ""
        readonly property string mono: theme ? theme.mono : "monospace"
        // A tool's words: 13 px, as an editor's are.
        readonly property int ui: 13
    }

    width: parent ? parent.width : 1440
    height: parent ? parent.height : 900
    color: look.canvas

    // A button of the activity bar or a pane's header: its icon, and what
    // it does in a tip beside it under the pointer.
    component Tool: C.Button {
        id: tool
        property string tip: text
        property bool beside: false
        subtle: true
        display: C.Button.IconOnly
        width: 40
        height: 40
        HoverHandler { id: over }
        C.ToolTip {
            visible: over.hovered
            text: tool.tip
            x: tool.beside ? tool.width + 6 : (tool.width - implicitWidth) / 2
            y: tool.beside ? (tool.height - implicitHeight) / 2 : -implicitHeight - 3
        }
    }

    // A row of the explorer: a folder (a button, pressed while open), a
    // file that opens a page (a link, current while it is shown) or one
    // that does something (a button).
    component Entry: Item {
        id: entry
        property string label: ""
        property string icon: "file"
        property int depth: 0
        property string to: ""
        property bool folder: false
        property bool open: false
        property bool current: false
        readonly property string href: to !== "" && shell.router ? shell.router.address(to) : ""
        signal pressed

        width: parent ? parent.width : 240
        // Dense where there's a pointer, a finger's size on a phone.
        height: shell.wide ? 24 : 44
        activeFocusOnTab: true
        Accessible.role: to !== "" ? Accessible.Link : Accessible.Button
        Accessible.name: label
        Accessible.checkable: folder
        Accessible.checked: folder && open
        Accessible.selected: current
        Accessible.onPressAction: () => entry.press()
        Keys.onPressed: (event) => {
            if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                entry.press();
                event.accepted = true;
            }
        }
        function press() {
            if (to !== "" && shell.router) {
                // Its page shown already is shown too: the route does
                // not change, so it is not left to the route to.
                if (!shell.wide)
                    shell.view = 1;
                shell.router.go(to);
            } else {
                entry.pressed();
            }
        }

        Rectangle {
            anchors.fill: parent
            color: entry.current ? look.selected : area.containsMouse ? look.hover : "transparent"
            border.color: entry.activeFocus ? look.focus : "transparent"
            border.width: 1
            Accessible.ignored: true
        }
        C.Icon {
            x: 8 + entry.depth * 14
            anchors.verticalCenter: parent.verticalCenter
            size: 16
            name: entry.folder ? (entry.open ? "chevron-down" : "chevron-right") : entry.icon
            color: entry.current ? look.accent : look.muted
            Accessible.ignored: true
        }
        Text {
            x: 30 + entry.depth * 14
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width - x - 8
            text: entry.label
            color: look.text
            font.family: entry.folder ? look.sans : look.mono
            font.pixelSize: look.ui
            font.weight: entry.folder ? Font.DemiBold : Font.Normal
            elide: Text.ElideRight
            Accessible.ignored: true
        }
        MouseArea {
            id: area
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            Accessible.ignored: true
            onClicked: entry.press()
        }
    }

    // A tab of a strip: the open files' and the panel's.
    component Tab: Rectangle {
        id: tab
        property string label: ""
        property string icon: ""
        property bool current: false
        property bool closable: false
        // A phone's bottom bar: the icon over its word, each centred, so
        // a quarter of a phone's width holds the whole word.
        property bool stacked: false
        property bool mono: false
        // How wide its words are, for a tab as snug as they are.
        readonly property real wordsWidth: tabWords.implicitWidth
        signal pressed

        height: 35
        color: current ? look.canvas : "transparent"
        activeFocusOnTab: true
        Accessible.role: Accessible.PageTab
        Accessible.name: label
        Accessible.selected: current
        Accessible.onPressAction: () => tab.pressed()
        Keys.onPressed: (event) => {
            if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                tab.pressed();
                event.accepted = true;
            }
        }

        Rectangle {
            visible: tab.current
            width: parent.width
            height: 2
            color: look.accent
            Accessible.ignored: true
        }
        Rectangle {
            anchors.fill: parent
            color: "transparent"
            border.color: tab.activeFocus ? look.focus : "transparent"
            border.width: 1
            Accessible.ignored: true
        }
        C.Icon {
            id: mark
            visible: tab.icon !== ""
            x: tab.stacked ? (parent.width - width) / 2 : 12
            y: tab.stacked ? 9 : (parent.height - height) / 2
            size: tab.stacked ? 18 : 14
            name: tab.icon
            color: tab.current ? look.accent : look.muted
            Accessible.ignored: true
        }
        Text {
            id: tabWords
            x: tab.stacked ? 4 : mark.visible ? 32 : 12
            y: tab.stacked ? mark.y + mark.height + 4 : (parent.height - height) / 2
            width: tab.stacked ? parent.width - 8 : parent.width - x - (tab.closable ? 32 : 12)
            horizontalAlignment: tab.stacked ? Text.AlignHCenter : Text.AlignLeft
            text: tab.label
            color: tab.current ? look.text : look.muted
            font.family: tab.mono ? look.mono : look.sans
            font.pixelSize: look.ui
            elide: Text.ElideMiddle
        }
        MouseArea {
            anchors.fill: parent
            cursorShape: Qt.PointingHandCursor
            Accessible.ignored: true
            onClicked: tab.pressed()
        }
    }

    // The title bar: the name, the open file, search and the source.
    Rectangle {
        id: titleBar
        z: 3
        width: parent.width
        height: shell.wide ? 40 : 56
        color: look.surface
        Accessible.role: Accessible.Section
        Accessible.name: "Ljós"

        Rectangle {
            y: parent.height - 1
            width: parent.width
            height: 1
            color: look.divider
        }
        Row {
            x: shell.wide ? 12 : 16
            anchors.verticalCenter: parent.verticalCenter
            spacing: 14

            Row {
                anchors.verticalCenter: parent.verticalCenter
                Slot { name: shell.wide ? "site.brand.small" : "site.brand" }
            }
            Text {
                visible: shell.wide
                anchors.verticalCenter: parent.verticalCenter
                width: Math.max(0, titleBar.width - 620)
                text: shell.router ? shell.router.fileOf(shell.route) : ""
                color: look.muted
                font.family: look.mono
                font.pixelSize: look.ui
                elide: Text.ElideMiddle
            }
        }
        Row {
            x: parent.width - width - (shell.wide ? 12 : 8)
            anchors.verticalCenter: parent.verticalCenter
            spacing: 8

            Item {
                visible: shell.wide
                width: 280
                height: 30
                anchors.verticalCenter: parent.verticalCenter
                Slot { name: "site.search" }
            }
            Row {
                visible: shell.wide
                anchors.verticalCenter: parent.verticalCenter
                Slot { name: "site.github" }
            }
            // A phone's one control: the menu.
            Row {
                visible: !shell.wide
                anchors.verticalCenter: parent.verticalCenter
                Slot { name: "site.menu" }
            }
        }
    }

    // The activity bar: which panes show, the Observer, the shell and
    // how the site looks.
    Rectangle {
        id: activity
        visible: shell.wide
        z: 2
        y: titleBar.height
        width: shell.wide ? 48 : 0
        height: statusBar.y - y
        color: look.surface
        // A landmark round its toolbar: what is in the page is in one.
        Accessible.role: Accessible.Section
        Accessible.name: t`Activity`

        Item {
            anchors.fill: parent
            Accessible.role: Accessible.ToolBar
            Accessible.name: t`Activity bar`

            Column {
                x: 4
                y: 6
                spacing: 4

                Tool {
                    beside: true
                    iconName: "folder"
                    text: t`Explorer`
                    checkable: true
                    checked: shell.explorerOpen
                    onClicked: shell.explorerOpen = !shell.explorerOpen
                }
                Tool {
                    beside: true
                    iconName: "eye"
                    text: t`Observer`
                    checkable: true
                    checked: shell.site ? shell.site.observing : false
                    onClicked: if (shell.site) shell.site.observe()
                }
            }
            Column {
                x: 4
                y: parent.height - height - 6
                spacing: 4

                Item {
                    width: 40
                    height: 40
                    HoverHandler { id: overSwitcher }
                    Row {
                        anchors.centerIn: parent
                        Slot { name: "site.switcher.compact" }
                    }
                    C.ToolTip {
                        visible: overSwitcher.hovered
                        text: t`Shell switcher`
                        x: 46
                        y: (40 - implicitHeight) / 2
                    }
                }
                Tool {
                    id: appearance
                    beside: true
                    iconName: "settings"
                    text: t`Appearance settings`
                    onClicked: looks.opened ? looks.close() : looks.open()

                    C.Popover {
                        id: looks
                        edge: Qt.RightEdge
                        padding: 8
                        contentItem: Row {
                            Slot { name: "site.preferences" }
                        }
                    }
                }
            }
        }
        Rectangle {
            x: parent.width - 1
            width: 1
            height: parent.height
            color: look.divider
        }
    }

    // The explorer: the site's QML and its pages, as a workspace's files.
    Rectangle {
        id: explorer
        readonly property bool shown: shell.wide ? shell.explorerOpen : shell.view === 0
        visible: shown
        x: shell.wide ? activity.width : 0
        y: titleBar.height
        width: !shown ? 0 : shell.wide ? 240 : shell.width
        height: (shell.wide ? statusBar.y : views.y) - y
        color: look.surface
        Accessible.role: Accessible.ComplementaryContent
        Accessible.name: t`Explorer`

        Text {
            x: 16
            height: 32
            verticalAlignment: Text.AlignVCenter
            text: t`Workspace: ljos.dev`
            color: look.muted
            font.family: look.sans
            font.pixelSize: 11
            font.weight: Font.DemiBold
            font.letterSpacing: 0.4
        }
        Flickable {
            y: 32
            width: parent.width
            height: parent.height - y
            contentWidth: width
            contentHeight: tree.implicitHeight + 16
            clip: true

            Column {
                id: tree
                width: parent.width

                Entry {
                    id: shellsFolder
                    folder: true
                    label: t`Shells/`
                    open: shell.isOpen("Shells/", true)
                    onPressed: shell.fold("Shells/", !open)
                }
                Repeater {
                    // Without their suffix: written whole, each would be
                    // that shell itself, fetched with this one (a string or
                    // a sum that ends in it is an import to the compiler).
                    model: shellsFolder.open ? [
                        { file: "Elegant", name: "elegant" },
                        { file: "Cyberpunk", name: "cyberpunk" },
                        { file: "Workbench", name: "workbench" },
                        { file: "Desktop", name: "desktop" }
                    ] : []
                    Entry {
                        required property var modelData
                        depth: 1
                        icon: "code"
                        label: [modelData.file, "qml"].join(".")
                        // This one's own QML is the Source tab's; the
                        // others' come to read.
                        onPressed: modelData.name === "workbench" ? shell.inspect() : shell.site.showSource(modelData.name)
                    }
                }
                Entry {
                    id: siteFolder
                    folder: true
                    label: t`Site/`
                    open: shell.isOpen("Site/", true)
                    onPressed: shell.fold("Site/", !open)
                }
                Repeater {
                    model: siteFolder.open ? ["/", "/demos/", "/showcase/"] : []
                    Entry {
                        required property var modelData
                        depth: 1
                        icon: "code"
                        label: shell.router ? shell.router.fileOf(modelData) : ""
                        to: modelData
                        current: shell.route === modelData
                    }
                }
                Entry {
                    id: demosFolder
                    folder: true
                    label: t`Demos/`
                    open: shell.isOpen("Demos/", true)
                    onPressed: shell.fold("Demos/", !open)
                }
                Repeater {
                    model: demosFolder.open && shell.router ? shell.router.demos : []
                    Entry {
                        required property var modelData
                        depth: 1
                        icon: "code"
                        label: modelData.app
                        to: modelData.route
                        current: shell.route === modelData.route
                    }
                }
                Repeater {
                    model: shell.router ? shell.router.docs : []
                    Column {
                        id: section
                        required property var modelData
                        readonly property string folderName: modelData.label + "/"
                        // A section starts shut unless the page shown is in it.
                        readonly property bool open: shell.isOpen(folderName, modelData.pages.some((one) => one.route === shell.route))
                        width: tree.width

                        Entry {
                            folder: true
                            label: section.folderName
                            open: section.open
                            onPressed: shell.fold(section.folderName, !section.open)
                        }
                        Repeater {
                            model: section.open ? section.modelData.pages : []
                            Entry {
                                required property var modelData
                                depth: 1
                                icon: "file-text"
                                label: shell.router ? shell.router.fileOf(modelData.route) : ""
                                to: modelData.route
                                current: shell.route === modelData.route
                            }
                        }
                    }
                }
            }
        }
        Rectangle {
            visible: shell.wide
            x: parent.width - 1
            width: 1
            height: parent.height
            color: look.divider
        }
    }

    // The open files, as tabs, the page under them and the panel under
    // that.
    Item {
        id: centre
        readonly property bool shown: shell.wide || shell.view === 1
        visible: shown
        x: shell.wide ? explorer.x + explorer.width : 0
        y: titleBar.height
        width: !shell.wide ? shell.width : (inspector.shown ? inspector.x : shell.width) - x
        height: (shell.wide ? panel.y : views.y) - y

        Rectangle {
            id: strip
            visible: shell.wide
            width: parent.width
            height: shell.wide ? 35 : 0
            color: look.surface
            // A landmark of its own beside the page's main one.
            Accessible.role: Accessible.Section
            Accessible.name: t`Editor`

            Flickable {
                width: parent.width - (inspector.shown ? 0 : 44)
                height: parent.height
                contentWidth: files.width
                contentHeight: height
                clip: true

                Item {
                    width: files.width
                    height: parent.height

                    Row {
                        id: files
                        Accessible.role: Accessible.PageTabList
                        Accessible.name: t`Open files`

                        Repeater {
                            model: shell.opened
                            Tab {
                                required property var modelData
                                width: 176
                                mono: true
                                closable: shell.opened.length > 1
                                icon: modelData.startsWith("/start/") || shell.router && shell.router.docsRoute && modelData === shell.route ? "file-text" : "code"
                                label: shell.router ? shell.router.fileOf(modelData) : modelData
                                current: modelData === shell.route
                                onPressed: if (modelData !== shell.route) shell.router.go(modelData)
                            }
                        }
                    }
                    // Each tab's close, beside the tab and not in the list
                    // of them, which holds tabs alone.
                    Repeater {
                        model: shell.opened.length > 1 ? shell.opened : []
                        C.Button {
                            required property int index
                            required property var modelData
                            x: index * 176 + 176 - width - 4
                            y: (35 - height) / 2
                            width: 26
                            height: 26
                            subtle: true
                            iconName: "x"
                            display: C.Button.IconOnly
                            text: t`Close ${shell.router ? shell.router.fileOf(modelData) : modelData}`
                            onClicked: shell.site.close(index)
                        }
                    }
                }
            }
            Tool {
                visible: !inspector.shown
                x: parent.width - width - 2
                y: (35 - height) / 2
                width: 32
                height: 32
                iconName: "chevron-left"
                text: t`Expand inspector`
                onClicked: shell.inspectorOpen = true
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

    // What the page is made of.
    Rectangle {
        id: inspector
        readonly property bool shown: shell.wide ? shell.inspectorOpen : shell.view === 2
        visible: shown
        x: shell.wide ? shell.width - width : 0
        y: titleBar.height
        width: !shown ? 0 : shell.wide ? Math.round(Math.min(420, Math.max(340, shell.width * 0.25))) : shell.width
        height: (shell.wide ? statusBar.y : views.y) - y
        color: look.surface
        Accessible.role: Accessible.ComplementaryContent
        Accessible.name: t`Inspector`

        Rectangle {
            visible: shell.wide
            width: 1
            height: parent.height
            color: look.divider
        }
        // Its one view, named as a tab would be, at a tab's height.
        Item {
            id: inspectorHead
            x: 1
            width: parent.width - 1 - (shell.wide ? collapse.width + 4 : 0)
            height: shell.wide ? 36 : 52
            Text {
                x: 16
                anchors.verticalCenter: parent.verticalCenter
                text: t({ message: "Source", context: "panel" })
                color: look.muted
                font.family: look.sans
                font.pixelSize: 12
                font.weight: Font.DemiBold
                font.capitalization: Font.AllUppercase
                font.letterSpacing: 0.6
                Accessible.role: Accessible.Heading
                Accessible.name: text
            }
            // Under the collapse control too: the panel's whole width.
            Rectangle {
                y: parent.height - 1
                width: inspector.width - 1
                height: 1
                color: look.divider
            }
        }
        Tool {
            id: collapse
            visible: shell.wide
            x: parent.width - width - 4
            y: (inspectorHead.height - height) / 2
            width: 32
            height: 32
            iconName: "chevron-right"
            text: t`Collapse inspector`
            onClicked: shell.inspectorOpen = false
        }
        // This shell's own QML, edited in place.
        Item {
            x: 1
            y: inspectorHead.height
            width: parent.width - 1
            height: parent.height - y
            Slot { name: "site.source.live" }
        }
    }

    // The panel: what is wrong with the open file, the agent's calls and
    // what the page said as it came up.
    Rectangle {
        id: panel
        readonly property bool shown: shell.wide || shell.view === 3
        visible: shown
        x: shell.wide ? centre.x : 0
        y: shell.wide ? statusBar.y - height : titleBar.height
        width: shell.wide ? centre.width : shell.width
        height: shell.wide ? Math.min(180, Math.round(shell.height * 0.24)) : views.y - y
        color: look.surface
        Accessible.role: Accessible.Section
        Accessible.name: t`Bottom panel`

        Rectangle {
            width: parent.width
            height: 1
            color: look.divider
        }
        Row {
            id: panelTabs
            property int currentIndex: 0
            y: 1
            Accessible.role: Accessible.PageTabList
            Accessible.name: t`Panel`

            Repeater {
                model: [t`Problems`, t`MCP log`, t`Output`]
                Tab {
                    required property var modelData
                    required property int index
                    // Its width as its words are, so each sits snug.
                    width: wordsWidth + 24
                    height: shell.wide ? 35 : 44
                    label: index === 0 && shell.problems.length > 0 ? `${modelData} ${shell.problems.length}` : modelData
                    current: panelTabs.currentIndex === index
                    onPressed: panelTabs.currentIndex = index
                }
            }
        }
        Item {
            id: panelBody
            x: 12
            y: 1 + panelTabs.height + 4
            width: parent.width - 24
            height: parent.height - y - 4

            // Problems.
            Item {
                anchors.fill: parent
                visible: shell.panelShown === 0
                Text {
                    visible: shell.problems.length === 0
                    width: parent.width
                    text: t`No compiler or lint diagnostics in the open file.`
                    color: look.muted
                    font.family: look.sans
                    font.pixelSize: look.ui
                    wrapMode: Text.Wrap
                }
                Flickable {
                    visible: shell.problems.length > 0
                    anchors.fill: parent
                    contentWidth: width
                    contentHeight: problemList.implicitHeight
                    clip: true

                    Column {
                        id: problemList
                        width: parent.width
                        spacing: 2
                        Accessible.role: Accessible.List
                        Accessible.name: t`Problems`

                        Repeater {
                            model: shell.problems
                            Item {
                                required property var modelData
                                width: problemList.width
                                height: Math.max(22, said.implicitHeight + 4)
                                Accessible.role: Accessible.ListItem
                                Accessible.name: modelData.text

                                C.Icon {
                                    y: 3
                                    size: 14
                                    name: "circle-x"
                                    color: look.danger
                                    Accessible.ignored: true
                                }
                                Text {
                                    id: said
                                    x: 22
                                    y: 2
                                    width: parent.width - x
                                    text: modelData.text
                                    color: look.text
                                    font.family: look.mono
                                    font.pixelSize: 12
                                    wrapMode: Text.Wrap
                                    Accessible.ignored: true
                                }
                            }
                        }
                    }
                }
            }
            // The agent's calls: the front page's recorded agent, stepped.
            Item {
                anchors.fill: parent
                visible: shell.panelShown === 1
                Text {
                    visible: shell.calls.length === 0
                    width: parent.width - clear.width - 12
                    text: t`Recorded MCP calls appear here as you step the agent replay.`
                    color: look.muted
                    font.family: look.sans
                    font.pixelSize: look.ui
                    wrapMode: Text.Wrap
                }
                Flickable {
                    visible: shell.calls.length > 0
                    width: parent.width - clear.width - 12
                    height: parent.height
                    contentWidth: width
                    contentHeight: callList.implicitHeight
                    clip: true

                    Column {
                        id: callList
                        width: parent.width
                        spacing: 2
                        Accessible.role: Accessible.List
                        Accessible.name: t`MCP log`

                        Repeater {
                            model: shell.calls
                            Text {
                                required property var modelData
                                width: callList.width
                                text: `${modelData.tool}(${modelData.args}) → ${modelData.said}`
                                color: look.text
                                font.family: look.mono
                                font.pixelSize: 12
                                wrapMode: Text.Wrap
                                Accessible.role: Accessible.ListItem
                                Accessible.name: text
                            }
                        }
                    }
                }
                C.Button {
                    id: clear
                    x: parent.width - width
                    height: shell.wide ? implicitHeight : 44
                    subtle: true
                    iconName: "trash"
                    text: t`Clear log`
                    enabled: shell.calls.length > 0
                    onClicked: if (shell.site) shell.site.clearCalls()
                }
            }
            // What the page said as it came up.
            Column {
                visible: shell.panelShown === 2
                width: parent.width
                spacing: 4
                Text {
                    visible: shell.hydratedMs >= 0
                    text: t`Hydrated in ${shell.hydratedMs} ms`
                    color: look.text
                    font.family: look.mono
                    font.pixelSize: 12
                }
                Text {
                    visible: shell.renderer !== ""
                    text: t`Renderer: ${shell.renderer}`
                    color: look.text
                    font.family: look.mono
                    font.pixelSize: 12
                }
                Text {
                    text: t`Objects: ${shell.alive}`
                    color: look.text
                    font.family: look.mono
                    font.pixelSize: 12
                }
            }
        }
    }

    // A phone's panes, one at a time, along the bottom.
    Rectangle {
        id: views
        visible: !shell.wide
        y: shell.wide ? shell.height : shell.height - height
        width: parent.width
        height: shell.wide ? 0 : 56
        color: look.surface

        Rectangle {
            width: parent.width
            height: 1
            color: look.divider
        }
        Row {
            y: 1
            Accessible.role: Accessible.PageTabList
            Accessible.name: t`Views`

            Repeater {
                model: [
                    { label: t`Explorer`, icon: "folder" },
                    { label: t`Preview`, icon: "eye" },
                    { label: t`Inspector`, icon: "code" },
                    { label: t`Problems`, icon: "circle-alert" }
                ]
                Tab {
                    required property var modelData
                    required property int index
                    width: Math.floor(views.width / 4)
                    height: 55
                    stacked: true
                    icon: modelData.icon
                    label: modelData.label
                    current: shell.view === index
                    onPressed: shell.view = index
                }
            }
        }
    }

    // The status bar: the shell, the page, what is wrong and what runs.
    Rectangle {
        id: statusBar
        visible: shell.wide
        y: shell.wide ? shell.height - height : shell.height
        width: parent.width
        height: shell.wide ? 24 : 0
        color: look.surface
        Accessible.role: Accessible.StatusBar
        Accessible.name: t`Status bar`

        Rectangle {
            width: parent.width
            height: 1
            color: look.divider
        }
        Row {
            x: 12
            anchors.verticalCenter: parent.verticalCenter
            spacing: 18

            Text {
                text: t`Shell: Workbench`
                color: look.text
                font.family: look.sans
                font.pixelSize: look.ui
            }
            Text {
                text: t`Route: ${shell.route}`
                color: look.muted
                font.family: look.mono
                font.pixelSize: look.ui
            }
            Text {
                text: t`Diagnostics: ${shell.problems.length}`
                color: shell.problems.length > 0 ? look.danger : look.muted
                font.family: look.sans
                font.pixelSize: look.ui
            }
        }
        Row {
            x: parent.width - width - 12
            anchors.verticalCenter: parent.verticalCenter
            spacing: 18

            Text {
                text: t`Objects: ${shell.alive}`
                color: look.muted
                font.family: look.sans
                font.pixelSize: look.ui
            }
            Text {
                visible: shell.renderer !== ""
                text: t`Renderer: ${shell.renderer}`
                color: look.muted
                font.family: look.sans
                font.pixelSize: look.ui
            }
        }
    }

    // A phone's menu: search, the shell, the reader's choices and the
    // docs. It rises into place, or with reduced motion only fades.
    Rectangle {
        id: menu
        z: 2
        Accessible.role: Accessible.Section
        Accessible.name: t`Menu`
        width: parent.width
        y: titleBar.height + (shell.menuOpen || shell.calm ? 0 : -16)
        height: parent.height - titleBar.height
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

        Flickable {
            anchors.fill: parent
            contentWidth: width
            contentHeight: menuColumn.implicitHeight + 48
            clip: true

            Column {
                id: menuColumn
                x: 16
                y: 24
                width: parent.width - 32
                spacing: 24

                Item {
                    z: 2
                    width: parent.width
                    height: 44
                    Slot { name: "site.search" }
                }
                Row {
                    Slot { name: "site.switcher" }
                }
                Row {
                    spacing: 8
                    Slot { name: "site.github" }
                    Slot { name: "site.preferences" }
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
