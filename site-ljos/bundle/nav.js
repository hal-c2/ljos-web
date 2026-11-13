.pragma library
// Going to another page of the site is going there: each route is
// its own prerendered page, so a press is a plain navigation, in the
// same tab, to the address the link names. A library script, so the
// page's own globals are the browser's.
//
// The site names its routes from its own root ("/start/"), and the
// site may stand below the address's root (a project's github.io
// pages): such a route goes that far down, as the build wrote in the
// page's head. Any other link (another site, a fragment) goes as it is.
function go(href) {
    globalThis.location.href = within(href);
}

function within(href) {
    if (href.charAt(0) !== "/" || href.charAt(1) === "/")
        return href;
    var named = globalThis.document ? globalThis.document.querySelector('meta[name="ljos-base"]') : null;
    var base = named ? named.getAttribute("content") : "/";
    return base.slice(0, -1) + href;
}

// Words put into rich text as words, never as markup.
function escape(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// A link as rich text: a real `<a href>`, so a crawler, "open in a
// new tab" and a screen reader's list of links all find it.
function anchor(href, label, underline) {
    return "<a href=\"" + escape(href) + "\" style=\"text-decoration:" + (underline ? "underline" : "none") + "\">" + escape(label) + "</a>";
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
