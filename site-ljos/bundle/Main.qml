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
    readonly property bool docsRoute: route !== "/" && route !== "/demos/"
    readonly property bool sidebarShown: wide && docsRoute
    readonly property bool tocShown: sidebarShown && width >= Theme.tocFrom && page !== null && page.headings.length > 0
    readonly property int gutter: wide ? Theme.gutterWide : Theme.gutterCompact
    property bool menuOpen: false

    readonly property var page: {
        for (var i = 0; i < Content.pages.length; i++) {
            if (Content.pages[i].route === route)
                return Content.pages[i];
        }
        return null;
    }

    // A link within the site: a heading on this page is landed on
    // without leaving it; anything else is a navigation.
    function follow(href) {
        var hash = href.indexOf("#");
        var to = hash >= 0 ? href.slice(0, hash) : href;
        if (hash >= 0 && shell.docsRoute && (to === "" || to === shell.route)) {
            shell.menuOpen = false;
            docItem.scrollToAnchor(href.slice(hash + 1));
            return;
        }
        Nav.go(href);
    }

    // A page opened at one of its headings lands on it.
    Timer {
        interval: 0
        running: Nav.inBrowser() && shell.docsRoute
        onTriggered: {
            var hash = String(globalThis.location.hash || "");
            if (hash.length > 1)
                docItem.scrollToAnchor(decodeURIComponent(hash.slice(1)));
        }
    }

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

            // The name, a link to the front page.
            Item {
                width: mark.width + Theme.xs + wordmark.implicitWidth
                height: 40

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
                    textFormat: Text.RichText
                    text: Nav.anchor("/", "Ljós", false)
                    color: Theme.text
                    linkColor: Theme.text
                    font.family: Theme.sans
                    font.pixelSize: 22
                    font.weight: Font.Bold
                    onLinkActivated: (to) => Nav.go(to)
                }
                MouseArea {
                    width: mark.width
                    height: parent.height
                    Accessible.ignored: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: Nav.go("/")
                }
            }
            NavLink {
                visible: shell.wide
                anchors.verticalCenter: parent.verticalCenter
                label: "Docs"
                href: "/start/"
                current: shell.docsRoute
            }
            NavLink {
                visible: shell.wide
                anchors.verticalCenter: parent.verticalCenter
                label: "Demos"
                href: "/demos/"
                current: shell.route === "/demos/"
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
                href: "https://github.com/hal-c2/ljos-ui"
            }
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
        anchors.left: shell.sidebarShown ? sidebarScroll.right : parent.left
        anchors.leftMargin: shell.sidebarShown ? 1 : 0
        anchors.right: shell.tocShown ? tocScroll.left : parent.right
        anchors.top: header.bottom
        anchors.bottom: parent.bottom
        contentWidth: width
        contentHeight: column.height
        clip: true

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
                Accessible.name: shell.route === "/demos/" ? "Live demos" : "Home"
                active: !shell.docsRoute
                width: Math.min(pageScroll.measure, pageScroll.width - 2 * shell.gutter)
                x: Math.round((pageScroll.width - width) / 2)
                sourceComponent: shell.route === "/" ? landingPage : shell.route === "/demos/" ? demosPage : emptyPage
            }
            DocPage {
                id: docItem
                visible: shell.docsRoute
                Accessible.role: Accessible.Section
                Accessible.name: docItem.page ? docItem.page.title : ""
                width: Math.min(pageScroll.measure, pageScroll.width - 2 * shell.gutter)
                x: Math.round((pageScroll.width - width) / 2)
                route: shell.docsRoute ? shell.route : ""
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
        id: emptyPage
        Item {}
    }

    // On this page: the headings of the page being read, each a link
    // that lands on it without leaving the page.
    Flickable {
        id: tocScroll
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
                        href: "/start/"
                        current: shell.docsRoute
                        size: Theme.subtitleSize
                        line: Theme.subtitleLine
                    }
                    NavLink {
                        label: "Demos"
                        href: "/demos/"
                        current: shell.route === "/demos/"
                        size: Theme.subtitleSize
                        line: Theme.subtitleLine
                    }
                    NavLink {
                        label: "GitHub"
                        href: "https://github.com/hal-c2/ljos-ui"
                        size: Theme.subtitleSize
                        line: Theme.subtitleLine
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
}
