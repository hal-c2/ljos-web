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
var shown = null;

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

// The shell, standing in a browser, says how it shows a route: `show`
// takes the route and the fragment, and gives the page's title, or
// null for a route it has no page for (which is then fetched).
function follow(base, show) {
    root = base;
    if (!globalThis.history || typeof globalThis.addEventListener !== "function")
        return;
    shown = show;
    globalThis.history.scrollRestoration = "manual";
    globalThis.addEventListener("popstate", function () {
        var location = globalThis.location;
        var route = routeOf(new URL(location.href));
        var title = route === null ? null : shown(route, location.hash);
        if (title === null)
            location.reload();
        else
            globalThis.document.title = title;
    });
}

// Go to an address, as `at` writes it (the base already in it).
function go(address) {
    var location = globalThis.location;
    var url = new URL(address, location.href);
    var route = shown ? routeOf(url) : null;
    var title = route === null ? null : shown(route, url.hash);
    if (title === null) {
        location.href = url.href;
        return;
    }
    if (url.href !== location.href)
        globalThis.history.pushState(null, "", url.href);
    globalThis.document.title = title;
}
