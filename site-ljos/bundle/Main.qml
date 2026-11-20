import QtQuick
import Site
import "nav.js" as Nav

// The shell of ljos.dev: a header (the name, where to go, search, the
// source, light and dark), the docs' sidebar, the page, what is on it,
// and a footer under the page. Which page it shows is the `route` the
// build prerendered it for (`/`, `/demos/`, or a docs route); each route
// is its own page of HTML, and a link is a navigation to it. The page a
// reader without script gets is this same shell, as the build wrote it,
// at a phone's width or a desktop's and in light or dark, whichever is
// theirs.
//
// Wide (Theme.wideFrom and up), the docs have their sidebar and, from
// Theme.tocFrom, what is on the page beside them. Narrow, both are in
// the menu the header opens, with search.
Rectangle {
    id: shell

    property string route: "/"

    // The page is the window this shell stands in, on the web as on
    // a desktop: the shell fills what it is shown in. Bound, not
    // anchored: an anchor to the view an entry is mounted in is
    // settled as the shell is made, before that parent stands, and
    // a prerender would write the shell at no size at all.
    width: parent ? parent.width : 1440
    height: parent ? parent.height : 900
    color: Theme.canvas

    readonly property bool wide: width >= Theme.wideFrom
    // The demos page and each demo's own page under it.
    readonly property bool demosRoute: route.startsWith("/demos/")
    readonly property bool docsRoute: route !== "/" && !demosRoute
    // The pro demo this route is the page of (Demos/pro.json), or null.
    readonly property var pro: Content.pro.find((demo) => demo.route === route) ?? null
    readonly property bool sidebarShown: wide && docsRoute
    // How much of the right the Observer a stage opened is docked over
    // (Site/ObserverDock.qml): the page gives it the room, and what is on
    // the page goes, so the app the reader clicks in stays beside it.
    readonly property int docked: observerDock.open && !observerDock.sheet ? observerDock.panelWidth : 0
    readonly property bool tocShown: sidebarShown && docked === 0 && width >= Theme.tocFrom && page !== null && page.headings.length > 0
    readonly property int gutter: wide ? Theme.gutterWide : Theme.gutterCompact
    property bool menuOpen: false

    // A docs page's own reading (its title, headings and blocks), in
    // the props the build made this route with: each page's HTML
    // carries its own, so no page loads another page's text.
    property var page: null

    // A link within the site, as `Nav.at` writes it: a heading on this
    // page is landed on without leaving it; anything else is gone to
    // (`Nav.go`).
    function follow(href) {
        var hash = href.indexOf("#");
        var to = hash >= 0 ? href.slice(0, hash) : href;
        if (hash >= 0 && shell.docsRoute && (to === "" || to === Nav.at(Content.base, shell.route))) {
            shell.menuOpen = false;
            docItem.scrollToAnchor(href.slice(hash + 1));
            return;
        }
        Nav.go(href);
    }

    // A route of the site's, shown in place (Nav.follow), with its
    // page's reading (null for the front page and the demos): at
    // `offset` when going back or forward to it, else at its
    // fragment, else at the top, as a page the browser loads.
    function show(to, fragment, offset, reading) {
        shell.page = reading;
        if (to !== shell.route)
            shell.route = to;
        if (typeof offset === "number") {
            // Once the page shown is laid out, so it is as tall as it was.
            Qt.callLater(() => pageScroll.contentY = Math.max(0, Math.min(offset, pageScroll.contentHeight - pageScroll.height)));
        } else if (fragment) {
            // A heading's name as the page has it: an address carries
            // what is not ASCII in it percent-encoded.
            var anchor = fragment.slice(1);
            try {
                anchor = decodeURIComponent(anchor);
            } catch (error) {}
            Qt.callLater(() => docItem.scrollToAnchor(anchor));
        } else {
            pageScroll.contentY = 0;
        }
    }
    Component.onCompleted: Nav.follow(Content.base, {
        title: (to) => Nav.titled(Content.titles, Content.sidebar, Content.after, to),
        // A docs page's reading stands beside its HTML (the build's
        // page.json); the front page and the demos need none.
        reading: (to) => to === "/" || to.startsWith("/demos/") ? null : Nav.at(Content.base, to) + "page.json",
        page: () => shell.page,
        show: (to, fragment, offset, reading) => shell.show(to, fragment, offset, reading),
        offset: () => pageScroll.contentY
    })

    // Named, never made: this page is built with Qt Quick Controls,
    // so a live block's compiler may be given them (A15).
    Component {
        ControlsHost {}
    }

    Keys.onEscapePressed: shell.menuOpen = false

    // The header. Each part of the shell is a landmark, so a reader
    // goes to the page, the docs or the menu as a sighted one looks.
    Rectangle {
        id: header
        z: 3
        Accessible.role: Accessible.Section
        Accessible.name: "Ljós"
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        height: Theme.headerHeight
        color: Theme.canvas

        Rectangle {
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            height: 1
            color: Theme.divider
        }

        Row {
            x: shell.gutter
            anchors.verticalCenter: parent.verticalCenter
            spacing: Theme.l

            // The name, a link to the front page: one link, the mark
            // and the word in it, named for where it goes.
            Item {
                id: home

                readonly property string href: Nav.at(Content.base, "/")

                width: mark.width + Theme.xs + wordmark.implicitWidth
                height: 40
                activeFocusOnTab: true
                Accessible.role: Accessible.Link
                Accessible.name: "Ljós — front page"
                Accessible.onPressAction: () => Nav.go(home.href)
                Keys.onPressed: (event) => {
                    if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                        Nav.go(home.href);
                        event.accepted = true;
                    }
                }

                // The mark is in the page as written, so it stands
                // before the page runs and where it never does
                // (Nav.picture): the site's icon, the same file.
                Text {
                    id: mark
                    width: 28
                    height: 28
                    anchors.verticalCenter: parent.verticalCenter
                    textFormat: Text.RichText
                    text: Nav.picture(shell.route, "/favicon.svg", 28, 28, "")
                    Accessible.ignored: true
                }
                Text {
                    id: wordmark
                    x: mark.width + Theme.xs
                    anchors.verticalCenter: parent.verticalCenter
                    text: "Ljós"
                    color: Theme.text
                    font.family: Theme.sans
                    font.pixelSize: 22
                    font.weight: Font.Bold
                }
                MouseArea {
                    anchors.fill: parent
                    Accessible.ignored: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: Nav.go(home.href)
                }
            }
            NavLink {
                visible: shell.wide
                anchors.verticalCenter: parent.verticalCenter
                label: "Docs"
                to: "/start/"
                current: shell.docsRoute
            }
            NavLink {
                visible: shell.wide
                anchors.verticalCenter: parent.verticalCenter
                label: "Demos"
                to: "/demos/"
                current: shell.demosRoute
            }
        }

        Row {
            anchors.right: parent.right
            anchors.rightMargin: shell.gutter - (shell.wide ? 0 : Theme.xs)
            anchors.verticalCenter: parent.verticalCenter
            spacing: shell.wide ? Theme.m : Theme.xxs

            Search {
                visible: shell.wide
                width: 280
                height: 40
                onPicked: (href) => shell.follow(href)
            }
            NavLink {
                visible: shell.wide
                anchors.verticalCenter: parent.verticalCenter
                label: "GitHub"
                to: "https://github.com/hal-c2/ljos-ui"
            }
            MotionToggle {}
            ThemeToggle {}
            MenuButton {
                visible: !shell.wide
                open: shell.menuOpen
                onPressed: shell.menuOpen = !shell.menuOpen
            }
        }
    }

    // The sidebar: the docs, in the order their front matter puts
    // them, the reader's page the strong one.
    Flickable {
        id: sidebarScroll
        acceptedButtons: Qt.NoButton
        visible: shell.sidebarShown
        Accessible.role: Accessible.ComplementaryContent
        Accessible.name: "The docs"
        anchors.left: parent.left
        anchors.top: header.bottom
        anchors.bottom: parent.bottom
        width: Theme.sidebarWidth
        contentWidth: width
        contentHeight: sidebar.implicitHeight + Theme.xxl
        clip: true

        DocsMap {
            id: sidebar
            x: shell.gutter
            y: Theme.l
            width: Theme.sidebarWidth - shell.gutter - Theme.m
            route: shell.route
        }
    }
    Rectangle {
        visible: shell.sidebarShown
        anchors.left: sidebarScroll.right
        anchors.top: header.bottom
        anchors.bottom: parent.bottom
        width: 1
        color: Theme.divider
    }

    // The page itself, and the footer under it.
    Flickable {
        id: pageScroll
        // A web page: the wheel, the scrollbar, a finger and the keys
        // scroll it, a mouse drag does not. A drag that starts in a
        // live example is the example's (an orbit, a slider, a drop),
        // never the page's (SITE-4 H (d)).
        acceptedButtons: Qt.NoButton
        anchors.left: shell.sidebarShown ? sidebarScroll.right : parent.left
        anchors.leftMargin: shell.sidebarShown ? 1 : 0
        anchors.right: shell.tocShown ? tocScroll.left : parent.right
        anchors.rightMargin: shell.tocShown ? 0 : shell.docked
        anchors.top: header.bottom
        anchors.bottom: parent.bottom
        contentWidth: width
        contentHeight: column.height
        clip: true
        // Where the reader leaves the page is kept once it is still.
        onContentYChanged: {
            keeping.restart();
            Running.moved();
        }
        // What runs on the page runs only in the band of it the reader
        // sees (Running): told where that is, and told again whenever
        // the view or the page under it moves.
        function view() {
            Running.viewTop = pageScroll.y;
            Running.viewBottom = pageScroll.y + pageScroll.height;
            Running.moved();
        }
        onYChanged: view()
        onHeightChanged: view()
        onContentHeightChanged: Running.moved()
        Component.onCompleted: view()
        Timer {
            id: keeping
            interval: 250
            onTriggered: Nav.keep()
        }

        readonly property int measure: shell.docsRoute ? Theme.measure : Theme.pageWidth

        Column {
            id: column
            width: pageScroll.width

            Item {
                width: 1
                height: shell.wide ? Theme.xxl : Theme.xl
            }

            // Only this route's page is made, so the HTML the build
            // writes for a route holds that page and no other. The
            // landing and demos pages load by route; a docs page
            // stands here directly, its page bound as it is made, so
            // a prerender — which writes the page as it first stands —
            // holds it whole.
            Loader {
                id: pageLoader
                visible: !shell.docsRoute
                Accessible.role: Accessible.Section
                Accessible.name: shell.route === "/demos/" ? "Live demos" : shell.pro ? shell.pro.title : "Home"
                active: !shell.docsRoute
                width: Math.min(pageScroll.measure, pageScroll.width - 2 * shell.gutter)
                x: Math.round((pageScroll.width - width) / 2)
                sourceComponent: shell.route === "/" ? landingPage : shell.route === "/demos/" ? demosPage : shell.pro ? proPage : emptyPage
            }
            DocPage {
                id: docItem
                visible: shell.docsRoute
                Accessible.role: Accessible.Section
                Accessible.name: docItem.page ? docItem.page.title : ""
                width: Math.min(pageScroll.measure, pageScroll.width - 2 * shell.gutter)
                x: Math.round((pageScroll.width - width) / 2)
                route: shell.docsRoute ? shell.route : ""
                page: shell.page
                scroller: pageScroll
                onFollowed: (href) => shell.follow(href)
            }

            Item {
                width: 1
                height: Theme.xxxl
            }
            Footer {
                width: pageScroll.width
                route: shell.route
                gutter: shell.gutter
                measure: pageScroll.measure
            }
        }
    }

    Component {
        id: landingPage
        Landing {
            scroller: pageScroll
            wide: shell.wide
        }
    }
    Component {
        id: demosPage
        DemosPage {
            scroller: pageScroll
            wide: shell.wide
        }
    }
    Component {
        id: proPage
        ProDemoPage {
            demo: shell.pro
            scroller: pageScroll
            wide: shell.wide
        }
    }
    Component {
        id: emptyPage
        Item {}
    }

    // On this page: the headings of the page being read, each a link
    // that lands on it without leaving the page.
    Flickable {
        id: tocScroll
        acceptedButtons: Qt.NoButton
        visible: shell.tocShown
        Accessible.role: Accessible.ComplementaryContent
        Accessible.name: "On this page"
        anchors.right: parent.right
        anchors.top: header.bottom
        anchors.bottom: parent.bottom
        width: Theme.tocWidth
        contentWidth: width
        contentHeight: toc.implicitHeight + Theme.xxl
        clip: true

        Column {
            id: toc
            x: Theme.l
            y: Theme.xxl
            width: Theme.tocWidth - Theme.l - shell.gutter
            spacing: Theme.xs

            Text {
                text: "On this page"
                color: Theme.textMuted
                font.family: Theme.sans
                font.pixelSize: Theme.captionSize
                font.weight: Font.DemiBold
                lineHeightMode: Text.FixedHeight
                lineHeight: Theme.captionLine
            }
            Repeater {
                model: shell.tocShown ? shell.page.headings : []

                Text {
                    required property var modelData
                    // The heading's own address, so it can be kept or
                    // opened apart; a press lands on it in place.
                    property string href: Nav.at(Content.base, shell.route) + "#" + modelData.anchor

                    x: modelData.level > 2 ? Theme.s : 0
                    width: toc.width - x
                    textFormat: Text.RichText
                    text: Nav.anchor("#" + modelData.anchor, modelData.plain, hoveredLink !== "")
                    color: Theme.textMuted
                    linkColor: Theme.textMuted
                    font.family: Theme.sans
                    font.pixelSize: Theme.captionSize + 1
                    lineHeightMode: Text.FixedHeight
                    lineHeight: Theme.captionLine
                    wrapMode: Text.Wrap
                    onLinkActivated: (to) => docItem.scrollToAnchor(modelData.anchor)
                }
            }
        }
    }

    // The narrow layout's menu: search, where to go, and the docs.
    Rectangle {
        id: menu
        z: 2
        Accessible.role: Accessible.Section
        Accessible.name: "Menu"
        anchors.left: parent.left
        anchors.right: parent.right
        y: header.height + (shell.menuOpen ? 0 : -Theme.travel)
        height: parent.height - header.height
        visible: !shell.wide && opacity > 0
        opacity: shell.menuOpen ? 1 : 0
        color: Theme.canvas
        Behavior on opacity {
            NumberAnimation {
                duration: shell.menuOpen ? Theme.enterPanel : Theme.exitSmall
                easing.type: Easing.OutCubic
            }
        }
        Behavior on y {
            NumberAnimation {
                duration: shell.menuOpen ? Theme.enterPanel : Theme.exitSmall
                easing.type: Easing.OutCubic
            }
        }

        Flickable {
            anchors.fill: parent
            contentWidth: width
            contentHeight: menuColumn.implicitHeight + Theme.xxl
            clip: true

            Column {
                id: menuColumn
                x: shell.gutter
                y: Theme.l
                width: parent.width - 2 * shell.gutter
                spacing: Theme.l

                Search {
                    z: 2
                    width: parent.width
                    height: 44
                    onPicked: (href) => shell.follow(href)
                }
                Column {
                    width: parent.width
                    spacing: Theme.s

                    NavLink {
                        label: "Docs"
                        to: "/start/"
                        current: shell.docsRoute
                        size: Theme.subtitleSize
                        line: Theme.subtitleLine
                    }
                    NavLink {
                        label: "Demos"
                        to: "/demos/"
                        current: shell.demosRoute
                        size: Theme.subtitleSize
                        line: Theme.subtitleLine
                    }
                    NavLink {
                        label: "GitHub"
                        to: "https://github.com/hal-c2/ljos-ui"
                        size: Theme.subtitleSize
                        line: Theme.subtitleLine
                    }
                }
                // On this page, as the wide layout has it beside the
                // page: each heading, landed on from here.
                Column {
                    visible: shell.docsRoute && shell.page !== null && shell.page.headings.length > 0
                    width: parent.width
                    spacing: Theme.xs
                    Accessible.role: Accessible.Section
                    Accessible.name: "On this page"

                    Rectangle {
                        width: parent.width
                        height: 1
                        color: Theme.divider
                    }
                    Text {
                        topPadding: Theme.s
                        text: "On this page"
                        color: Theme.textMuted
                        font.family: Theme.sans
                        font.pixelSize: Theme.captionSize
                        font.weight: Font.DemiBold
                        lineHeightMode: Text.FixedHeight
                        lineHeight: Theme.captionLine
                    }
                    Repeater {
                        model: !shell.wide && shell.docsRoute && shell.page !== null ? shell.page.headings : []

                        Text {
                            required property var modelData

                            x: modelData.level > 2 ? Theme.m : 0
                            width: parent.width - x
                            textFormat: Text.RichText
                            text: Nav.anchor("#" + modelData.anchor, modelData.plain, hoveredLink !== "")
                            color: Theme.textMuted
                            linkColor: Theme.textMuted
                            font.family: Theme.sans
                            font.pixelSize: Theme.bodySize
                            lineHeightMode: Text.FixedHeight
                            lineHeight: Theme.bodyLine
                            wrapMode: Text.Wrap
                            onLinkActivated: (to) => shell.follow("#" + modelData.anchor)
                        }
                    }
                }
                Rectangle {
                    width: parent.width
                    height: 1
                    color: Theme.divider
                }
                DocsMap {
                    width: parent.width
                    route: shell.route
                }
            }
        }
    }

    ObserverDock {
        id: observerDock
        z: 4
        anchors.left: parent.left
        anchors.top: header.bottom
        room: parent.width
        roomHeight: parent.height - header.height
        // The sidebar and the line after it.
        beside: shell.sidebarShown ? Theme.sidebarWidth + 1 : 0
    }
}
