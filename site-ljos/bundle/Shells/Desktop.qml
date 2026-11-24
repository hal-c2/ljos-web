import Ljos.Ui
import Ljos.Core
import Ljos.Layout
import Ljos.Blocks
import Ljos.Controls as C

// The site as a desktop app: a menu bar whose menus do what they say
// (open a page, change the scheme, the motion and the shell), a toolbar
// whose buttons say what they do, every page in a sidebar, the pages the
// reader opened as document tabs, and a status bar with the page, how
// long it took to come alive, how many objects are alive in it and what
// draws it.
//
// Its parts are places (Slots) the site puts its pieces in by name, as
// the Elegant shell's are: `site.page` is the very page another shell
// showed, still where the reader was on it. The pages open are the
// site's (`site.opened`), so another shell that shows them shows the same.
Rectangle {
    id: shell
    objectName: "desktopShell"

    property unknown site: null
    readonly property unknown router: site ? site.router : null
    readonly property unknown preferences: site ? site.preferences : null
    readonly property bool wide: site ? site.preferences.wide : width >= 1000
    readonly property bool menuOpen: site ? site.menuOpen && !wide : false
    readonly property bool calm: site ? site.preferences.calm : false
    readonly property string route: router ? router.route : "/"
    // A page other than the docs is this wide at most here.
    readonly property int pageWidest: 1040

    readonly property unknown opened: site ? site.opened : [route]
    readonly property int hydratedMs: site ? site.hydratedIn : -1
    readonly property int alive: site ? site.alive : 0
    readonly property string renderer: site ? site.renderer : ""
    readonly property bool dark: site ? site.theme.dark : false
    readonly property string metricsRoute: "/benchmarks/"
    readonly property bool hasMetrics: router !== null && router.nameOf(metricsRoute) !== metricsRoute

    property bool sidebarOpen: true
    // On a phone, the one pane shown: the page, the pages or those open.
    property int view: 0
    // The menu bar's title whose menu is open: the pointer over another
    // title then opens that one, as a desktop's menu bar does.
    property Item openTitle: null
    // The arrows go along the menu bar as along a desktop's, round from
    // the last title to the first; a menu open moves with them.
    function besideTitle(from, step) {
        var titles = Array.from(from.parent.children).filter((one) => one.menu !== undefined && one.visible);
        var to = titles[(titles.indexOf(from) + step + titles.length) % titles.length];
        var wasOpen = from.open;
        if (wasOpen)
            from.menu.close();
        to.forceActiveFocus();
        if (wasOpen)
            to.menu.open();
    }

    function go(to) {
        // The page already shown keeps its route, so on a phone its pane is shown here.
        if (!shell.wide && to === shell.route)
            shell.view = 0;
        if (shell.router)
            shell.router.go(to);
    }

    onRouteChanged: if (!shell.wide) shell.view = 0
    onSiteChanged: if (site) site.measureRenderer()
    Component.onCompleted: if (site) site.measureRenderer()

    Object {
        id: look
        readonly property unknown theme: shell.site ? shell.site.theme : null
        readonly property color canvas: theme ? theme.canvas : C.Theme.canvas
        readonly property color surface: theme ? theme.surface : C.Theme.surface
        readonly property color raised: theme ? theme.surfaceRaised : C.Theme.surface
        readonly property color hover: theme ? theme.surfaceHover : C.Theme.surface
        readonly property color pressed: theme ? theme.surfacePressed : C.Theme.surface
        readonly property color selected: theme ? theme.surfaceSelected : C.Theme.surface
        readonly property color divider: theme ? theme.divider : C.Theme.border
        readonly property color accent: theme ? theme.accent : C.Theme.text
        readonly property color focus: theme ? theme.focusRing : C.Theme.text
        readonly property color text: theme ? theme.text : C.Theme.text
        readonly property color muted: theme ? theme.textMuted : C.Theme.textMuted
        readonly property string sans: theme ? theme.sans : ""
        readonly property string mono: theme ? theme.mono : "monospace"
        // A desktop app's words: 13 px.
        readonly property int ui: 13
    }

    width: parent ? parent.width : 1440
    height: parent ? parent.height : 900
    fill: look.canvas

    // A title of the menu bar, and the menu it opens.
    component MenuTitle: Rectangle {
        id: title
        property string label: ""
        property unknown menu: null
        readonly property bool open: menu !== null && menu.opened

        function toggle() {
            if (title.open)
                title.menu.close();
            else
                title.menu.open();
        }

        width: words.implicitWidth + 20
        height: 26
        radius: 4
        fill: open ? look.pressed : area.containsMouse ? look.hover : "transparent"
        border.color: activeFocus ? look.focus : "transparent"
        border.width: 1
        activeFocusOnTab: true
        Accessible.role: Accessible.MenuItem
        Accessible.name: label
        Accessible.onPressAction: () => title.toggle()
        Keys.onPressed: (event) => {
            if (event.key === Key.Return || event.key === Key.Enter || event.key === Key.Space || event.key === Key.Down) {
                title.toggle();
                event.accepted = true;
            } else if (event.key === Key.Left || event.key === Key.Right) {
                shell.besideTitle(title, event.key === Key.Right ? 1 : -1);
                event.accepted = true;
            }
        }
        Connections {
            target: title.menu
            function onOpened() { shell.openTitle = title; }
            function onClosed() { if (shell.openTitle === title) shell.openTitle = null; }
        }

        Text {
            id: words
            anchors.centerIn: parent
            text: title.label
            color: look.text
            font.family: look.sans
            font.size: look.ui
            Accessible.ignored: true
        }
        PointerArea {
            id: area
            anchors.fill: parent
            hoverEnabled: true
            Accessible.ignored: true
            onClicked: title.toggle()
            onEntered: {
                if (shell.openTitle !== null && shell.openTitle !== title) {
                    shell.openTitle.menu.close();
                    title.menu.open();
                }
            }
        }
    }

    // A button of the toolbar, and what it does in a tip under it.
    component Tool: C.Button {
        id: tool
        property string tip: text
        subtle: true
        display: C.Button.IconOnly
        width: 32
        height: 32
        Hover { id: over }
        C.ToolTip {
            visible: over.hovered
            text: tool.tip
            x: Math.max(0, (tool.width - implicitWidth) / 2)
            y: tool.height + 6
        }
    }

    // A row of the sidebar: a page (a link, current while it is shown)
    // or a shell to show (a button, pressed while it is shown).
    component Entry: Item {
        id: entry
        property string label: ""
        property string icon: "file-text"
        property string to: ""
        property bool current: false
        readonly property string href: to !== "" && shell.router ? shell.router.address(to) : ""
        signal pressed

        width: parent ? parent.width : 232
        // Native density where there's a pointer, a finger's size on a phone;
        // a long title takes a second line rather than losing its end.
        height: Math.max(shell.wide ? 26 : 44, words.implicitHeight + 10)
        activeFocusOnTab: true
        Accessible.role: to !== "" ? Accessible.Link : Accessible.Button
        Accessible.name: label
        Accessible.checkable: to === ""
        Accessible.checked: to === "" && current
        Accessible.selected: to !== "" && current
        Accessible.onPressAction: () => entry.press()
        Keys.onPressed: (event) => {
            if (event.key === Key.Return || event.key === Key.Enter || event.key === Key.Space) {
                entry.press();
                event.accepted = true;
            }
        }
        function press() {
            if (to !== "")
                shell.go(to);
            else
                entry.pressed();
        }

        Rectangle {
            x: 6
            width: parent.width - 12
            height: parent.height
            radius: 4
            fill: entry.current ? look.selected : area.containsMouse ? look.hover : "transparent"
            border.color: entry.activeFocus ? look.focus : "transparent"
            border.width: 1
            Accessible.ignored: true
        }
        C.Icon {
            x: 16
            // Beside the first line, where a title takes two.
            y: words.y + (Math.min(words.implicitHeight, words.font.size * 1.4) - height) / 2
            size: 14
            name: entry.icon
            color: entry.current ? look.accent : look.muted
            Accessible.ignored: true
        }
        Text {
            id: words
            x: 38
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width - x - 12
            text: entry.label
            color: look.text
            font.family: look.sans
            font.size: look.ui
            font.weight: entry.current ? Font.DemiBold : Font.Normal
            wrap: Text.WordWrap
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

    // A heading of the sidebar's groups.
    component Group: Text {
        width: parent ? parent.width : 232
        leftPadding: 16
        topPadding: 12
        bottomPadding: 4
        color: look.muted
        font.family: look.sans
        font.size: 11
        font.weight: Font.DemiBold
        font.letterSpacing: 0.4
        Accessible.role: Accessible.Heading
    }

    // A document tab, a phone's view, or a page open in the list of them.
    component Tab: Rectangle {
        id: tab
        property string label: ""
        property string icon: ""
        property bool current: false
        property bool closable: false
        // A phone's bottom bar: the icon over its word, each centred, so
        // a quarter of a phone's width holds the whole word.
        property bool stacked: false
        signal pressed

        fill: current ? look.canvas : area.containsMouse ? look.hover : "transparent"
        activeFocusOnTab: true
        Accessible.role: Accessible.PageTab
        Accessible.name: label
        Accessible.selected: current
        Accessible.onPressAction: () => tab.pressed()
        Keys.onPressed: (event) => {
            if (event.key === Key.Return || event.key === Key.Enter || event.key === Key.Space) {
                tab.pressed();
                event.accepted = true;
            }
        }

        Rectangle {
            visible: tab.current
            width: parent.width
            height: 2
            fill: look.accent
            Accessible.ignored: true
        }
        Rectangle {
            anchors.fill: parent
            fill: "transparent"
            border.color: tab.activeFocus ? look.focus : look.divider
            border.width: tab.activeFocus ? 1 : 0
            Accessible.ignored: true
        }
        Rectangle {
            x: parent.width - 1
            width: 1
            height: parent.height
            fill: look.divider
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
            x: tab.stacked ? 4 : mark.visible ? 32 : 12
            y: tab.stacked ? mark.y + mark.height + 4 : (parent.height - height) / 2
            width: tab.stacked ? parent.width - 8 : parent.width - x - (tab.closable ? (shell.wide ? 32 : 56) : 12)
            align: tab.stacked ? Text.AlignHCenter : Text.AlignLeft
            text: tab.label
            color: tab.current ? look.text : look.muted
            font.family: look.sans
            font.size: look.ui
            elide: Text.ElideRight
        }
        PointerArea {
            id: area
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Cursor.PointingHand
            Accessible.ignored: true
            onClicked: tab.pressed()
        }
    }

    // The header: both bars are one landmark, so a reader finds it by
    // the name it has in every shell. On a phone it is the top alone.
    Item {
        id: header
        z: 4
        width: parent.width
        height: toolBar.y + toolBar.height
        Accessible.role: Accessible.Section
        Accessible.name: "Ljós"

        // The window's top: the name, the menu bar and the page's title; on
        // a phone, the name and the one menu control.
        Rectangle {
            id: top
            z: 4
            width: parent.width
            // As tall as the logo's link, which keeps its size in every
            // shell: the bar makes room for it, not the other way round.
            height: shell.wide ? 40 : 56
            fill: look.surface

            Row {
                x: shell.wide ? 8 : 16
                anchors.verticalCenter: parent.verticalCenter
                spacing: 6

                Row {
                    Layout.alignment: Align.VCenter
                    Slot { name: shell.wide ? "site.brand.small" : "site.brand" }
                }
                Row {
                    id: menuBar
                    visible: shell.wide
                    Layout.alignment: Align.VCenter
                    spacing: 0
                    Accessible.role: Accessible.MenuBar
                    Accessible.name: t`Menu bar`

                    MenuTitle {
                        label: t({ message: "File", context: "menu bar" })
                        menu: fileMenu

                        C.Menu {
                            id: fileMenu
                            y: parent.height + 2

                            C.MenuItem {
                                text: t`Open home`
                                iconName: "house"
                                onTriggered: shell.go("/")
                            }
                            C.MenuItem {
                                text: t`Open demos`
                                iconName: "play"
                                onTriggered: shell.go("/demos/")
                            }
                            C.MenuItem {
                                text: t`Open showcase`
                                iconName: "image"
                                onTriggered: shell.go("/showcase/")
                            }
                            C.MenuItem {
                                visible: shell.hasMetrics
                                height: visible ? implicitHeight : 0
                                text: t`Open benchmarks`
                                iconName: "zap"
                                onTriggered: shell.go(shell.metricsRoute)
                            }
                            C.MenuItem {
                                text: t`Open documentation`
                                iconName: "file-text"
                                onTriggered: shell.go("/start/")
                            }
                            C.MenuSeparator {}
                            C.MenuItem {
                                text: t`View this shell's QML`
                                iconName: "code"
                                onTriggered: shell.site.showSource("desktop")
                            }
                            C.MenuItem {
                                text: t`Reset demo state`
                                iconName: "refresh-cw"
                                onTriggered: shell.site.reload()
                            }
                        }
                    }
                    MenuTitle {
                        label: t({ message: "View", context: "menu bar" })
                        menu: viewMenu

                        C.Menu {
                            id: viewMenu
                            y: parent.height + 2

                            C.MenuItem {
                                text: t`Light colour scheme`
                                checkable: true
                                checked: shell.preferences ? shell.preferences.scheme === "light" : false
                                onTriggered: shell.preferences.setScheme("light")
                            }
                            C.MenuItem {
                                text: t`Dark colour scheme`
                                checkable: true
                                checked: shell.preferences ? shell.preferences.scheme === "dark" : false
                                onTriggered: shell.preferences.setScheme("dark")
                            }
                            C.MenuItem {
                                text: t`Follow system colour scheme`
                                checkable: true
                                checked: shell.preferences ? shell.preferences.scheme === "system" : false
                                onTriggered: shell.preferences.setScheme("system")
                            }
                            C.MenuSeparator {}
                            C.MenuItem {
                                text: t`Reduce motion`
                                checkable: true
                                checked: shell.calm
                                onTriggered: shell.preferences.setCalm(!shell.calm)
                            }
                            C.MenuItem {
                                text: t`Toggle sidebar`
                                checkable: true
                                checked: shell.sidebarOpen
                                onTriggered: shell.sidebarOpen = !shell.sidebarOpen
                            }
                            C.MenuItem {
                                text: t`Toggle Observer panel`
                                checkable: true
                                checked: shell.site ? shell.site.observing : false
                                onTriggered: shell.site.observe()
                            }
                            C.MenuSeparator {}
                            C.MenuItem {
                                text: t`Switch to Elegant shell`
                                onTriggered: shell.preferences.setShell("elegant")
                            }
                            C.MenuItem {
                                text: t`Switch to Cyberpunk shell`
                                onTriggered: shell.preferences.setShell("cyberpunk")
                            }
                            C.MenuItem {
                                text: t`Switch to Workbench shell`
                                onTriggered: shell.preferences.setShell("workbench")
                            }
                            C.MenuItem {
                                text: t`Switch to Desktop shell`
                                enabled: false
                            }
                        }
                    }
                    MenuTitle {
                        label: t({ message: "Go", context: "menu bar" })
                        menu: goMenu

                        C.Menu {
                            id: goMenu
                            y: parent.height + 2

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
                                text: t`Start in a minute`
                                iconName: "zap"
                                onTriggered: shell.go("/start/")
                            }
                            C.MenuSeparator {}
                            Repeater {
                                model: [
                                    { label: t`Capability: descriptive language`, to: "/language/overview/" },
                                    { label: t`Capability: agentic first`, to: "/start/mcp/" },
                                    { label: t`Capability: several renderers`, to: "/ui/offscreen-and-cost/" },
                                    { label: t`Capability: live updates`, to: "/start/hot-reload/" },
                                    { label: t`Capability: tools`, to: "/start/cli/" },
                                    { label: t`Capability: malleable`, to: "/start/your-own-shell/" }
                                ]
                                C.MenuItem {
                                    required property unknown modelData
                                    text: modelData.label
                                    onTriggered: shell.go(modelData.to)
                                }
                            }
                        }
                    }
                    MenuTitle {
                        label: t({ message: "Help", context: "menu bar" })
                        menu: helpMenu

                        C.Menu {
                            id: helpMenu
                            y: parent.height + 2

                            C.MenuItem {
                                text: t`Getting started guide`
                                onTriggered: shell.go("/start/first-app/")
                            }
                            C.MenuItem {
                                text: t`MCP servers for agents`
                                onTriggered: shell.go("/start/mcp/")
                            }
                            C.MenuItem {
                                text: t`Observer guide`
                                onTriggered: shell.go("/start/observe/")
                            }
                            C.MenuItem {
                                text: t`Source on GitHub`
                                iconName: "external-link"
                                onTriggered: shell.go(shell.router.github)
                            }
                            C.MenuSeparator {}
                            C.MenuItem {
                                text: t`About ljos.dev`
                                iconName: "info"
                                onTriggered: about.open()
                            }
                        }
                    }
                }
            }
            // The window's title, as a desktop app's.
            Text {
                visible: shell.wide && shell.width >= 1100
                anchors.centerIn: parent
                width: Math.min(implicitWidth, parent.width - 760)
                text: t`Ljós — ${shell.router ? shell.router.title : ""}`
                color: look.muted
                font.family: look.sans
                font.size: look.ui
                elide: Text.ElideRight
                align: Text.AlignHCenter
            }
            // A phone's one control: the menu.
            Row {
                visible: !shell.wide
                x: parent.width - width - 8
                anchors.verticalCenter: parent.verticalCenter
                Slot { name: "site.menu" }
            }
            Rectangle {
                y: parent.height - 1
                width: parent.width
                height: 1
                fill: look.divider
            }
        }

        // The toolbar.
        Rectangle {
            id: toolBar
            visible: shell.wide
            z: 3
            y: top.height
            width: parent.width
            height: shell.wide ? 42 : 0
            fill: look.surface
            Accessible.role: Accessible.ToolBar
            Accessible.name: t`Toolbar`

            Row {
                x: 8
                anchors.verticalCenter: parent.verticalCenter
                spacing: 2

                Tool {
                    iconName: "arrow-left"
                    text: t`Back`
                    tip: t`Go to previous route`
                    onClicked: shell.site.back()
                }
                Tool {
                    iconName: "arrow-right"
                    text: t`Forward`
                    tip: t`Go to next route`
                    onClicked: shell.site.forward()
                }
                Tool {
                    iconName: "house"
                    text: t`Home`
                    tip: t`Open landing page`
                    onClicked: shell.go("/")
                }
                Rectangle {
                    Layout.alignment: Align.VCenter
                    width: 1
                    height: 20
                    fill: look.divider
                }
                Tool {
                    iconName: "play"
                    text: t`Demos`
                    tip: t`Browse all interactive demos`
                    onClicked: shell.go("/demos/")
                }
                Tool {
                    visible: shell.hasMetrics
                    iconName: "zap"
                    text: t`Benchmarks`
                    tip: t`Open native desktop benchmark tables`
                    onClicked: shell.go(shell.metricsRoute)
                }
                Tool {
                    iconName: "eye"
                    text: t`Observer`
                    tip: t`Toggle live Observer panel`
                    checkable: true
                    checked: shell.site ? shell.site.observing : false
                    onClicked: shell.site.observe()
                }
                Item {
                    width: 10
                    height: 1
                }
                Item {
                    Layout.alignment: Align.VCenter
                    width: Math.max(200, Math.min(420, toolBar.width - 620))
                    height: 30
                    Slot { name: "site.search" }
                }
            }
            Row {
                x: parent.width - width - 10
                anchors.verticalCenter: parent.verticalCenter
                spacing: 2

                // The shell: the site's switcher, as small as the toolbar's
                // buttons are.
                Item {
                    width: switcher.width
                    height: 32
                    Hover { id: overSwitcher }
                    Row {
                        id: switcher
                        anchors.verticalCenter: parent.verticalCenter
                        Slot { name: "site.switcher.compact" }
                    }
                    C.ToolTip {
                        visible: overSwitcher.hovered
                        text: t`Switch between Elegant, Cyberpunk, Workbench, and Desktop shells`
                        x: parent.width - implicitWidth
                        y: 38
                    }
                }
                Tool {
                    iconName: shell.dark ? "sun" : "moon"
                    text: t`Scheme`
                    tip: t`Toggle light and dark colour scheme`
                    onClicked: shell.preferences.setScheme(shell.dark ? "light" : "dark")
                }
                Tool {
                    iconName: "code"
                    text: t`View QML`
                    tip: t`View this shell's QML source`
                    onClicked: shell.site.showSource("desktop")
                }
            }
            Rectangle {
                y: parent.height - 1
                width: parent.width
                height: 1
                fill: look.divider
            }
        }
    }

    // The sidebar: every page, and the shells.
    Rectangle {
        id: sidebar
        readonly property bool shown: shell.wide ? shell.sidebarOpen : shell.view === 1
        visible: shown
        y: toolBar.y + toolBar.height
        width: !shown ? 0 : shell.wide ? 232 : shell.width
        height: (shell.wide ? statusBar.y : views.y) - y
        fill: look.surface
        Accessible.role: Accessible.ComplementaryContent
        Accessible.name: t`Pages`

        Flickable {
            anchors.fill: parent
            contentWidth: width
            contentHeight: pages.implicitHeight + 16
            clip: true

            Column {
                id: pages
                width: parent.width

                Group { text: t`Overview` }
                Entry {
                    icon: "house"
                    label: t`Home`
                    to: "/"
                    current: shell.route === "/"
                }
                Entry {
                    icon: "zap"
                    label: t`Start in a minute`
                    to: "/start/"
                    current: shell.route === "/start/"
                }
                Entry {
                    visible: shell.hasMetrics
                    height: !visible ? 0 : shell.wide ? 26 : 44
                    icon: "clock"
                    label: t`Benchmarks`
                    to: shell.metricsRoute
                    current: shell.route === shell.metricsRoute
                }
                Group { text: t`Demos` }
                Entry {
                    icon: "play"
                    label: t`All demos`
                    to: "/demos/"
                    current: shell.route === "/demos/"
                }
                Repeater {
                    model: shell.router ? shell.router.demos : []
                    Entry {
                        required property unknown modelData
                        icon: "play"
                        label: modelData.title
                        to: modelData.route
                        current: shell.route === modelData.route
                    }
                }
                Group { text: t`Shells` }
                Repeater {
                    model: shell.preferences ? shell.preferences.shells : []
                    Entry {
                        required property unknown modelData
                        icon: "image"
                        label: modelData.label
                        current: shell.preferences.shown === modelData.name
                        onPressed: shell.preferences.setShell(modelData.name)
                    }
                }
                Repeater {
                    model: shell.router ? shell.router.docs : []
                    Column {
                        id: section
                        required property unknown modelData
                        width: pages.width

                        Group { text: section.modelData.label }
                        Repeater {
                            model: section.modelData.pages
                            Entry {
                                required property unknown modelData
                                label: modelData.title
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
            fill: look.divider
        }
    }

    // The pages open, as document tabs (on a phone, as a list of them),
    // and the one shown under them.
    Item {
        id: documents
        readonly property bool listed: !shell.wide && shell.view === 2
        visible: shell.wide || shell.view !== 1
        x: shell.wide ? sidebar.width : 0
        y: toolBar.y + toolBar.height
        width: parent.width - x
        height: (shell.wide ? statusBar.y : views.y) - y

        Rectangle {
            id: strip
            visible: shell.wide || documents.listed
            width: parent.width
            height: !visible ? 0 : shell.wide ? 32 : parent.height
            fill: look.surface
            // A landmark of its own beside the page's main one.
            Accessible.role: Accessible.Section
            Accessible.name: t`Documents`

            Flickable {
                anchors.fill: parent
                contentWidth: shell.wide ? tabs.width : width
                contentHeight: shell.wide ? height : tabs.height
                clip: true

                Item {
                    width: tabs.width
                    height: tabs.height

                    Grid {
                        id: tabs
                        columns: shell.wide ? Math.max(1, shell.opened.length) : 1
                        Accessible.role: Accessible.PageTabList
                        Accessible.name: t`Open pages`

                        Repeater {
                            model: shell.opened
                            Tab {
                                required property unknown modelData
                                width: shell.wide ? 200 : documents.width
                                height: shell.wide ? 32 : 48
                                closable: shell.opened.length > 1
                                icon: modelData === "/" ? "house" : modelData.startsWith("/demos/") ? "play" : modelData === "/showcase/" ? "image" : "file-text"
                                label: shell.router ? shell.router.nameOf(modelData) : modelData
                                current: modelData === shell.route
                                onPressed: modelData !== shell.route ? shell.go(modelData) : (shell.view = 0)
                            }
                        }
                    }
                    // Each tab's close, beside the tab and not in the list
                    // of them, which holds tabs alone.
                    Repeater {
                        model: shell.opened.length > 1 ? shell.opened : []
                        C.Button {
                            required property int index
                            required property unknown modelData
                            x: shell.wide ? index * 200 + 200 - width - 4 : documents.width - width - 8
                            y: shell.wide ? (32 - height) / 2 : index * 48 + (48 - height) / 2
                            width: shell.wide ? 26 : 44
                            height: shell.wide ? 26 : 44
                            subtle: true
                            iconName: "x"
                            display: C.Button.IconOnly
                            text: t`Close ${shell.router ? shell.router.nameOf(modelData) : modelData}`
                            onClicked: shell.site.close(index)
                        }
                    }
                }
            }
            Rectangle {
                visible: shell.wide
                y: parent.height - 1
                width: parent.width
                height: 1
                fill: look.divider
            }
        }
        Item {
            id: page
            visible: shell.wide || shell.view === 0
            y: shell.wide ? strip.height : 0
            width: parent.width
            height: parent.height - y
            Slot { name: "site.page" }
        }
    }

    // A phone's panes, one at a time, along the bottom.
    Rectangle {
        id: views
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
                    { label: t`Page`, icon: "file-text" },
                    { label: t`Pages`, icon: "folder" },
                    { label: t`Open pages`, icon: "copy" }
                ]
                Tab {
                    required property unknown modelData
                    required property int index
                    width: Math.floor(views.width / 3)
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

    // The status bar.
    Rectangle {
        id: statusBar
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
            x: 12
            anchors.verticalCenter: parent.verticalCenter
            spacing: 18

            Text {
                text: t`Route: ${shell.route}`
                color: look.muted
                font.family: look.mono
                font.size: 12
            }
            Text {
                visible: shell.hydratedMs >= 0
                text: t`Hydrated in ${shell.hydratedMs} ms`
                color: look.muted
                font.family: look.sans
                font.size: 12
            }
            Text {
                text: t`Objects alive: ${shell.alive}`
                color: look.muted
                font.family: look.sans
                font.size: 12
            }
        }
        Row {
            x: parent.width - width - 12
            anchors.verticalCenter: parent.verticalCenter
            spacing: 18

            Text {
                visible: shell.renderer !== ""
                text: t`Renderer: ${shell.renderer}`
                color: look.muted
                font.family: look.sans
                font.size: 12
            }
            Text {
                text: t`Shell: Desktop`
                color: look.muted
                font.family: look.sans
                font.size: 12
            }
        }
    }

    // About ljos.dev.
    C.Popup {
        id: about
        modal: true
        focus: true
        width: Math.min(shell.width - 32, 440)
        x: Math.round((shell.width - width) / 2)
        y: Math.round(shell.height * 0.22)
        padding: 20

        contentItem: Column {
            spacing: 12
            Accessible.role: Accessible.Dialog
            Accessible.name: aboutTitle.text

            Text {
                id: aboutTitle
                text: t`About ljos.dev`
                color: look.text
                font.family: look.sans
                font.size: 15
                font.weight: Font.DemiBold
                Accessible.role: Accessible.Heading
            }
            Text {
                width: about.availableWidth
                text: t`This site runs Ljós compiled to Solid DOM with ljos-web, with WebGPU and WebGL2 fallback for 3D scenes. Switch shells from the View menu or toolbar without reloading.`
                color: look.muted
                font.family: look.sans
                font.size: look.ui
                lineHeight: 1.4
                wrap: Text.Wrap
            }
            Item {
                width: about.availableWidth
                height: shut.height
                C.Button {
                    id: shut
                    x: parent.width - width
                    primary: true
                    text: t`Close`
                    onClicked: about.close()
                }
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
        y: top.height + (shell.menuOpen || shell.calm ? 0 : -16)
        height: parent.height - top.height
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
