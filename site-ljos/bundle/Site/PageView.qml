// Ljós's Core before QtQuick: only its t`` is wanted here.
import Ljos.Core
pragma Scripts: JavaScript; import Ljos.Ui
import Ljos.Layout
import Site
import "../nav.js" as Nav
import "later.js" as Later

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
    // (an Elegant page is wider than a workbench's middle column).
    property int widest: Theme.pageWidth
    readonly property int gutter: wide ? Theme.gutterWide : Theme.gutterCompact
    readonly property int measure: router && router.docsRoute ? Theme.measure : widest
    readonly property real offset: contentY
    // The docs page: its headings are landed on by name.
    readonly property alias doc: docItem

    // How much of the right of the place it stands in something over
    // the page covers (the Observer docked there): the page gives it
    // that room, so what the reader clicks in stays beside it.
    property real covered: 0

    width: parent ? Math.max(0, parent.width - covered) : 0
    height: parent ? parent.height : 0

    // A web page: the wheel, the scrollbar, a finger and the keys scroll
    // it, a mouse drag does not. A drag that starts in a live example is
    // the example's (an orbit, a slider, a drop), never the page's.
    acceptedButtons: MouseButton.None
    contentWidth: width
    contentHeight: column.height
    clip: true

    function land(anchor) {
        view.waiting = -1;
        docItem.scrollToAnchor(anchor);
    }
    // Once the page shown is laid out, so it is as tall as it was. A
    // page that loads by route (later.js) and is still being fetched is
    // not: the offset waits for it (`waiting`), and nothing is scrolled,
    // so kept, before, which would be the offset cut to an empty page.
    property real waiting: -1
    function restore(offset) {
        later(() => {
            if (pageLoader.visible && pageLoader.status === Loader.Loading) {
                view.waiting = offset;
                return;
            }
            view.waiting = -1;
            view.contentY = Math.max(0, Math.min(offset, view.contentHeight - view.height));
        });
    }
    function top() {
        view.waiting = -1;
        view.contentY = 0;
    }

    // Where the reader is on the page, as a browser's scroll anchoring
    // keeps it: the block at the top of the view and how far into it.
    // When the page is laid out again at another width (a narrowed
    // window, a shell whose page is narrower, the Observer docked
    // beside it), its blocks grow taller or shorter, and the same
    // distance from the top is somewhere else; the reader is put back
    // in the block they were reading instead.
    property var placeBlock: null
    property real placeInto: 0
    // While the page is being laid out again: its height changes as
    // each block takes the new width, and the reader is put back after
    // each change, not only after the first.
    property bool placing: false

    function mark() {
        var y = view.contentY;
        var at = column;
        var found = null;
        // Down to the outermost block at the view's top that fits in the
        // view: finer than the page's sections, coarse enough to be
        // laid out the same at any width (a demo, a paragraph).
        while (at) {
            var next = null;
            var kids = at.children;
            for (var i = 0; i < kids.length && !next; i++) {
                var kid = kids[i];
                if (!kid.visible || kid.height <= 0)
                    continue;
                var kidTop = kid.mapToItem(column, 0, 0).y;
                if (kidTop <= y && y < kidTop + kid.height)
                    next = kid;
            }
            if (!next)
                break;
            found = next;
            at = next.height > view.height ? next : null;
        }
        view.placeBlock = found;
        view.placeInto = found ? (y - found.mapToItem(column, 0, 0).y) / found.height : 0;
    }
    // Only while the marked block is still on the page: it may have
    // gone with the page it stood on.
    function placed() {
        for (var up = view.placeBlock; up; up = up.parent) {
            if (up === column)
                return true;
        }
        return false;
    }
    function place() {
        if (!view.placing || !placed())
            return;
        var to = view.placeBlock.mapToItem(column, 0, 0).y + view.placeInto * view.placeBlock.height;
        view.contentY = Math.max(0, Math.min(to, view.contentHeight - view.height));
    }
    // Before another shell lays the page out: a scroll `keeping` still
    // waits on is where the reader is, not the place marked before it.
    function hold() {
        if (keeping.running && !view.placing)
            view.mark();
    }
    function reflowed() {
        if (!placed())
            return;
        view.placing = true;
        settling.restart();
        later(view.place);
    }
    onWidthChanged: reflowed()
    onMeasureChanged: reflowed()
    onGutterChanged: reflowed()
    Timer {
        id: settling
        interval: 300
        onTriggered: {
            view.placing = false;
            view.mark();
        }
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
    onParentChanged: later(seen)
    onContentHeightChanged: {
        place();
        Running.moved();
    }
    Component.onCompleted: seen()
    Timer {
        id: keeping
        interval: 250
        onTriggered: {
            if (!view.placing)
                view.mark();
            Nav.keep();
        }
    }

    Column {
        id: column
        width: view.width

        Item {
            width: 1
            height: view.wide ? Theme.xxl : Theme.xl
        }

        // The page's own content, between the shell above it and the
        // footer: the client area, which a reader is taken to as the
        // page's main landmark, named for the page. The footer and the
        // docs beside it are landmarks of their own.
        Column {
            width: view.width
            Accessible.role: Accessible.Client
            Accessible.name: docItem.visible ? (docItem.page ? docItem.page.title : "") : pageLoader.route === "/demos/" ? "Live demos" : pageLoader.route === "/showcase/" ? "Built with Ljós" : view.router && view.router.pro ? view.router.pro.title : "Home"

            // Only this route's page is made, so the HTML the build
            // writes for a route holds that page and no other. The
            // landing, the demos page, a pro demo and the showcase load by
            // route, each from a module of its own (later.js), so no other
            // page's first load carries them; a docs
            // page stands here directly, its page bound as it is made, so
            // a prerender, which writes the page as it first stands, holds
            // it whole.
            Loader {
                id: pageLoader
                readonly property string route: view.router ? view.router.route : "/"
                onRouteChanged: view.placeBlock = null
                visible: !docItem.visible
                active: visible
                width: Math.min(view.measure, view.width - 2 * view.gutter)
                Layout.alignment: Align.HCenter
                readonly property var demo: view.router ? view.router.pro : null
                component: route === "/" || route === "/demos/" || route === "/showcase/" || demo ? null : emptyPage
                readonly property var page: route === "/" ? Later.landing : route === "/demos/" ? Later.demosPage : route === "/showcase/" ? Later.showcase : demo ? Later.proDemo : ""
                source: page
                // Every pro demo is the one module (later.js), so going
                // from one to the next sets no new source: a page that
                // could not be fetched is asked for again here, and is
                // bound again after, to follow the route on.
                onDemoChanged: {
                    if (demo && status === Loader.Error)
                        retry();
                }
                // Asks for the route's page again, then binds it again
                // to follow the route on.
                function retry() {
                    pageLoader.byKey = again.activeFocus;
                    setSource(page);
                    source = bind(() => pageLoader.page);
                }
                // What a page it loads reads as it is made (`wide`, and a
                // pro demo's page its `demo`), so it is bound from the
                // start, not once loaded.
                readonly property bool wide: view.wide
                // Try again pressed from the keyboard: the button goes as
                // the page is asked for, and focus is put where the reader
                // can go on from, the button again if it fails once more,
                // else the page's first stop.
                property bool byKey: false
                // `loaded` comes after the status reads Ready, so it is
                // there, not here, that a page that came takes the focus.
                onStatusChanged: {
                    if (status !== Loader.Error)
                        return;
                    view.waiting = -1;
                    if (pageLoader.byKey)
                        later(() => again.forceActiveFocus(FocusReason.Other));
                    pageLoader.byKey = false;
                }
                onLoaded: {
                    item.scroller = view;
                    if (pageLoader.byKey) {
                        pageLoader.byKey = false;
                        const first = item.nextItemInFocusChain(true);
                        later(() => (first && first !== again ? first : item).forceActiveFocus(FocusReason.Other));
                    }
                    if (view.waiting >= 0) {
                        view.restore(view.waiting);
                        view.waiting = -1;
                    }
                    if (route !== "/" && route !== "/demos/")
                        return;
                    item.wide = bind(() => view.wide);
                }
            }
            // A page whose module could not be fetched (a dropped
            // connection, a deploy that replaced its chunk) says so where
            // it would stand, and is asked for again on the same route
            // when the reader presses Try again: going elsewhere and back
            // is not the only way to it.
            Column {
                id: unfetched
                visible: pageLoader.visible && pageLoader.status === Loader.Error
                width: pageLoader.width
                Layout.alignment: Align.HCenter
                topPadding: Theme.xxl
                spacing: Theme.m

                Text {
                    width: parent.width
                    wrap: Text.Wrap
                    color: Theme.text
                    font.family: Theme.sans
                    font.size: Theme.bodySize
                    text: t`This page could not be loaded.`
                }
                Rectangle {
                    id: again
                    implicitWidth: againLabel.implicitWidth + 2 * Theme.m
                    width: implicitWidth
                    height: Theme.target
                    radius: Theme.radiusSmall
                    fill: againHit.pressed ? Theme.surfacePressed : againHit.containsMouse ? Theme.surfaceHover : Theme.surfaceRaised
                    border.width: activeFocus ? 2 : 1
                    border.color: activeFocus ? Theme.focusRing : Theme.divider
                    activeFocusOnTab: true
                    Accessible.role: Accessible.Button
                    Accessible.name: againLabel.text
                    Accessible.onPressAction: () => pageLoader.retry()
                    Keys.onPressed: (event) => {
                        if (event.key === Key.Return || event.key === Key.Enter || event.key === Key.Space) {
                            pageLoader.retry();
                            event.accepted = true;
                        }
                    }

                    Text {
                        id: againLabel
                        anchors.centerIn: parent
                        color: Theme.text
                        font.family: Theme.sans
                        font.size: Theme.uiSize
                        text: t`Try again`
                        Accessible.ignored: true
                    }
                    PointerArea {
                        id: againHit
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Cursor.PointingHand
                        onClicked: pageLoader.retry()
                    }
                }
            }
            DocPage {
                id: docItem
                visible: view.router !== null && view.router.docsRoute
                width: Math.min(view.measure, view.width - 2 * view.gutter)
                Layout.alignment: Align.HCenter
                route: visible ? view.router.route : ""
                page: view.router ? view.router.page : null
                scroller: view
                onFollowed: (href) => view.router.follow(href)
            }
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
        id: emptyPage
        // Every page the loader makes is handed the view it scrolls in.
        Item {
            property var scroller: null
        }
    }
}
