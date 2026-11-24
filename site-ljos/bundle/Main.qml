import QtQuick
import Site
import Shells
import Ljos.Core
import Ljos.Blocks
import "nav.js" as Nav
import "shells.js" as Frames
import "observing.js" as Observing
import "Shells/later.js" as Later
import "Site/later.js" as SiteLater

// ljos.dev: the site's state and its pieces, and the shell that places
// them. Which page is shown is the `route` the build prerendered this
// HTML for (`/`, `/demos/`, a demo's page, or a docs route, whose
// reading comes in `page`); each route is its own page of HTML, and a
// link is a navigation to it.
//
// The state is blocks (docs/adr/0003-blocks-and-shells.md): the Router
// (where the reader is and how they move), the Preferences (scheme,
// motion, shell) and the page itself (Site/PageView.qml). The pieces a
// shell shows (the name, where to go, search, the page, the docs, what is
// on the page) are contributions to slots named `site.*`; the shell
// (Shells/) only says where each goes. So a shell is swapped live, or
// rewritten by the reader in the page, and the page, what runs on it and
// the reader's place on it stay: the page is made once, here, and moves
// into whichever shell is shown.
//
// Every page is written in the Elegant shell, the one a reader with no
// script gets; another kept shell is put in once the page has been taken
// over (shells.js, assets/head.html).
Rectangle {
    id: main

    property string route: "/"
    property var page: null

    // Bound, not anchored: an anchor to the view an entry is mounted in
    // is settled as the page is made, before that parent stands, and a
    // prerender would write the page at no size at all.
    width: parent ? parent.width : 1440
    height: parent ? parent.height : 900
    color: Theme.canvas
    // A language written from the right lays the site out from the right:
    // every anchor, row and list of it, the shell's and the page's.
    LayoutMirroring.enabled: App.layoutDirection === Qt.RightToLeft
    LayoutMirroring.childrenInherit: true

    // What a shell is given as `site`: the state, and what it may ask.
    readonly property var router: siteRouter
    readonly property var preferences: sitePreferences
    readonly property var theme: Theme
    // A phone's menu, open or not; a shell that has one shows it.
    property bool menuOpen: false
    // How long the page took to be taken over, in ms (-1 until it has),
    // and how many objects it holds: what a status bar says.
    property int hydratedIn: -1
    property int alive: 0
    // What draws the page's live examples at best here: "WebGPU" where an
    // adapter is given, "WebGL2" where only that runs, else "Solid DOM"
    // (every page is DOM; only 3D wants a canvas). Measured once, and
    // only for a shell that says it (measureRenderer), so a page whose
    // shell does not asks the browser for no adapter.
    property string renderer: ""
    function measureRenderer() {
        if (main.renderer !== "")
            return;
        main.renderer = Nav.canRun(["webgl2"]) ? "WebGL2" : "Solid DOM";
        Nav.gpuAdapted().then((ok) => {
            if (ok)
                main.renderer = "WebGPU";
        });
    }
    // How far down the page the reader is: a shell that shows a frame
    // rate measures it while the page moves.
    readonly property real pageOffset: pageView.contentY

    // Where the page is put: the item the shown shell's `site.page` slot
    // holds. Null until a shell is in; the page stands in this item then.
    property var pageHost: null
    // Where that item stands in the site, kept as the shell lays it out:
    // what stands over the page (the Observer) is placed by it.
    property real pageLeft: 0
    property real pageTop: 0
    property real pageWidth: 0
    property real pageHeight: 0
    // How much of the right the Observer a stage opened is docked over
    // (Site/ObserverDock.qml): the page gives it the room, and a shell
    // lets what else is beside the page go (Elegant's contents).
    readonly property var dock: observerDock.item
    readonly property int docked: dock && dock.open && !dock.sheet ? dock.panelWidth : 0
    // The shell framing the page, by name, and one the reader wrote and
    // applied (Site/ShellSource.qml), which is shown over it.
    property string framed: "elegant"
    property var userShell: null
    // Called once the next shell is in, to let a swap's transition go.
    property var arrived: null
    // A kept shell is put in once the page has been taken over; the page
    // the head script held back is shown once it is (shells.js `shown`).
    property bool revealing: false
    readonly property bool hydrated: hydratedIn >= 0
    // Which shell is in, by its name ("elegant", "cyberpunk",
    // "workbench", "desktop"), or "yours" for one that names itself nothing: said on
    // the page's root (shells.js `showing`), so a stylesheet, a test or
    // an agent driving the page knows what frames it.
    readonly property string showing: loader.item ? String(loader.item.objectName).replace(/Shell$/, "") || "yours" : ""
    // The page dresses in the look of the shell that frames it (Theme
    // `shell`), and the HTML around it in that look's colours (the head,
    // by `data-ljos-shell-showing`).
    onShowingChanged: {
        Theme.shell = main.showing;
        Frames.showing(main.showing);
    }

    // Each search the shell shows, to find the one the reader can see.
    property var searches: []

    function placePage() {
        if (!main.pageHost)
            return;
        var at = main.pageHost.mapToItem(main, 0, 0);
        main.pageLeft = at.x;
        main.pageTop = at.y;
        main.pageWidth = main.pageHost.width;
        main.pageHeight = main.pageHost.height;
    }
    // A shell may move the page's place without changing its size (one
    // the reader wrote), by any item the place stands in: mapping it
    // reads each one's, so a move of any is heard. It is copied a turn
    // later, not bound, as a shell may lay out by `docked`, which is
    // itself worked out from where the page stands.
    readonly property var pageAt: main.pageHost ? main.pageHost.mapToItem(main, 0, 0) : null
    onPageAtChanged: Qt.callLater(placePage)
    onPageHostChanged: Qt.callLater(placePage)
    onWidthChanged: Qt.callLater(placePage)
    onHeightChanged: Qt.callLater(placePage)

    function find() {
        if (!sitePreferences.wide)
            main.menuOpen = true;
        Qt.callLater(() => {
            var field = main.searches.find((one) => main.seen(one));
            if (field)
                field.find();
        });
    }
    function back() {
        Frames.back();
    }
    function forward() {
        Frames.forward();
    }
    function showSource(name) {
        main.controlsShown = true;
        if (shellSource.item) {
            shellSource.item.show(name);
        } else {
            shellSource.asked = name;
            shellSource.active = true;
        }
    }
    // Whether the reader can see `item`: it and all it stands in shown.
    function seen(item) {
        for (var at = item; at; at = at.parent)
            if (!at.visible)
                return false;
        return true;
    }
    function count() {
        if (main.hydrated)
            main.alive = Frames.alive(main);
    }

    // The pages the reader opened, in the order they were opened: kept
    // here, not in a shell, so a shell that shows them as tabs
    // (Workbench's files, Desktop's documents) shows the same ones after
    // a swap or an edit of its own QML. Opened as the reader goes, never
    // bound to the route, which would make the list the route alone.
    property var opened: []
    function keepOpen() {
        if (main.opened.indexOf(siteRouter.route) < 0)
            main.opened = main.opened.concat([siteRouter.route]);
    }
    // Closes the page opened `at`; the last one open stays. Closing the
    // one shown goes to the one beside it.
    function close(at) {
        if (main.opened.length < 2 || at < 0 || at >= main.opened.length)
            return;
        var open = main.opened.slice();
        var gone = open.splice(at, 1)[0];
        main.opened = open;
        if (gone === siteRouter.route)
            siteRouter.go(open[Math.min(at, open.length - 1)]);
    }

    // The Observer on the page itself, whichever shell asks: its
    // toolbar's or activity bar's button.
    property bool observing: false
    function observe() {
        Observing.toggle("site", pageView, null, t`this page`);
    }
    // Every demo as it first ran: the page loaded again.
    function reload() {
        Frames.reload();
    }

    // What is wrong with the running shell's QML as the reader edits it
    // in place (Site/LiveSource.qml), each `{ file, line, column,
    // message, text }`: a shell's Problems and its count of diagnostics.
    property var problems: []
    // The calls the front page's recorded agent sent (Site/Running.qml):
    // a shell's MCP log, and its Clear log.
    readonly property var calls: Running.calls
    function clearCalls() {
        Running.calls = [];
    }
    // What a shell's reader has shown and hidden, by the shell's
    // objectName: a shell made again, from an edit of its QML or on
    // coming back to it, puts it back. Not bound to: nothing reads it as
    // it changes.
    property var shellStates: ({})
    function keep(name, state) {
        shellStates[name] = state;
    }
    function kept(name) {
        return shellStates[name] ?? null;
    }
    // Where the editor of the running shell's QML stands: the item the
    // shown shell's `site.source.live` slot holds, null in a shell with
    // none. The editor is made once and moves between them.
    property var liveHost: null
    property bool liveWanted: false
    // The editor is of the shell that first asked for it, which may no
    // longer be the one shown by the time it has come.
    onLiveHostChanged: {
        if (liveHost && !liveWanted) {
            liveOf = framed;
            liveWanted = true;
        }
        housed();
    }
    // The shell the reader's last edit made, and the last of those that
    // ran well: a later edit that compiles but does not run, or faults
    // once up, gives way to it, and coming back to the shell it is of
    // shows the edit again, one that compiled while they were away too.
    // An edit that came up is on trial (`liveTried`) until the reader
    // changes it: only one that never faulted while shown is kept as
    // the last that ran, so recovery never falls back to what faulted.
    property var liveShell: null
    property var liveTried: null
    property var liveGood: null
    property string liveOf: ""
    // The shell the editor edits is the one shown, and no other is asked
    // for: only then is an edit's answer put in as it comes.
    readonly property bool liveShown: framed === liveOf && sitePreferences.shown === liveOf

    // The shell shown: as one view transition where the browser has
    // them (a rise, or with reduced motion a crossfade), else faded in.
    function frame(name) {
        if (!main.hydrated || name === main.framed) {
            main.framed = name;
            return;
        }
        var moved = Frames.swap(() => {
            // Asked for again meanwhile (the head's watchdog gave up on
            // a kept shell): the later ask stands, and this swap has
            // nothing to wait for.
            if (sitePreferences.shown !== name)
                return false;
            pageView.hold();
            main.userShell = name === main.liveOf ? (main.liveShell ?? main.liveGood) : null;
            main.framed = name;
            return true;
        }, sitePreferences.calm ? "calm" : name === "cyberpunk" ? "glitch" : "rich", (done) => {
            main.letGo();
            main.arrived = done;
        });
        if (!moved)
            fadeIn.armed = true;
    }

    Router {
        id: siteRouter
        route: main.route
        page: main.page
        view: pageView
        onWent: main.menuOpen = false
        onRouteChanged: {
            main.keepOpen();
            Qt.callLater(main.count);
        }
    }
    Preferences {
        id: sitePreferences
        wide: main.width >= Theme.wideFrom
        // Set by the change, not by a Binding: every page would load
        // that type for this one property.
        onWideChanged: Theme.narrow = !sitePreferences.wide
        onShownChanged: main.frame(sitePreferences.shown)
    }

    Component.onCompleted: {
        Theme.narrow = !sitePreferences.wide;
        main.keepOpen();
        Observing.watch(() => {
            main.observing = Observing.isShown("site");
            if (Observing.shown)
                observerDock.active = true;
        });
        siteRouter.start();
        Frames.whenHydrated((ms) => {
            main.hydratedIn = ms;
            var kept = Frames.picked();
            // The head's watchdog has shown the page as written already:
            // the reader is reading Elegant, which stays on this page
            // (the pick is still kept for the next).
            if (kept !== "" && kept !== sitePreferences.shell && !Frames.late()) {
                main.revealing = true;
                sitePreferences.shell = kept;
                // Where there are no view transitions the swap is made at
                // once, so `framed` is the kept shell's name already while
                // its module is still on its way, and the page waits for
                // it (loader.onItemChanged shows it).
                Frames.whenLate(() => main.late());
            } else {
                main.settle();
            }
            Qt.callLater(main.count);
        });
    }

    // A swap waiting for its shell to come is let go: the browser shows
    // the page again (shells.js `swap`). Called when the shell is in,
    // and wherever a swap is given up, so the browser does not hold the
    // page's last picture until the swap's own fallback.
    function letGo() {
        var release = main.arrived;
        main.arrived = null;
        if (release)
            release();
    }

    // The page is the reader's: shown, its kept shell in, and what waits
    // for that (Running.settled) may start.
    function settle() {
        Frames.shown();
        Running.settled = true;
    }

    // The head's watchdog showed the page while the kept shell was still
    // on its way: what the reader now sees is Elegant, so the kept
    // shell is not put over it, which would be the very jump the page
    // was held back to spare them.
    function late() {
        if (!main.revealing)
            return;
        main.letGo();
        fadeIn.armed = false;
        main.framed = "elegant";
        sitePreferences.shell = "elegant";
        main.revealing = false;
        Running.settled = true;
    }

    // Ljós's own controls draw in the site's colours (Site/ControlsLook.qml)
    // from the first time the site shows one: a shell other than
    // Elegant, the shell choices or a shell's source, each of which
    // comes after a page's first load and brings them. Once made it stays,
    // so it is the one thing that colours them.
    property bool controlsShown: false
    readonly property bool framesControls: framed !== "elegant"
    onFramesControlsChanged: if (framesControls) controlsShown = true
    Loader {
        active: main.controlsShown
        source: SiteLater.controlsLook
    }

    // Named, never made: this page is built with Qt Quick Controls,
    // so a live block's compiler may be given them (A15).
    Component {
        ControlsHost {}
    }

    Keys.onEscapePressed: main.menuOpen = false
    Keys.onPressed: (event) => {
        if (event.text === "/" && !(event.modifiers & (Qt.ControlModifier | Qt.AltModifier | Qt.MetaModifier))) {
            main.find();
            event.accepted = true;
        }
    }

    // Past the shell to the page, the first stop for a keyboard. It stands
    // in a region of its own: a page holds a render for each size, so a
    // narrow one's skip link comes after the wide one's links, and axe
    // then takes it for content outside every landmark.
    Item {
        z: 10
        // As wide as the page, so the link is set from its right on a
        // right-to-left page.
        width: parent.width
        Accessible.role: Accessible.Section
        Accessible.name: t`Skip to content`

        Rectangle {
            id: skip
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: Theme.s
            x: LayoutMirroring.enabled ? parent.width - width - startX : startX
            y: skip.activeFocus ? Theme.s : -height - Theme.s
            width: skipWords.implicitWidth + 2 * Theme.s
            height: 40
            radius: Theme.radiusSmall
            color: Theme.surfaceRaised
            border.color: Theme.focusRing
            border.width: 2
            activeFocusOnTab: true
            // A link to a place on this page, which is what makes it a skip
            // link to a reader with no script (and to axe): the app's own
            // element, the one place every page has. With script a press
            // moves the focus to the page itself.
            readonly property string href: "#app"
            Accessible.role: Accessible.Link
            Accessible.name: skipWords.text
            Accessible.onPressAction: () => pageView.forceActiveFocus()
            Keys.onPressed: (event) => {
                if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                    pageView.forceActiveFocus();
                    event.accepted = true;
                }
            }

            Text {
                id: skipWords
                anchors.centerIn: parent
                text: t`Skip to content`
                color: Theme.text
                font.family: Theme.sans
                font.pixelSize: Theme.bodySize
                Accessible.ignored: true
            }
        }
    }

    // The page, made once: it stands in the shell's `site.page` slot.
    PageView {
        id: pageView
        parent: main.pageHost ?? main
        covered: Math.max(0, main.pageLeft + main.pageWidth - (main.width - main.docked))
        router: siteRouter
        wide: sitePreferences.wide && pageView.width >= 720
        widest: loader.item && loader.item.pageWidest ? loader.item.pageWidest : Theme.pageWidth
    }

    // The pieces, by the slot each goes in. One that fills its place
    // takes its slot's parent's size; one that has its own (a link, a
    // button) stands in a row at that size.
    Contribution {
        slot: "site.page"
        delegate: Component {
            Item {
                id: host
                width: parent ? parent.width : 0
                height: parent ? parent.height : 0
                // The next shell's host takes the page before the last
                // one's goes, so the page is never out of the window.
                Component.onCompleted: main.pageHost = host
                Component.onDestruction: if (main.pageHost === host) main.pageHost = null
                // A shell sizes the page's place as it lays out, the
                // window, its sidebar or its header changing: each
                // change it makes reaches this item's size.
                onWidthChanged: Qt.callLater(main.placePage)
                onHeightChanged: Qt.callLater(main.placePage)
            }
        }
    }
    Contribution {
        slot: "site.brand"
        delegate: Component {
            // The link's press box; the logo's own file keeps its size.
            Brand {
                route: siteRouter.route
                height: Theme.target
            }
        }
    }
    Contribution {
        slot: "site.brand.small"
        delegate: Component {
            // The link's press box; the logo's own file keeps its size.
            // Desktop's menu bar and Workbench's title bar are thin, wide (40
            // high): a 28 px logo leaves each 6 above and below.
            Brand {
                route: siteRouter.route
                height: Theme.target
                logoHeight: 28
            }
        }
    }
    Contribution {
        slot: "site.nav"
        delegate: Component {
            Row {
                spacing: Theme.l

                Repeater {
                    model: siteRouter.sections

                    // At the header's own size, beside the search and the
                    // switcher; a fixed line as tall as the words, so they
                    // stand on the header's middle line with the mark.
                    NavLink {
                        required property var modelData
                        anchors.verticalCenter: parent.verticalCenter
                        label: modelData.label
                        to: modelData.to
                        current: modelData.current
                        size: Theme.uiSize + 1
                        line: Theme.uiLine
                    }
                }
            }
        }
    }
    Contribution {
        slot: "site.nav.large"
        delegate: Component {
            Column {
                spacing: Theme.narrow ? 0 : Theme.s

                Repeater {
                    model: siteRouter.sections

                    NavLink {
                        required property var modelData
                        label: modelData.label
                        to: modelData.to
                        current: modelData.current
                        size: Theme.subtitleSize
                        line: Theme.subtitleLine
                        least: Theme.rowLeast
                    }
                }
            }
        }
    }
    Contribution {
        slot: "site.search"
        delegate: Component {
            Search {
                id: search
                z: 2
                width: parent ? parent.width : 280
                height: parent ? parent.height : 40
                onPicked: (href) => siteRouter.follow(href)
                Component.onCompleted: main.searches = main.searches.concat([search])
                Component.onDestruction: main.searches = main.searches.filter((one) => one !== search)
            }
        }
    }
    Contribution {
        slot: "site.github"
        delegate: Component {
            GitHubMark {
                route: siteRouter.route
                to: siteRouter.github
            }
        }
    }
    Contribution {
        slot: "site.switcher"
        delegate: Component {
            ShellSwitcher {
                preferences: sitePreferences
                onChoosing: main.controlsShown = true
                onSourceAsked: (name) => main.showSource(name)
            }
        }
    }
    Contribution {
        slot: "site.switcher.compact"
        delegate: Component {
            ShellSwitcher {
                compact: true
                preferences: sitePreferences
                onChoosing: main.controlsShown = true
                onSourceAsked: (name) => main.showSource(name)
            }
        }
    }
    Contribution {
        slot: "site.source.live"
        delegate: Component {
            Item {
                id: liveSpot
                width: parent ? parent.width : 0
                height: parent ? parent.height : 0
                // As the page's host: the next shell's takes the editor
                // before the last one's goes.
                Component.onCompleted: main.liveHost = liveSpot
                Component.onDestruction: if (main.liveHost === liveSpot) main.liveHost = null
            }
        }
    }
    Contribution {
        slot: "site.preferences"
        delegate: Component {
            Row {
                spacing: Theme.xxs

                LanguageSwitcher {
                    preferences: sitePreferences
                    onChoosing: main.controlsShown = true
                }
                MotionToggle {}
                ThemeToggle {}
            }
        }
    }
    Contribution {
        slot: "site.menu"
        delegate: Component {
            MenuButton {
                open: main.menuOpen
                onPressed: main.menuOpen = !main.menuOpen
            }
        }
    }
    Contribution {
        slot: "site.sidebar"
        delegate: Component {
            Flickable {
                acceptedButtons: Qt.NoButton
                width: parent ? parent.width : Theme.sidebarWidth
                height: parent ? parent.height : 0
                contentWidth: width
                contentHeight: sidebarMap.implicitHeight + Theme.xxl
                clip: true
                Accessible.role: Accessible.ComplementaryContent
                Accessible.name: t`The docs`

                DocsMap {
                    id: sidebarMap
                    // Where it starts, read from the left; a right-to-left page
                    // sets it as far from the right (LayoutMirroring).
                    readonly property real startX: Theme.gutterWide
                    x: LayoutMirroring.enabled ? parent.width - width - startX : startX
                    y: Theme.l
                    width: parent.width - Theme.gutterWide - Theme.m
                    route: siteRouter.route
                }
            }
        }
    }
    Contribution {
        slot: "site.toc"
        delegate: Component {
            Flickable {
                acceptedButtons: Qt.NoButton
                width: parent ? parent.width : Theme.tocWidth
                height: parent ? parent.height : 0
                contentWidth: width
                contentHeight: tocList.implicitHeight + Theme.xxl
                clip: true
                Accessible.role: Accessible.ComplementaryContent
                Accessible.name: t`On this page`

                Toc {
                    id: tocList
                    // Where it starts, read from the left; a right-to-left page
                    // sets it as far from the right (LayoutMirroring).
                    readonly property real startX: Theme.l
                    x: LayoutMirroring.enabled ? parent.width - width - startX : startX
                    y: Theme.xxl
                    width: parent.width - Theme.l - Theme.gutterWide
                    router: siteRouter
                    listed: sitePreferences.wide
                }
            }
        }
    }
    Contribution {
        slot: "site.toc.inline"
        delegate: Component {
            // Only a narrow page has the menu this stands in; wide, the
            // contents beside the page are the one list a reader finds.
            Toc {
                width: parent ? parent.width : 0
                router: sitePreferences.wide ? null : siteRouter
                roomy: true
            }
        }
    }
    Contribution {
        slot: "site.docs.inline"
        delegate: Component {
            DocsMap {
                width: parent ? parent.width : 0
                route: siteRouter.route
            }
        }
    }
    Contribution {
        slot: "site.tree"
        delegate: Component {
            PageTree {
                router: siteRouter
            }
        }
    }
    Contribution {
        slot: "site.source"
        delegate: Component {
            PageSource {
                router: siteRouter
            }
        }
    }

    // The shells the site ships. Elegant, the one every page is
    // written in, is given the site here; the others come when first
    // picked (Shells/later.js) and, as a shell the reader wrote, are
    // given it once they are in.
    Component {
        id: elegantShell
        Elegant {
            site: main
        }
    }

    // The running shell's QML, edited in place (Site/LiveSource.qml): it
    // comes the first time a shell has a place for it, and stays.
    Loader {
        id: liveSource
        // Its item lives in the shell's place for it. The loader stays here
        // at the item's size, and above the shell it would take the
        // presses of the shell's top left: it comes before the shell, so
        // lies under it. Not by a negative z: that moves the site's
        // ground into a layer of its own (Rectangle's qq-under), which
        // contrast checkers cannot see through, so no words on the page
        // could be read for contrast.
        active: main.liveWanted
        source: SiteLater.liveSource
        onLoaded: {
            main.controlsShown = true;
            item.name = main.liveOf;
            item.touch = Qt.binding(() => !sitePreferences.wide);
            main.housed();
            item.visible = Qt.binding(() => main.liveHost !== null);
        }
    }

    ShellLoader {
        id: loader
        width: main.width
        height: main.height
        source: main.userShell ?? (main.framed === "cyberpunk" ? Later.cyberpunk : main.framed === "workbench" ? Later.workbench : main.framed === "desktop" ? Later.desktop : elegantShell)
        // A shell that does not work gives way to the one every page is
        // written in, and says why (Site/ShellSource.qml shows it).
        fallback: elegantShell

        onItemChanged: {
            if (!loader.item)
                return;
            if ("site" in loader.item && loader.item.site !== main)
                loader.item.site = main;
            main.letGo();
            if (main.userShell !== null && main.userShell === main.liveShell && loader.error === "") {
                // An edit that takes away the editor's place would leave
                // the reader nothing to type in or Reset with: it is a
                // problem, and the last that ran stays. The new shell's
                // place, had it one, took the editor as the shell was
                // made; the old shell, and its place, goes after this.
                if (main.holds(loader.item, main.liveHost)) {
                    main.liveTried = main.liveShell;
                } else {
                    var file = liveSource.item && liveSource.item.source ? liveSource.item.source.file : "";
                    var why = t`This edit has no site.source.live, where its editor is shown, so the last edit that ran stays.`;
                    main.problems = [{ file: file, line: 0, column: 0, message: why, text: why }];
                    main.liveShell = null;
                    pageView.hold();
                    main.userShell = main.liveGood;
                }
            }
            Qt.callLater(main.placePage);
            if (fadeIn.armed) {
                fadeIn.armed = false;
                fadeIn.target = loader.item;
                fadeIn.restart();
            }
            if (main.revealing) {
                main.revealing = false;
                Qt.callLater(main.settle);
            }
            Qt.callLater(main.count);
        }
    }

    // The Observer a stage's toolbar opens, over whichever shell is
    // shown: from the page's top to its foot, docked along the right of
    // the window or a sheet across it, and leaving what the shell puts
    // left of the page (a sidebar, a tree) where it is. It is made the
    // first time an Observer is opened, from a chunk of its own fetched
    // with the Observer's (observing.js), and shows what was opened as it
    // comes; reading a page does not need it.
    Loader {
        id: observerDock
        z: 4
        y: main.pageTop
        active: false
        source: Observing.dockSource
        onLoaded: {
            item.room = Qt.binding(() => main.width);
            item.roomHeight = Qt.binding(() => main.pageHeight);
            item.beside = Qt.binding(() => main.pageLeft);
            item.openChanged.connect(() => {
                if (item.open)
                    main.placePage();
            });
            if (item.open)
                main.placePage();
        }
    }

    // A browser without view transitions: the new shell fades in, as
    // with reduced motion; there is no picture of the last one to move.
    NumberAnimation {
        id: fadeIn
        property bool armed: false
        property: "opacity"
        from: 0
        to: 1
        duration: Theme.enterPanel
        easing.type: Easing.OutCubic
    }

    // A shell's own QML, to read and change (Site/ShellSource.qml): it
    // comes the first time a reader asks for it.
    Loader {
        id: shellSource
        // The shell asked for before the panel was in.
        property string asked: ""
        // Of no size at the page's top left: the panel is centred on the
        // page itself, and a loader the page's size would stand over it.
        active: false
        source: SiteLater.shellSource
        onLoaded: {
            item.room = main;
            item.error = Qt.binding(() => loader.error);
            item.show(shellSource.asked);
        }
    }
    // Moved by a write each time, not bound: a bound `parent` that
    // changes is not among its new parent's children (ljos-web), so the
    // editor stayed in the shell it left and went with it.
    function holds(shell, item) {
        for (var at = item; at; at = at.parent) {
            if (at === shell)
                return true;
        }
        return false;
    }
    function housed() {
        if (liveSource.item)
            liveSource.item.parent = main.liveHost ?? main;
    }
    Connections {
        target: liveSource.item
        function onRan(shell) {
            // The edit on trial ran, with no fault, until this one.
            if (main.liveTried !== null)
                main.liveGood = main.liveTried;
            main.liveTried = null;
            main.problems = [];
            main.liveShell = shell;
            if (!main.liveShown)
                return;
            pageView.hold();
            main.userShell = shell;
        }
        function onBroke(diagnostics) {
            main.problems = diagnostics;
        }
        function onReset() {
            main.problems = [];
            main.liveShell = null;
            main.liveTried = null;
            main.liveGood = null;
            if (!main.liveShown)
                return;
            pageView.hold();
            main.userShell = null;
        }
    }
    // An edit that compiled but did not come up, or faulted once up: it
    // is a problem too, and the last that ran well stays. What faulted
    // is let go of wherever it was kept, so it is neither fallen back to
    // nor shown again on coming back.
    Connections {
        target: loader
        function onErrorChanged() {
            var faulted = main.userShell;
            if (loader.error === "" || faulted === null || (faulted !== main.liveShell && faulted !== main.liveGood))
                return;
            var file = liveSource.item && liveSource.item.source ? liveSource.item.source.file : "";
            main.problems = [{ file: file, line: 0, column: 0, message: loader.error, text: loader.error }];
            if (faulted === main.liveShell)
                main.liveShell = null;
            if (faulted === main.liveTried)
                main.liveTried = null;
            if (faulted === main.liveGood)
                main.liveGood = null;
            pageView.hold();
            main.userShell = main.liveGood;
        }
    }
    Connections {
        target: shellSource.item
        function onApplied(file, text) {
            pageView.hold();
            main.userShell = Frames.compiled(file, text);
        }
        function onReset() {
            pageView.hold();
            main.userShell = null;
        }
    }

    // Said once a swap is done, where a reader listens.
    Connections {
        target: sitePreferences
        function onShellChanged() {
            if (main.hydrated && !main.revealing) {
                var shell = sitePreferences.labelOf(sitePreferences.shell);
                Accessible.announce(t`Switched to ${shell}. Your place and edits are kept.`);
            }
        }
    }
}
