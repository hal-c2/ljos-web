.pragma library
// Going to another page of the site. Each route is its own
// prerendered page, and each link of the shell is an `a` with the
// page's address (the runtime makes an item whose role is a link
// one), so a reader with no script, a crawler, a middle press and a
// press with a modifier all go by the address, as on any page. A
// plain press in a browser running the shell shows the route in the
// shell it is already in, with the address and the history kept, so
// the page is not fetched and started again. A library script, so the
// page's own globals are the browser's.
//
// The site names its routes from its own root ("/start/"), and the
// site may stand below the address's root (a project's github.io
// pages): such a route goes that far down. The base is the build's,
// written into the shell's `Content`, so a prerender writes the same
// addresses a browser does.

var root = "/";
var shell = null;

// The address of what the site names from its root, at the base the
// site stands at; any other address (another site, a fragment) is as
// written.
function at(base, href) {
    var said = String(href);
    if (said.charAt(0) !== "/" || said.charAt(1) === "/")
        return said;
    return base.slice(0, -1) + said;
}

// Rich text whose links the site names from its root, at the base.
function linked(base, html) {
    return String(html).replace(/href="\/(?!\/)/g, 'href="' + base);
}

// The route an address of this site names, or null when it is not one
// of this site's: another origin, or outside the base.
function routeOf(url) {
    var location = globalThis.location;
    if (url.origin !== location.origin || url.search !== "" || url.pathname.indexOf(root) !== 0)
        return null;
    return "/" + url.pathname.slice(root.length);
}

// The title of the page a route is, or null for a route the shell has
// no page for (which is then fetched).
function titleOf(route) {
    return route === null ? null : shell.title(route);
}

// The shell, standing in a browser, says how it shows a route:
// `title(route)` names its page, or gives null for one it has none
// for; `reading(route)` is the address of what that page reads, or
// null for a page that reads nothing; `page()` is what the page shown
// now read; `show(route, fragment, offset, reading)` shows a route
// with its reading, scrolled to `offset` when one is given, else to
// the fragment, else to the top; and `offset()` is how far down the
// page shown is scrolled.
//
// Each page's HTML holds its own reading and no other page's, so a
// page shown in place is read from the server first, once; a page
// whose reading cannot be had is loaded as any page is.
var readings = {};
// The last way the reader asked to go: an answer for an earlier one,
// come late, shows nothing.
var asked = 0;

function readingOf(route) {
    var address = shell.reading(route);
    if (address === null)
        return Promise.resolve(null);
    if (!(address in readings)) {
        readings[address] = globalThis.fetch(address).then(function (response) {
            if (!response.ok)
                throw new Error(address + ": " + response.status);
            return response.json();
        });
        readings[address].catch(function () {
            delete readings[address];
        });
    }
    return readings[address];
}
//
// Back and forward come to a page where the reader left it, as with
// the browser's own pages. Each entry of the history the shell shows
// has a name in its state; the offset it was left at is kept by that
// name, and written into the entry's state too when going on from it
// or once the reader stops moving the page (`keep`), so it is still
// known once the page is loaded again. `entry` is the entry whose page is shown; `current` the one
// the browser is at, which is ahead of it while a page gone back or
// forward to is still being read.
var entry = null;
var current = null;
var offsets = {};
var made = 0;

function named() {
    made += 1;
    return Date.now() + "." + made;
}

function follow(base, given) {
    root = base;
    if (!globalThis.history || typeof globalThis.addEventListener !== "function")
        return;
    shell = given;
    var history = globalThis.history;
    history.scrollRestoration = "manual";
    var state = history.state;
    var left = state && typeof state.offset === "number" ? state.offset : null;
    entry = current = state && state.entry ? state.entry : named();
    if (!state || state.entry !== entry)
        history.replaceState({ entry: entry, offset: left === null ? 0 : left }, "");
    var here = routeOf(new URL(globalThis.location.href));
    var address = here === null ? null : shell.reading(here);
    if (address !== null && shell.page())
        readings[address] = Promise.resolve(shell.page());
    // A page loaded again (a reload, or back to it from another site)
    // is where the reader left it; one opened at a fragment is at its
    // heading, as the browser would scroll an element with that id.
    var hash = globalThis.location.hash;
    if (here !== null && (left || hash))
        shell.show(here, hash, left || null, shell.page());
    globalThis.addEventListener("popstate", function (event) {
        var location = globalThis.location;
        var route = routeOf(new URL(location.href));
        var title = titleOf(route);
        if (title === null) {
            location.reload();
            return;
        }
        // The page still shown is the one left, though another entry
        // may have been gone to while it was being read.
        offsets[entry] = shell.offset();
        var state = event.state;
        var to = state && state.entry ? state.entry : named();
        current = to;
        var offset = to in offsets ? offsets[to] : state && typeof state.offset === "number" ? state.offset : null;
        var hash = location.hash;
        var mine = ++asked;
        readingOf(route).then(
            function (reading) {
                if (mine !== asked)
                    return;
                entry = to;
                shell.show(route, hash, offset, reading);
                globalThis.document.title = title;
            },
            function () {
                if (mine === asked)
                    location.reload();
            },
        );
    });
}

// The page shown has come to rest where the reader moved it: its entry
// keeps that offset, so the page loaded again is there. Kept as it
// stops, not as the page is left: what a page writes into its history
// as it is unloaded is not kept by every browser.
function keep() {
    if (shell && current === entry)
        globalThis.history.replaceState({ entry: entry, offset: shell.offset() }, "");
}

// The title a route's page gives the tab: one of the site's own pages
// is named in `own`; a docs page as the sidebar names it, and `after`
// it; null for a route the site has no page for.
function titled(own, sidebar, after, route) {
    if (own[route] !== undefined)
        return own[route];
    for (var i = 0; i < sidebar.length; i++) {
        var pages = sidebar[i].pages;
        for (var j = 0; j < pages.length; j++) {
            if (pages[j].route === route)
                return pages[j].title + after;
        }
    }
    return null;
}

// Go to an address, as `at` writes it (the base already in it): once
// its page's reading is had, its entry is pushed first and the page
// shown after, as on going back.
function go(address) {
    var location = globalThis.location;
    var url = new URL(address, location.href);
    var route = shell ? routeOf(url) : null;
    var title = titleOf(route);
    if (title === null) {
        location.href = url.href;
        return;
    }
    var mine = ++asked;
    readingOf(route).then(
        function (reading) {
            if (mine !== asked)
                return;
            var history = globalThis.history;
            var offset = shell.offset();
            offsets[entry] = offset;
            // The entry the browser is at keeps the offset only when its
            // page is the one shown: one gone back to and not yet read
            // keeps its own.
            if (current === entry)
                history.replaceState({ entry: entry, offset: offset }, "");
            if (url.href !== location.href || current !== entry) {
                entry = current = named();
                history.pushState({ entry: entry }, "", url.href);
            }
            shell.show(route, url.hash, null, reading);
            globalThis.document.title = title;
        },
        function () {
            if (mine === asked)
                location.href = url.href;
        },
    );
}

// A file named from the site's root ("/favicon.svg"), as the page at
// `route` reaches it: back up the route's depth, then down. Written so
// in the HTML the build makes, it stands below any base the site is
// put at, though the build names the base only once it has written the
// page.
function fromPage(route, href) {
    var depth = String(route).split("/").filter(function (part) { return part !== ""; }).length;
    var up = "";
    for (var i = 0; i < depth; ++i)
        up += "../";
    return up + href.slice(1);
}

// A picture in rich text: written into the HTML the build makes, it is
// drawn by the browser itself, before any script runs or where none
// does. An Image paints only once its page runs.
function picture(route, href, width, height, alt) {
    return "<img src=\"" + escape(fromPage(route, href)) + "\" width=\"" + Math.round(width) + "\" height=\"" + Math.round(height) + "\" alt=\"" + escape(alt) + "\">";
}

// Words put into rich text as words, never as markup.
function escape(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// A link as rich text: a real `<a href>`, so a crawler, "open in a
// new tab" and a screen reader's list of links all find it. Its address
// is as `at` writes it, the base already in it.
function anchor(address, label, underline) {
    return "<a href=\"" + escape(address) + "\" style=\"text-decoration:" + (underline ? "underline" : "none") + "\">" + escape(label) + "</a>";
}

// Whether this is a reader's browser, not the build writing the page:
// what only a reader's browser can run (a GPU view, wasm) is made in
// the browser, after the page it hydrates is the page the build wrote.
function inBrowser() {
    var agent = globalThis.navigator ? String(globalThis.navigator.userAgent) : "";
    return agent !== "" && agent.indexOf("ljos-web prerender") < 0;
}

// What a demo needs that a browser may not have.
function canRun(needs) {
    if (!inBrowser())
        return false;
    if (needs.indexOf("wasm") >= 0 && typeof globalThis.WebAssembly !== "object")
        return false;
    if (needs.indexOf("webgpu") >= 0 && !(globalThis.navigator && globalThis.navigator.gpu))
        return false;
    // That the browser offers it, not that a context is to be had: making
    // one to ask would cost a GPU context for a demo never scrolled to. A
    // demo that gets none keeps its picture (DemoFrame).
    if (needs.indexOf("webgl2") >= 0 && (typeof globalThis.WebGL2RenderingContext !== "function" || typeof globalThis.OffscreenCanvas !== "function"))
        return false;
    return true;
}

// What the site search finds: page titles first, then the headings on
// them, each word of the query somewhere in what it matches.
function search(pages, query, limit) {
    var words = String(query).toLowerCase().split(/\s+/).filter(function (w) { return w.length > 0; });
    if (words.length === 0)
        return [];
    var has = function (text) {
        var low = String(text).toLowerCase();
        return words.every(function (w) { return low.indexOf(w) >= 0; });
    };
    var found = [];
    for (var i = 0; i < pages.length; i++) {
        var page = pages[i];
        if (has(page.title))
            found.push({ title: page.title, where: "", href: page.route, rank: String(page.title).toLowerCase().indexOf(words[0]) === 0 ? 0 : 1 });
    }
    for (var j = 0; j < pages.length && found.length < limit * 3; j++) {
        var headings = pages[j].headings || [];
        for (var k = 0; k < headings.length; k++) {
            if (has(headings[k].plain))
                found.push({ title: headings[k].plain, where: pages[j].title, href: pages[j].route + "#" + headings[k].anchor, rank: 2 });
        }
    }
    found.sort(function (a, b) { return a.rank - b.rank; });
    return found.slice(0, limit);
}
