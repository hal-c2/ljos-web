import QtQuick
import Site
import Shells
import Ljos.Core
import Ljos.Blocks
import "nav.js" as Nav
import "shells.js" as Frames
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
// Every page is written in the marketing shell, the one a reader with no
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
    // lets what else is beside the page go (Marketing's contents).
    readonly property int docked: observerDock.open && !observerDock.sheet ? observerDock.panelWidth : 0
    // The shell framing the page, by name, and one the reader wrote and
    // applied (Site/ShellSource.qml), which is shown over it.
    property string framed: "marketing"
    property var userShell: null
    // Called once the next shell is in, to let a swap's transition go.
    property var arrived: null
    // A kept shell is put in once the page has been taken over; the page
    // the head script held back is shown once it is (shells.js `shown`).
    property bool revealing: false
    readonly property bool hydrated: hydratedIn >= 0
    // Which shell is in, by its name ("marketing", "workbench",
    // "desktop"), or "yours" for one that names itself nothing: said on
    // the page's root (shells.js `showing`), so a stylesheet, a test or
    // an agent driving the page knows what frames it.
    readonly property string showing: loader.item ? String(loader.item.objectName).replace(/Shell$/, "") || "yours" : ""
    onShowingChanged: Frames.showing(main.showing)

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
    onPageHostChanged: Qt.callLater(placePage)

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
            main.userShell = null;
            main.framed = name;
            return true;
        }, sitePreferences.calm, (done) => {
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
        onRouteChanged: Qt.callLater(main.count)
    }
    Preferences {
        id: sitePreferences
        wide: main.width >= Theme.wideFrom
        onShownChanged: main.frame(sitePreferences.shown)
    }

    Component.onCompleted: {
        siteRouter.start();
        Frames.whenHydrated((ms) => {
            main.hydratedIn = ms;
            var kept = Frames.picked();
            // The head's watchdog has shown the page as written already:
            // the reader is reading Marketing, which stays on this page
            // (the pick is still kept for the next).
            if (kept !== "" && kept !== sitePreferences.shell && !Frames.late()) {
                main.revealing = true;
                sitePreferences.shell = kept;
                // Too narrow for it: the marketing shell stays, as written.
                // Asked of the window, not of what is framed: where there
                // are no view transitions the swap is made at once, so
                // `framed` is the kept shell's name already while its
                // module is still on its way, and the page must wait for
                // it (loader.onItemChanged shows it).
                if (sitePreferences.narrowed) {
                    main.revealing = false;
                    Frames.shown();
                } else {
                    Frames.whenLate(() => main.late());
                }
            } else {
                Frames.shown();
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

    // The head's watchdog showed the page while the kept shell was still
    // on its way: what the reader now sees is Marketing, so the kept
    // shell is not put over it, which would be the very jump the page
    // was held back to spare them.
    function late() {
        if (!main.revealing)
            return;
        main.letGo();
        fadeIn.armed = false;
        main.framed = "marketing";
        sitePreferences.shell = "marketing";
        main.revealing = false;
    }

    // Ljós's own controls draw in the site's colours (Site/ControlsLook.qml)
    // from the first time the site shows one: a shell other than
    // Marketing, the shell choices or a shell's source, each of which
    // comes after a page's first load and brings them. Once made it stays,
    // so it is the one thing that colours them.
    property bool controlsShown: false
    readonly property bool framesControls: framed !== "marketing"
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
        Accessible.role: Accessible.Section
        Accessible.name: t`Skip to content`

        Rectangle {
            id: skip
            x: Theme.s
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
            Brand {
                route: siteRouter.route
            }
        }
    }
    Contribution {
        slot: "site.brand.small"
        delegate: Component {
            Brand {
                route: siteRouter.route
                size: 18
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

                    NavLink {
                        required property var modelData
                        anchors.verticalCenter: parent.verticalCenter
                        label: modelData.label
                        to: modelData.to
                        current: modelData.current
                    }
                }
            }
        }
    }
    Contribution {
        slot: "site.nav.large"
        delegate: Component {
            Column {
                spacing: Theme.s

                Repeater {
                    model: siteRouter.sections

                    NavLink {
                        required property var modelData
                        label: modelData.label
                        to: modelData.to
                        current: modelData.current
                        size: Theme.subtitleSize
                        line: Theme.subtitleLine
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
        slot: "site.preferences"
        delegate: Component {
            Row {
                spacing: Theme.xxs

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
                    x: Theme.gutterWide
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
                    x: Theme.l
                    y: Theme.xxl
                    width: parent.width - Theme.l - Theme.gutterWide
                    router: siteRouter
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

    // The shells the site ships. Marketing, the one every page is
    // written in, is given the site here; the others come when first
    // picked (Shells/later.js) and, as a shell the reader wrote, are
    // given it once they are in.
    Component {
        id: marketingShell
        Marketing {
            site: main
        }
    }

    ShellLoader {
        id: loader
        width: main.width
        height: main.height
        source: main.userShell ?? (main.framed === "workbench" ? Later.workbench : main.framed === "desktop" ? Later.desktop : marketingShell)
        // A shell that does not work gives way to the one every page is
        // written in, and says why (Site/ShellSource.qml shows it).
        fallback: marketingShell

        onItemChanged: {
            if (!loader.item)
                return;
            if ("site" in loader.item && loader.item.site !== main)
                loader.item.site = main;
            main.letGo();
            if (fadeIn.armed) {
                fadeIn.armed = false;
                fadeIn.target = loader.item;
                fadeIn.restart();
            }
            if (main.revealing) {
                main.revealing = false;
                Qt.callLater(Frames.shown);
            }
            Qt.callLater(main.count);
        }
    }

    // The Observer a stage's toolbar opens, over whichever shell is
    // shown: from the page's top to its foot, docked along the right of
    // the window or a sheet across it, and leaving what the shell puts
    // left of the page (a sidebar, a tree) where it is.
    ObserverDock {
        id: observerDock
        z: 4
        y: main.pageTop
        room: main.width
        roomHeight: main.pageHeight
        beside: main.pageLeft
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
    Connections {
        target: shellSource.item
        function onApplied(file, text) {
            main.userShell = Frames.compiled(file, text);
        }
        function onReset() {
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
