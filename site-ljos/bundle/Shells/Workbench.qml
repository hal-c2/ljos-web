import Ljos.Ui
import Ljos.Core
import Ljos.Layout
import Ljos.Blocks
import Ljos.Controls as C
import "logic/shell-site.ts" as L

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

    // Missing until the site puts itself in.
    property L.Site site
    readonly property L.MaybeRouter router: L.given(site) ? site.router : undefined
    readonly property bool wide: L.given(site) ? site.preferences.wide : width >= 1000
    readonly property bool menuOpen: L.given(site) ? site.menuOpen && !wide : false
    readonly property bool calm: L.given(site) ? site.preferences.calm : false
    readonly property string route: router !== undefined && L.given(router) ? router.route : "/"
    // A page other than the docs is this wide at most here.
    readonly property int pageWidest: 960

    readonly property list<string> opened: L.given(site) ? site.opened : [route]
    readonly property list<L.Problem> problems: L.given(site) ? site.problems : []
    readonly property list<L.Call> calls: L.given(site) ? site.calls : []
    readonly property int alive: L.given(site) ? site.alive : 0
    readonly property string renderer: L.given(site) ? site.renderer : ""
    readonly property int hydratedMs: L.given(site) ? site.hydratedIn : -1

    // What the reader has shown and hidden.
    property bool explorerOpen: true
    property bool inspectorOpen: true
    property alias panelShown: panelTabs.currentIndex
    // On a phone, the one pane shown: the explorer, the page, the
    // inspector or the problems.
    property int view: 1
    // The folders the reader opened or shut, by name; the others are as
    // they start (`opens`).
    property L.Folded folded: ({})

    function isOpen(folder: string, start: boolean): boolean {
        const was = shell.folded[folder];
        return was !== undefined ? !was : start;
    }
    function fold(folder: string, open: boolean) {
        shell.folded = L.folding(shell.folded, folder, open);
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
    readonly property L.Arrangement arranged: ({ explorerOpen: shell.explorerOpen, inspectorOpen: shell.inspectorOpen, panelShown: shell.panelShown, view: shell.view, folded: shell.folded, route: shell.route })
    property bool restored: false
    onArrangedChanged: if (L.given(site) && restored) site.keep(objectName, arranged)
    function restore() {
        if (!L.given(site) || restored)
            return;
        // Only what this shell gave it to keep is kept.
        const was = L.arrangementOf(site.kept(objectName));
        if (was !== undefined) {
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
        if (!L.given(site))
            return;
        site.measureRenderer();
        later(shell.restore);
    }
    Component.onCompleted: {
        if (!L.given(site))
            return;
        site.measureRenderer();
        later(shell.restore);
    }

    // The site's colours, or the controls' own until it is had. A
    // component of its own so the shell's parts below can be given it.
    component Look: Object {
        property L.MaybeTheme theme
        readonly property color canvas: theme !== undefined && L.given(theme) ? theme.canvas : C.Theme.canvas
        readonly property color surface: theme !== undefined && L.given(theme) ? theme.surface : C.Theme.surface
        readonly property color raised: theme !== undefined && L.given(theme) ? theme.surfaceRaised : C.Theme.surface
        readonly property color hover: theme !== undefined && L.given(theme) ? theme.surfaceHover : C.Theme.surface
        readonly property color selected: theme !== undefined && L.given(theme) ? theme.surfaceSelected : C.Theme.surface
        readonly property color divider: theme !== undefined && L.given(theme) ? theme.divider : C.Theme.border
        readonly property color accent: theme !== undefined && L.given(theme) ? theme.accent : C.Theme.text
        readonly property color focus: theme !== undefined && L.given(theme) ? theme.focusRing : C.Theme.text
        readonly property color text: theme !== undefined && L.given(theme) ? theme.text : C.Theme.text
        readonly property color muted: theme !== undefined && L.given(theme) ? theme.textMuted : C.Theme.textMuted
        readonly property color danger: theme !== undefined && L.given(theme) ? theme.danger : C.Theme.text
        readonly property string sans: theme !== undefined && L.given(theme) ? theme.sans : ""
        readonly property string mono: theme !== undefined && L.given(theme) ? theme.mono : "monospace"
        // A tool's words: 13 px, as an editor's are.
        readonly property int ui: 13
    }
    Look {
        id: look
        theme: L.given(shell.site) ? shell.site.theme : undefined
    }

    width: parent !== null ? parent.width : 1440
    height: parent !== null ? parent.height : 900
    fill: look.canvas

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
        Hover { id: over }
        C.ToolTip {
            visible: over.hovered
            text: tool.tip
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: tool.beside ? tool.width + 6 : (tool.width - implicitWidth) / 2
            x: App.layoutDirection === Direction.RightToLeft ? tool.width - width - startX : startX
            y: tool.beside ? (tool.height - implicitHeight) / 2 : -implicitHeight - 3
        }
    }

    // A row of the explorer: a folder (a button, pressed while open), a
    // file that opens a page (a link, current while it is shown) or one
    // that does something (a button).
    component Entry: Item {
        id: entry
        // The shell's, given: a component sees no id outside it. Named
        // for no id in the shell, as Ljós on the desktop reads `look:
        // look` in a Repeater's delegate as the delegate's own.
        required property L.Bench host
        required property Look colours
        property string label: ""
        property string icon: "file"
        property int depth: 0
        property string to: ""
        property bool folder: false
        property bool open: false
        property bool current: false
        readonly property string href: to !== "" && host.router !== undefined && L.given(host.router) ? host.router.address(to) : ""
        signal pressed

        width: parent !== null ? parent.width : 240
        // Dense where there's a pointer, a finger's size on a phone.
        height: host.wide ? 24 : 44
        activeFocusOnTab: true
        Accessible.role: to !== "" ? Accessible.Link : Accessible.Button
        Accessible.name: label
        Accessible.checkable: folder
        Accessible.checked: folder && open
        Accessible.selected: current
        Accessible.onPressAction: () => entry.press()
        Keys.onPressed: (event: KeyEvent) => {
            if (event.key === Key.Return || event.key === Key.Enter || event.key === Key.Space) {
                entry.press();
                event.accepted = true;
            }
        }
        function press() {
            if (to !== "" && host.router !== undefined && L.given(host.router)) {
                // Its page shown already is shown too: the route does
                // not change, so it is not left to the route to.
                if (!host.wide)
                    host.view = 1;
                host.router.go(to);
            } else {
                entry.pressed();
            }
        }

        Rectangle {
            anchors.fill: parent
            fill: entry.current ? colours.selected : area.containsMouse ? colours.hover : "transparent"
            border.color: entry.activeFocus ? colours.focus : "transparent"
            border.width: 1
            Accessible.ignored: true
        }
        C.Icon {
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: 8 + entry.depth * 14
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
            anchors.verticalCenter: parent.verticalCenter
            size: 16
            name: entry.folder ? (entry.open ? "chevron-down" : "chevron-right") : entry.icon
            color: entry.current ? colours.accent : colours.muted
            Accessible.ignored: true
        }
        Text {
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: 30 + entry.depth * 14
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width - startX - 8
            text: entry.label
            color: colours.text
            font.family: entry.folder ? colours.sans : colours.mono
            font.size: colours.ui
            font.weight: entry.folder ? Font.DemiBold : Font.Normal
            elide: Text.ElideRight
            Accessible.ignored: true
        }
        PointerArea {
            id: area
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Cursor.PointingHand
            Accessible.ignored: true
            onClicked: entry.press()
        }
    }

    // A tab of a strip: the open files' and the panel's.
    component Tab: Rectangle {
        id: tab
        required property Look colours
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
        fill: current ? colours.canvas : "transparent"
        activeFocusOnTab: true
        Accessible.role: Accessible.PageTab
        Accessible.name: label
        Accessible.selected: current
        Accessible.onPressAction: () => tab.pressed()
        Keys.onPressed: (event: KeyEvent) => {
            if (event.key === Key.Return || event.key === Key.Enter || event.key === Key.Space) {
                tab.pressed();
                event.accepted = true;
            }
        }

        Rectangle {
            visible: tab.current
            width: parent.width
            height: 2
            fill: colours.accent
            Accessible.ignored: true
        }
        Rectangle {
            anchors.fill: parent
            fill: "transparent"
            border.color: tab.activeFocus ? colours.focus : "transparent"
            border.width: 1
            Accessible.ignored: true
        }
        C.Icon {
            id: mark
            visible: tab.icon !== ""
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: tab.stacked ? (parent.width - width) / 2 : 12
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
            y: tab.stacked ? 9 : (parent.height - height) / 2
            size: tab.stacked ? 18 : 14
            name: tab.icon
            color: tab.current ? colours.accent : colours.muted
            Accessible.ignored: true
        }
        Text {
            id: tabWords
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: tab.stacked ? 4 : mark.visible ? 32 : 12
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
            y: tab.stacked ? mark.y + mark.height + 4 : (parent.height - height) / 2
            width: tab.stacked ? parent.width - 8 : parent.width - startX - (tab.closable ? 32 : 12)
            align: tab.stacked ? Text.AlignHCenter : Text.AlignLeft
            text: tab.label
            color: tab.current ? colours.text : colours.muted
            font.family: tab.mono ? colours.mono : colours.sans
            font.size: colours.ui
            elide: Text.ElideMiddle
        }
        PointerArea {
            anchors.fill: parent
            cursorShape: Cursor.PointingHand
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
        fill: look.surface
        Accessible.role: Accessible.Section
        Accessible.name: "Ljós"

        Rectangle {
            y: parent.height - 1
            width: parent.width
            height: 1
            fill: look.divider
        }
        Row {
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: shell.wide ? 12 : 16
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
            anchors.verticalCenter: parent.verticalCenter
            spacing: 14

            Row {
                Layout.alignment: Align.VCenter
                Slot { name: shell.wide ? "site.brand.small" : "site.brand" }
            }
            Text {
                visible: shell.wide
                Layout.alignment: Align.VCenter
                width: Math.max(0, titleBar.width - 620)
                text: shell.router !== undefined && L.given(shell.router) ? shell.router.fileOf(shell.route) : ""
                color: look.muted
                font.family: look.mono
                font.size: look.ui
                elide: Text.ElideMiddle
            }
        }
        Row {
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: parent.width - width - (shell.wide ? 12 : 8)
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
            anchors.verticalCenter: parent.verticalCenter
            spacing: 8

            Item {
                visible: shell.wide
                width: 280
                height: 30
                Layout.alignment: Align.VCenter
                Slot { name: "site.search" }
            }
            Row {
                visible: shell.wide
                Layout.alignment: Align.VCenter
                Slot { name: "site.github" }
            }
            // A phone's one control: the menu.
            Row {
                visible: !shell.wide
                Layout.alignment: Align.VCenter
                Slot { name: "site.menu" }
            }
        }
    }

    // The activity bar: which panes show, the Observer, the shell and
    // how the site looks.
    Rectangle {
        id: activity
        // Under a phone's menu it is out of Tab's way, as what a
        // sheet covers is: the keys go through the menu.
        enabled: !shell.menuOpen
        visible: shell.wide
        z: 2
        y: titleBar.height
        width: shell.wide ? 48 : 0
        // Along the page's start, the right on a right-to-left page.
        x: App.layoutDirection === Direction.RightToLeft ? parent.width - width : 0
        height: statusBar.y - y
        fill: look.surface
        // A landmark round its toolbar: what is in the page is in one.
        Accessible.role: Accessible.Section
        Accessible.name: t`Activity`

        Item {
            anchors.fill: parent
            Accessible.role: Accessible.ToolBar
            Accessible.name: t`Activity bar`

            Column {
                // Where it starts, read from the left; a right-to-left page
                // sets it as far from the right (LayoutMirroring).
                readonly property real startX: 4
                x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
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
                    checked: L.given(shell.site) ? shell.site.observing : false
                    onClicked: if (L.given(shell.site)) shell.site.observe()
                }
            }
            Column {
                // Where it starts, read from the left; a right-to-left page
                // sets it as far from the right (LayoutMirroring).
                readonly property real startX: 4
                x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
                y: parent.height - height - 6
                spacing: 4

                Item {
                    id: switcherSpot
                    width: 40
                    height: 40
                    Hover { id: overSwitcher }
                    Row {
                        anchors.centerIn: parent
                        Slot { name: "site.switcher.compact" }
                    }
                    C.ToolTip {
                        visible: overSwitcher.hovered
                        text: t`Shell switcher`
                        // Where it starts, read from the left; a right-to-left page
                        // sets it as far from the right (LayoutMirroring).
                        readonly property real startX: 46
                        x: App.layoutDirection === Direction.RightToLeft ? switcherSpot.width - width - startX : startX
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
                        edge: Edge.Right
                        padding: 8
                        contentItem: Row {
                            Slot { name: "site.preferences" }
                        }
                    }
                }
            }
        }
        Rectangle {
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: parent.width - 1
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
            width: 1
            height: parent.height
            fill: look.divider
        }
    }

    // The explorer: the site's QML and its pages, as a workspace's files.
    Rectangle {
        id: explorer
        // Under a phone's menu it is out of Tab's way, as what a
        // sheet covers is: the keys go through the menu.
        enabled: !shell.menuOpen
        readonly property bool shown: shell.wide ? shell.explorerOpen : shell.view === 0
        visible: shown
        // Where it starts, read from the left; a right-to-left page
        // sets it as far from the right (LayoutMirroring).
        readonly property real startX: shell.wide ? activity.width : 0
        x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
        y: titleBar.height
        width: !shown ? 0 : shell.wide ? 240 : shell.width
        height: (shell.wide ? statusBar.y : views.y) - y
        fill: look.surface
        Accessible.role: Accessible.ComplementaryContent
        Accessible.name: t`Explorer`

        Text {
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: 16
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
            height: 32
            verticalAlignment: Text.AlignVCenter
            text: t`Workspace: ljos.dev`
            color: look.muted
            font.family: look.sans
            font.size: 11
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
                    host: shell
                    colours: look
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
                        required property L.ShellFile modelData
                        host: shell
                        colours: look
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
                    host: shell
                    colours: look
                    folder: true
                    label: t`Site/`
                    open: shell.isOpen("Site/", true)
                    onPressed: shell.fold("Site/", !open)
                }
                Repeater {
                    model: siteFolder.open ? ["/", "/demos/", "/showcase/", "/review/"] : []
                    Entry {
                        required property string modelData
                        host: shell
                        colours: look
                        depth: 1
                        icon: "code"
                        label: shell.router !== undefined && L.given(shell.router) ? shell.router.fileOf(modelData) : ""
                        to: modelData
                        current: shell.route === modelData
                    }
                }
                Entry {
                    id: demosFolder
                    host: shell
                    colours: look
                    folder: true
                    label: t`Demos/`
                    open: shell.isOpen("Demos/", true)
                    onPressed: shell.fold("Demos/", !open)
                }
                Repeater {
                    model: demosFolder.open && shell.router !== undefined && L.given(shell.router) ? shell.router.demos : []
                    Entry {
                        required property L.Demo modelData
                        host: shell
                        colours: look
                        depth: 1
                        icon: "code"
                        label: modelData.app
                        to: modelData.route
                        current: shell.route === modelData.route
                    }
                }
                Repeater {
                    model: shell.router !== undefined && L.given(shell.router) ? shell.router.docs : []
                    Column {
                        id: section
                        required property L.Section modelData
                        readonly property string folderName: modelData.label + "/"
                        // A section starts shut unless the page shown is in it.
                        readonly property bool open: shell.isOpen(folderName, modelData.pages.some((one) => one.route === shell.route))
                        width: tree.width

                        Entry {
                            host: shell
                            colours: look
                            folder: true
                            label: section.folderName
                            open: section.open
                            onPressed: shell.fold(section.folderName, !section.open)
                        }
                        Repeater {
                            model: section.open ? section.modelData.pages : []
                            Entry {
                                required property L.Page modelData
                                host: shell
                                colours: look
                                depth: 1
                                icon: "file-text"
                                label: shell.router !== undefined && L.given(shell.router) ? shell.router.fileOf(modelData.route) : ""
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
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: parent.width - 1
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
            width: 1
            height: parent.height
            fill: look.divider
        }
    }

    // The open files, as tabs, the page under them and the panel under
    // that.
    Item {
        id: centre
        // Under a phone's menu it is out of Tab's way, as what a
        // sheet covers is: the keys go through the menu.
        enabled: !shell.menuOpen
        readonly property bool shown: shell.wide || shell.view === 1
        visible: shown
        // Where it starts, read from the left; a right-to-left page
        // sets it as far from the right (LayoutMirroring).
        readonly property real startX: shell.wide ? explorer.startX + explorer.width : 0
        x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
        y: titleBar.height
        width: !shell.wide ? shell.width : (inspector.shown ? inspector.startX : shell.width) - startX
        height: (shell.wide ? panel.y : views.y) - y

        Rectangle {
            id: strip
            visible: shell.wide
            width: parent.width
            height: shell.wide ? 35 : 0
            fill: look.surface
            // A landmark of its own beside the page's main one.
            Accessible.role: Accessible.Section
            Accessible.name: t`Editor`

            Flickable {
                width: parent.width - (inspector.shown ? 0 : 44)
                // The room it leaves is on the expand control's side, the left on a right-to-left page.
                x: (App.layoutDirection === Direction.RightToLeft) && !inspector.shown ? 44 : 0
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
                                required property string modelData
                                colours: look
                                width: 176
                                mono: true
                                closable: shell.opened.length > 1
                                icon: modelData.startsWith("/start/") || shell.router !== undefined && L.given(shell.router) && shell.router.docsRoute && modelData === shell.route ? "file-text" : "code"
                                label: shell.router !== undefined && L.given(shell.router) ? shell.router.fileOf(modelData) : modelData
                                current: modelData === shell.route
                                onPressed: if (modelData !== shell.route) shell.site.router.go(modelData)
                            }
                        }
                    }
                    // Each tab's close, beside the tab and not in the list
                    // of them, which holds tabs alone.
                    Repeater {
                        model: shell.opened.length > 1 ? shell.opened : []
                        C.Button {
                            required property int index
                            required property string modelData
                            // Where it starts, read from the left; a right-to-left page
                            // sets it as far from the right (LayoutMirroring).
                            readonly property real startX: index * 176 + 176 - width - 4
                            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
                            y: (35 - height) / 2
                            width: 26
                            height: 26
                            subtle: true
                            iconName: "x"
                            display: C.Button.IconOnly
                            text: t`Close ${shell.router !== undefined && L.given(shell.router) ? shell.router.fileOf(modelData) : modelData}`
                            onClicked: shell.site.close(index)
                        }
                    }
                }
            }
            Tool {
                visible: !inspector.shown
                // Where it starts, read from the left; a right-to-left page
                // sets it as far from the right (LayoutMirroring).
                readonly property real startX: parent.width - width - 2
                x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
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
                fill: look.divider
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
        // Under a phone's menu it is out of Tab's way, as what a
        // sheet covers is: the keys go through the menu.
        enabled: !shell.menuOpen
        readonly property bool shown: shell.wide ? shell.inspectorOpen : shell.view === 2
        visible: shown
        // Where it starts, read from the left; a right-to-left page
        // sets it as far from the right (LayoutMirroring).
        readonly property real startX: shell.wide ? shell.width - width : 0
        x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
        y: titleBar.height
        width: !shown ? 0 : shell.wide ? Math.round(Math.min(420, Math.max(340, shell.width * 0.25))) : shell.width
        height: (shell.wide ? statusBar.y : views.y) - y
        fill: look.surface
        Accessible.role: Accessible.ComplementaryContent
        Accessible.name: t`Inspector`

        Rectangle {
            visible: shell.wide
            width: 1
            height: parent.height
            fill: look.divider
        }
        // Its one view, named as a tab would be, at a tab's height.
        Item {
            id: inspectorHead
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: 1
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
            width: parent.width - 1 - (shell.wide ? collapse.width + 4 : 0)
            height: shell.wide ? 36 : 52
            Text {
                // Where it starts, read from the left; a right-to-left page
                // sets it as far from the right (LayoutMirroring).
                readonly property real startX: 16
                x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
                anchors.verticalCenter: parent.verticalCenter
                text: t({ message: "Source", context: "panel" })
                color: look.muted
                font.family: look.sans
                font.size: 12
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
                fill: look.divider
            }
        }
        Tool {
            id: collapse
            visible: shell.wide
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: parent.width - width - 4
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
            y: (inspectorHead.height - height) / 2
            width: 32
            height: 32
            iconName: "chevron-right"
            text: t`Collapse inspector`
            onClicked: shell.inspectorOpen = false
        }
        // This shell's own QML, edited in place.
        Item {
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: 1
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
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
        // Under a phone's menu it is out of Tab's way, as what a
        // sheet covers is: the keys go through the menu.
        enabled: !shell.menuOpen
        readonly property bool shown: shell.wide || shell.view === 3
        visible: shown
        // Where it starts, read from the left; a right-to-left page
        // sets it as far from the right (LayoutMirroring).
        readonly property real startX: shell.wide ? centre.startX : 0
        x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
        y: shell.wide ? statusBar.y - height : titleBar.height
        width: shell.wide ? centre.width : shell.width
        height: shell.wide ? Math.min(180, Math.round(shell.height * 0.24)) : views.y - y
        fill: look.surface
        Accessible.role: Accessible.Section
        Accessible.name: t`Bottom panel`

        Rectangle {
            width: parent.width
            height: 1
            fill: look.divider
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
                    required property string modelData
                    required property int index
                    colours: look
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
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: 12
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
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
                    font.size: look.ui
                    wrap: Text.Wrap
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
                                id: problem
                                required property L.Problem modelData
                                width: problemList.width
                                height: Math.max(22, said.implicitHeight + 4)
                                Accessible.role: Accessible.ListItem
                                Accessible.name: modelData.text

                                C.Icon {
                                    x: App.layoutDirection === Direction.RightToLeft ? problem.width - width : 0
                                    y: 3
                                    size: 14
                                    name: "circle-x"
                                    color: look.danger
                                    Accessible.ignored: true
                                }
                                Text {
                                    id: said
                                    // Where it starts, read from the left; a right-to-left page
                                    // sets it as far from the right (LayoutMirroring).
                                    readonly property real startX: 22
                                    x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
                                    y: 2
                                    width: parent.width - startX
                                    text: modelData.text
                                    color: look.text
                                    font.family: look.mono
                                    font.size: 12
                                    wrap: Text.Wrap
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
                    // Opposite the Clear button, which changes sides on a right-to-left page.
                    x: App.layoutDirection === Direction.RightToLeft ? parent.width - width : 0
                    text: t`Recorded MCP calls appear here as you step the agent replay.`
                    color: look.muted
                    font.family: look.sans
                    font.size: look.ui
                    wrap: Text.Wrap
                }
                Flickable {
                    visible: shell.calls.length > 0
                    width: parent.width - clear.width - 12
                    // Opposite the Clear button, which changes sides on a right-to-left page.
                    x: App.layoutDirection === Direction.RightToLeft ? parent.width - width : 0
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
                                required property L.Call modelData
                                width: callList.width
                                text: `${modelData.tool}(${modelData.args}) → ${modelData.said}`
                                color: look.text
                                font.family: look.mono
                                font.size: 12
                                wrap: Text.Wrap
                                Accessible.role: Accessible.ListItem
                                Accessible.name: text
                            }
                        }
                    }
                }
                C.Button {
                    id: clear
                    // Where it starts, read from the left; a right-to-left page
                    // sets it as far from the right (LayoutMirroring).
                    readonly property real startX: parent.width - width
                    x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
                    height: shell.wide ? implicitHeight : 44
                    subtle: true
                    iconName: "trash"
                    text: t`Clear log`
                    enabled: shell.calls.length > 0
                    onClicked: if (L.given(shell.site)) shell.site.clearCalls()
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
                    font.size: 12
                }
                Text {
                    visible: shell.renderer !== ""
                    text: t`Renderer: ${shell.renderer}`
                    color: look.text
                    font.family: look.mono
                    font.size: 12
                }
                Text {
                    text: t`Objects: ${shell.alive}`
                    color: look.text
                    font.family: look.mono
                    font.size: 12
                }
            }
        }
    }

    // A phone's panes, one at a time, along the bottom.
    Rectangle {
        id: views
        // Under a phone's menu it is out of Tab's way, as what a
        // sheet covers is: the keys go through the menu.
        enabled: !shell.menuOpen
        visible: !shell.wide
        y: shell.wide ? shell.height : shell.height - height
        width: parent.width
        height: shell.wide ? 0 : 56
        fill: look.surface

        Rectangle {
            width: parent.width
            height: 1
            fill: look.divider
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
                    required property L.Pane modelData
                    required property int index
                    colours: look
                    width: Math.floor(views.width / 4)
                    height: 55
                    stacked: true
                    icon: modelData.icon
                    label: index === 3 && shell.problems.length > 0 ? `${modelData.label} ${shell.problems.length}` : modelData.label
                    current: shell.view === index
                    // Problems is the bottom panel, shown at its Problems
                    // whichever of its tabs it was left on, as it says.
                    onPressed: {
                        shell.view = index;
                        if (index === 3)
                            shell.panelShown = 0;
                    }
                }
            }
        }
    }

    // The status bar: the shell, the page, what is wrong and what runs.
    Rectangle {
        id: statusBar
        // Under a phone's menu it is out of Tab's way, as what a
        // sheet covers is: the keys go through the menu.
        enabled: !shell.menuOpen
        visible: shell.wide
        y: shell.wide ? shell.height - height : shell.height
        width: parent.width
        height: shell.wide ? 24 : 0
        fill: look.surface
        Accessible.role: Accessible.StatusBar
        Accessible.name: t`Status bar`

        Rectangle {
            width: parent.width
            height: 1
            fill: look.divider
        }
        Row {
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: 12
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
            anchors.verticalCenter: parent.verticalCenter
            spacing: 18

            Text {
                text: t`Shell: Workbench`
                color: look.text
                font.family: look.sans
                font.size: look.ui
            }
            Text {
                text: t`Route: ${shell.route}`
                color: look.muted
                font.family: look.mono
                font.size: look.ui
            }
            Text {
                text: t`Diagnostics: ${shell.problems.length}`
                color: shell.problems.length > 0 ? look.danger : look.muted
                font.family: look.sans
                font.size: look.ui
            }
        }
        Row {
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: parent.width - width - 12
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
            anchors.verticalCenter: parent.verticalCenter
            spacing: 18

            Text {
                text: t`Objects: ${shell.alive}`
                color: look.muted
                font.family: look.sans
                font.size: look.ui
            }
            Text {
                visible: shell.renderer !== ""
                text: t`Renderer: ${shell.renderer}`
                color: look.muted
                font.family: look.sans
                font.size: look.ui
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
        fill: look.canvas
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
                // Where it starts, read from the left; a right-to-left page
                // sets it as far from the right (LayoutMirroring).
                readonly property real startX: 16
                x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
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
                    fill: look.divider
                }
                Column {
                    width: parent.width
                    Slot { name: "site.docs.inline" }
                }
            }
        }
    }
}
