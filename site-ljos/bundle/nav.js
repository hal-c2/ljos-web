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
// for; `show(route, fragment, offset)` shows it, scrolled to `offset`
// when one is given, else to the fragment, else to the top; and
// `offset()` is how far down the page shown is scrolled.
//
// Back and forward come to a page where the reader left it, as with
// the browser's own pages. Each entry of the history the shell shows
// has a name in its state; the offset it was left at is kept by that
// name, and written into the entry's state too when going on from it,
// so it is still known once the page is loaded again.
var entry = null;
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
    entry = state && state.entry ? state.entry : named();
    if (!state || state.entry !== entry)
        history.replaceState({ entry: entry, offset: state && typeof state.offset === "number" ? state.offset : 0 }, "");
    globalThis.addEventListener("popstate", function (event) {
        var location = globalThis.location;
        var route = routeOf(new URL(location.href));
        var title = titleOf(route);
        if (title === null) {
            location.reload();
            return;
        }
        offsets[entry] = shell.offset();
        var state = event.state;
        entry = state && state.entry ? state.entry : named();
        var offset = entry in offsets ? offsets[entry] : state && typeof state.offset === "number" ? state.offset : null;
        shell.show(route, location.hash, offset);
        globalThis.document.title = title;
    });
}

// Go to an address, as `at` writes it (the base already in it): its
// entry is pushed first, the page shown after, as on going back.
function go(address) {
    var location = globalThis.location;
    var url = new URL(address, location.href);
    var route = shell ? routeOf(url) : null;
    var title = titleOf(route);
    if (title === null) {
        location.href = url.href;
        return;
    }
    var history = globalThis.history;
    var offset = shell.offset();
    offsets[entry] = offset;
    history.replaceState({ entry: entry, offset: offset }, "");
    if (url.href !== location.href) {
        entry = named();
        history.pushState({ entry: entry }, "", url.href);
    }
    shell.show(route, url.hash, null);
    globalThis.document.title = title;
}
