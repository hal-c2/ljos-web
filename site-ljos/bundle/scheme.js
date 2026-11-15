.pragma library
// Where the reader's pick is kept. The head's script reads it before the
// body is read (assets/head.html, written in by scripts/build.mjs from
// this one name), so the page they come back to is painted in it.
var key = "ljos.dev:scheme";

// The scheme the reader picked, "light" or "dark", or "" for the
// browser's own: also where nothing can be kept, as in the build.
function picked() {
    try {
        var kept = globalThis.localStorage && globalThis.localStorage.getItem(key);
        return kept === "light" || kept === "dark" ? kept : "";
    } catch (error) {
        return "";
    }
}

// Keeps the reader's pick; a browser that keeps nothing (storage off)
// still shows it on this page.
function keep(scheme) {
    try {
        if (globalThis.localStorage)
            globalThis.localStorage.setItem(key, scheme);
    } catch (error) {
    }
}

// The scheme a reader picked, said on the page's root: the attribute the
// prerendered page and the head's colours are shown by, the browser's own
// colour-scheme (scrollbars, form controls), and the address bar's tint
// (`tint`, the scheme's canvas).
// A library script, so the page's own globals are the browser's.
function mark(scheme, tint) {
    var root = globalThis.document && globalThis.document.documentElement;
    if (!root)
        return;
    root.setAttribute("data-ljos-scheme", scheme);
    root.style.colorScheme = scheme;
    // Every theme-color: the head's say one per scheme the browser asks
    // for, and a reader's own choice wins over both.
    var tints = globalThis.document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < tints.length; i++)
        tints[i].setAttribute("content", tint);
}
