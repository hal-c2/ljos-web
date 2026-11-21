import QtQuick
import Site
import Ljos.Core
import "../nav.js" as Nav

// Which page of the site is shown, and how a reader moves between them:
// the route, the reading of a docs page, the places the header names,
// and following a link. Its state is the same whichever shell shows the
// page (Shells/), so a shell only shows it and asks it to go
// (docs/adr/0003-blocks-and-shells.md, section 1: a block's contract is
// its own members).
QtObject {
    id: router

    // The route the build prerendered this page for (`/`, `/demos/`, a
    // demo's own page under it, or a docs route), and then the one shown.
    property string route: "/"
    // A docs page's own reading (its title, headings and blocks), from
    // the props the build made the route with: each page's HTML carries
    // its own, so no page loads another page's text. Null elsewhere.
    property var page: null
    // Where the page is read: the view whose scroll a reader's place is,
    // and the docs page that lands on a heading (Site/PageView.qml).
    property var view: null

    readonly property bool demosRoute: route.startsWith("/demos/")
    readonly property bool docsRoute: route !== "/" && !demosRoute
    // The pro demo this route is the page of (Demos/pro.json), or null.
    readonly property var pro: Content.pro.find((demo) => demo.route === route) ?? null
    readonly property var headings: docsRoute && page !== null && page.headings ? page.headings : []
    // The route's name, without the site's own after it: a tab's words.
    readonly property string title: nameOf(route)

    // The places the header names, with which one the reader is in.
    readonly property var sections: [
        { label: t`Docs`, to: "/start/", current: docsRoute },
        { label: t`Demos`, to: "/demos/", current: demosRoute }
    ]
    readonly property string github: "https://github.com/hal-c2/ljos-ui"

    // The site's pages as a tree: the front page, the demos and each one,
    // then the docs in their sections, for a shell that lists them all.
    readonly property var tree: [
        { label: t`Ljós`, pages: [{ route: "/", title: t`Home` }, { route: "/demos/", title: t`Demos` }].concat(Content.pro.map((demo) => ({ route: demo.route, title: demo.title }))) }
    ].concat(Content.sidebar.map((section) => ({ label: section.label, pages: section.pages })))

    // Said after each move to another page or place on it, so a shell
    // closes what the reader opened to get there (a menu).
    signal went

    function nameOf(to) {
        if (to === "/")
            return t`Home`;
        if (to === "/demos/")
            return t`Demos`;
        var demo = Content.pro.find((one) => one.route === to);
        if (demo)
            return demo.title;
        var titled = Nav.titled(Content.titles, Content.sidebar, Content.after, to);
        return titled === null ? to : titled.endsWith(Content.after) ? titled.slice(0, titled.length - Content.after.length) : titled;
    }

    // A heading's name as the page has it: an address (a link's, as the
    // markdown wrote it, or the browser's) carries what is not ASCII in
    // it percent-encoded. One that is not a valid escape is as written.
    function anchorOf(fragment) {
        try {
            return decodeURIComponent(fragment);
        } catch (error) {
            return fragment;
        }
    }

    // Goes to a route of the site's, or another site's address.
    function go(to) {
        Nav.go(Nav.at(Content.base, to));
    }

    // A link within the site, as `Nav.at` writes it: a heading on this
    // page is landed on without leaving it; anything else is gone to.
    function follow(href) {
        var hash = href.indexOf("#");
        var to = hash >= 0 ? href.slice(0, hash) : href;
        if (hash >= 0 && router.docsRoute && router.view && (to === "" || to === Nav.at(Content.base, router.route))) {
            router.went();
            router.view.land(router.anchorOf(href.slice(hash + 1)));
            return;
        }
        Nav.go(href);
    }

    // A route shown in place (Nav.follow), with its page's reading: at
    // `offset` when going back or forward to it, else at its fragment,
    // else at the top, as a page the browser loads.
    function show(to, fragment, offset, reading) {
        router.page = reading;
        if (to !== router.route)
            router.route = to;
        router.went();
        if (!router.view)
            return;
        if (typeof offset === "number") {
            router.view.restore(offset);
        } else if (fragment) {
            var anchor = router.anchorOf(fragment.slice(1));
            Qt.callLater(() => router.view.land(anchor));
        } else {
            router.view.top();
        }
    }

    function start() {
        Nav.follow(Content.base, {
            title: (to) => Nav.titled(Content.titles, Content.sidebar, Content.after, to),
            // A docs page's reading stands beside its HTML (the build's
            // page.json); the front page and the demos need none.
            reading: (to) => to === "/" || to.startsWith("/demos/") ? null : Nav.at(Content.base, to) + "page.json",
            page: () => router.page,
            show: (to, fragment, offset, reading) => router.show(to, fragment, offset, reading),
            offset: () => router.view ? router.view.offset : 0
        });
    }
}
