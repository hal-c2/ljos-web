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
