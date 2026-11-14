import QtQuick
import Site
import "nav.js" as Nav

// The shell of ljos.dev: a header (the name, where to go, search to
// come, the source, light and dark), the docs' sidebar, the page,
// what is on it, and a footer. Which page it shows is the `route`
// the build prerendered it for (`/`, `/demos/`, or a docs route);
// each route is its own page of HTML, and a press is a navigation
// to it. The page a reader without script gets is this same shell,
// as the build wrote it.
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
    color: Theme.bg

    readonly property bool docsRoute: route !== "/" && route !== "/demos/"
    // A docs page's own reading (its title, headings and blocks), in
    // the props the build made this route with: each page's HTML
    // carries its own, so no page loads another page's text.
    property var page: null

    // The scroller a docs page lands its headings in is named as
    // the page is made, below; only a press in a browser asks it.

    // Named, never made: this page is built with Qt Quick Controls,
    // so a live block's compiler may be given them (A15).
    Component {
        ControlsHost {}
    }

    // The header.
    Rectangle {
        id: header
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        height: 56
        color: Theme.bg
        border.color: Theme.border
        border.width: 1

        Row {
            anchors.left: parent.left
            anchors.leftMargin: 20
            anchors.verticalCenter: parent.verticalCenter
            spacing: 22

            Item {
                width: 28 + 8 + wordmark.implicitWidth
                height: 32
                activeFocusOnTab: true
                Accessible.role: Accessible.Link
                Accessible.name: "Ljós — front page"
                Accessible.onPressAction: () => Nav.go("/")
                Keys.onPressed: (event) => {
                    if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                        Nav.go("/");
                        event.accepted = true;
                    }
                }

                Image {
                    width: 28
                    height: 28
                    anchors.verticalCenter: parent.verticalCenter
                    source: "assets/ljos-mark.svg"
                    sourceSize: Qt.size(28, 28)
                    fillMode: Image.PreserveAspectFit
                    Accessible.ignored: true
                }
                Text {
                    id: wordmark
                    x: 36
                    anchors.verticalCenter: parent.verticalCenter
                    text: "Ljós"
                    color: Theme.ink
                    font.family: Theme.serif
                    font.pixelSize: 24
                    font.bold: true
                }
                MouseArea {
                    anchors.fill: parent
                    Accessible.ignored: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: Nav.go("/")
                }
            }
            NavLink {
                label: "Docs"
                href: "/start/"
                current: shell.docsRoute
                height: 32
            }
            NavLink {
                label: "Live demos"
                href: "/demos/"
                current: shell.route === "/demos/"
                height: 32
            }
        }

        Row {
            anchors.right: parent.right
            anchors.rightMargin: 20
            anchors.verticalCenter: parent.verticalCenter
            spacing: 18

            // Search stands here when the site grows one; until then
            // it says so, and takes no press.
            Rectangle {
                width: 190
                height: 32
                color: Theme.panel
                border.color: Theme.border
                border.width: 1

                Text {
                    anchors.left: parent.left
                    anchors.leftMargin: 10
                    anchors.verticalCenter: parent.verticalCenter
                    text: "Search the docs…"
                    color: Theme.muted
                    font.family: Theme.sans
                    font.pixelSize: 13
                }
            }
            NavLink {
                label: "GitHub"
                href: "https://github.com/hal-c2/ljos-ui"
                height: 32
            }
            Item {
                width: themeWords.implicitWidth
                height: 32
                activeFocusOnTab: true
                Accessible.role: Accessible.Button
                Accessible.name: Theme.dark ? "Use the light theme" : "Use the dark theme"
                Accessible.onPressAction: () => Theme.dark = !Theme.dark
                Keys.onPressed: (event) => {
                    if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                        Theme.dark = !Theme.dark;
                        event.accepted = true;
                    }
                }

                Text {
                    id: themeWords
                    anchors.verticalCenter: parent.verticalCenter
                    text: Theme.dark ? "Light" : "Dark"
                    color: Theme.ink
                    font.family: Theme.sans
                    font.pixelSize: 14
                }
                MouseArea {
                    anchors.fill: parent
                    Accessible.ignored: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: Theme.dark = !Theme.dark
                }
            }
        }
    }

    // The sidebar: the docs, in the order their front matter puts
    // them, the reader's page the strong one.
    Flickable {
        id: sidebarScroll
        visible: shell.docsRoute
        anchors.left: parent.left
        anchors.top: header.bottom
        anchors.bottom: footer.top
        width: 264
        contentWidth: width
        contentHeight: sidebar.implicitHeight + 32
        clip: true

        Column {
            id: sidebar
            x: 20
            y: 16
            width: 224
            spacing: 18

            Repeater {
                model: Content.sidebar

                Column {
                    required property var modelData

                    width: 224
                    spacing: 6

                    Text {
                        text: modelData.label
                        color: Theme.muted
                        font.family: Theme.sans
                        font.pixelSize: 12
                        font.bold: true
                    }
                    Repeater {
                        model: modelData.pages

                        NavLink {
                            required property var modelData

                            label: modelData.title
                            href: modelData.route
                            current: modelData.route === shell.route
                        }
                    }
                }
            }
            NavLink {
                label: "Live demos"
                href: "/demos/"
                current: shell.route === "/demos/"
            }
        }
    }
    Rectangle {
        visible: shell.docsRoute
        anchors.left: sidebarScroll.right
        anchors.top: header.bottom
        anchors.bottom: footer.top
        width: 1
        color: Theme.border
    }

    // The page itself.
    Flickable {
        id: pageScroll
        anchors.left: shell.docsRoute ? sidebarScroll.right : parent.left
        anchors.right: shell.docsRoute ? tocScroll.left : parent.right
        anchors.top: header.bottom
        anchors.bottom: footer.top
        contentWidth: width
        contentHeight: (shell.docsRoute ? docItem.height : pageLoader.height) + 48
        clip: true

        // Only this route's page is made, so the HTML the build
        // writes for a route holds that page and no other. The
        // landing and demos pages load by route; a docs page
        // stands here directly, its page bound as it is made, so
        // a prerender — which writes the page as it first stands —
        // holds it whole.
        Loader {
            id: pageLoader
            visible: !shell.docsRoute
            y: 24
            width: Math.min(680, pageScroll.width - 48)
            x: Math.max(24, (pageScroll.width - width) / 2)
            sourceComponent: shell.route === "/" ? landingPage : shell.route === "/demos/" ? demosPage : emptyPage
        }
        DocPage {
            id: docItem
            visible: shell.docsRoute
            y: 24
            width: Math.min(680, pageScroll.width - 48)
            x: Math.max(24, (pageScroll.width - width) / 2)
            route: shell.route
            page: shell.page
            scroller: pageScroll
        }
    }

    Component {
        id: landingPage
        Landing {}
    }
    Component {
        id: demosPage
        DemosPage {}
    }
    Component {
        id: emptyPage
        Item {}
    }

    // On this page: the headings of the page being read, each a
    // press that lands on it without leaving the page.
    Flickable {
        id: tocScroll
        visible: shell.docsRoute && shell.page !== null
        anchors.right: parent.right
        anchors.top: header.bottom
        anchors.bottom: footer.top
        width: 228
        contentWidth: width
        contentHeight: toc.implicitHeight + 32
        clip: true

        Column {
            id: toc
            x: 8
            y: 24
            width: 204
            spacing: 7

            Text {
                text: "On this page"
                color: Theme.muted
                font.family: Theme.sans
                font.pixelSize: 12
                font.bold: true
            }
            Repeater {
                model: shell.page ? shell.page.headings : []

                Item {
                    required property var modelData

                    width: 204
                    height: tocWords.implicitHeight + 2
                    activeFocusOnTab: true
                    Accessible.role: Accessible.Link
                    Accessible.name: modelData.plain
                    Accessible.onPressAction: () => docItem.scrollToAnchor(modelData.anchor)
                    Keys.onPressed: (event) => {
                        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                            docItem.scrollToAnchor(modelData.anchor);
                            event.accepted = true;
                        }
                    }

                    Text {
                        id: tocWords
                        x: modelData.level > 2 ? 14 : 0
                        width: parent.width - x
                        text: modelData.plain
                        color: Theme.ink
                        font.family: Theme.sans
                        font.pixelSize: 13
                        wrapMode: Text.Wrap
                    }
                    MouseArea {
                        anchors.fill: parent
                        Accessible.ignored: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: docItem.scrollToAnchor(modelData.anchor)
                    }
                }
            }
        }
    }
    Rectangle {
        visible: tocScroll.visible
        anchors.right: tocScroll.left
        anchors.top: header.bottom
        anchors.bottom: footer.top
        width: 1
        color: Theme.border
    }

    Rectangle {
        id: footer
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: 40
        color: Theme.panel
        border.color: Theme.border
        border.width: 1

        Text {
            anchors.centerIn: parent
            text: "Ljós — malleable software, everywhere · MIT · This site is a Ljós page, prerendered by ljos-web"
            color: Theme.muted
            font.family: Theme.sans
            font.pixelSize: 12
        }
    }
}
