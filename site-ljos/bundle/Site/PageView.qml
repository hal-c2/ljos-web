import QtQuick
import Site
import "../nav.js" as Nav

// The page the reader is on and the footer under it, in the view that
// scrolls them. It is made once and moves from shell to shell (it is
// put in whichever `site.page` Slot the shell shown has), so what is on
// it, a running example and what the reader did in it, and where they
// are on it, are the reader's whatever frames the page.
Flickable {
    id: view

    property var router: null
    property bool wide: true
    // How wide a page other than the docs may grow: the shell's to say
    // (a marketing page is wider than a workbench's middle column).
    property int widest: Theme.pageWidth
    readonly property int gutter: wide ? Theme.gutterWide : Theme.gutterCompact
    readonly property int measure: router && router.docsRoute ? Theme.measure : widest
    readonly property real offset: contentY
    // The docs page: its headings are landed on by name.
    readonly property alias doc: docItem

    width: parent ? parent.width : 0
    height: parent ? parent.height : 0

    // A web page: the wheel, the scrollbar, a finger and the keys scroll
    // it, a mouse drag does not. A drag that starts in a live example is
    // the example's (an orbit, a slider, a drop), never the page's.
    acceptedButtons: Qt.NoButton
    contentWidth: width
    contentHeight: column.height
    clip: true

    function land(anchor) {
        docItem.scrollToAnchor(anchor);
    }
    // Once the page shown is laid out, so it is as tall as it was.
    function restore(offset) {
        Qt.callLater(() => view.contentY = Math.max(0, Math.min(offset, view.contentHeight - view.height)));
    }
    function top() {
        view.contentY = 0;
    }

    // Where the reader leaves the page is kept once it is still.
    onContentYChanged: {
        keeping.restart();
        Running.moved();
    }
    // What runs on the page runs only in the band of it the reader sees
    // (Running), in the window's terms: told where that is whenever the
    // view moves in the window, as it does when another shell frames it.
    function seen() {
        var at = view.mapToItem(null, 0, 0);
        Running.viewTop = at.y;
        Running.viewBottom = at.y + view.height;
        Running.moved();
    }
    onYChanged: seen()
    onHeightChanged: seen()
    onParentChanged: Qt.callLater(seen)
    onContentHeightChanged: Running.moved()
    Component.onCompleted: seen()
    Timer {
        id: keeping
        interval: 250
        onTriggered: Nav.keep()
    }

    Column {
        id: column
        width: view.width

        Item {
            width: 1
            height: view.wide ? Theme.xxl : Theme.xl
        }

        // Only this route's page is made, so the HTML the build writes
        // for a route holds that page and no other. The landing and
        // demos pages load by route; a docs page stands here directly,
        // its page bound as it is made, so a prerender, which writes the
        // page as it first stands, holds it whole.
        Loader {
            id: pageLoader
            readonly property string route: view.router ? view.router.route : "/"
            visible: !docItem.visible
            Accessible.role: Accessible.Section
            Accessible.name: route === "/demos/" ? "Live demos" : view.router && view.router.pro ? view.router.pro.title : "Home"
            active: visible
            width: Math.min(view.measure, view.width - 2 * view.gutter)
            x: Math.round((view.width - width) / 2)
            sourceComponent: route === "/" ? landingPage : route === "/demos/" ? demosPage : view.router && view.router.pro ? proPage : emptyPage
        }
        DocPage {
            id: docItem
            visible: view.router !== null && view.router.docsRoute
            Accessible.role: Accessible.Section
            Accessible.name: docItem.page ? docItem.page.title : ""
            width: Math.min(view.measure, view.width - 2 * view.gutter)
            x: Math.round((view.width - width) / 2)
            route: visible ? view.router.route : ""
            page: view.router ? view.router.page : null
            scroller: view
            onFollowed: (href) => view.router.follow(href)
        }

        Item {
            width: 1
            height: Theme.xxxl
        }
        Footer {
            width: view.width
            route: view.router ? view.router.route : "/"
            gutter: view.gutter
            measure: view.measure
        }
    }

    Component {
        id: landingPage
        Landing {
            scroller: view
            wide: view.wide
        }
    }
    Component {
        id: demosPage
        DemosPage {
            scroller: view
            wide: view.wide
        }
    }
    Component {
        id: proPage
        ProDemoPage {
            demo: view.router.pro
            scroller: view
            wide: view.wide
        }
    }
    Component {
        id: emptyPage
        Item {}
    }
}
