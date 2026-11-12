.pragma library
// Going to another page of the site is going there: each route is
// its own prerendered page, so a press is a plain navigation, in the
// same tab, to the address the link names. A library script, so the
// page's own globals are the browser's.
function go(href) {
    globalThis.location.href = href;
}
