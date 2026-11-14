.pragma library
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
