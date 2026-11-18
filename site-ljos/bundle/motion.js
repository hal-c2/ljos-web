.pragma library
// Where the reader's motion choice for this site is kept, as the scheme
// is (scheme.js): "calm", "full", or "" for the browser's own.
var key = "ljos.dev:motion";

// The choice kept, or "" where nothing is or can be kept, as in the build.
function picked() {
    try {
        var kept = globalThis.localStorage && globalThis.localStorage.getItem(key);
        return kept === "calm" || kept === "full" ? kept : "";
    } catch (error) {
        return "";
    }
}

// Keeps the choice; "" forgets it, so the browser's own is followed again.
// A browser that keeps nothing (storage off) still has it on this page.
function keep(motion) {
    try {
        if (!globalThis.localStorage)
            return;
        if (motion === "")
            globalThis.localStorage.removeItem(key);
        else
            globalThis.localStorage.setItem(key, motion);
    } catch (error) {
    }
}

// The reader's choice, said on the page's root, where the runtime reads a
// program's reduced motion from (`data-ljos-motion`): every app the site
// runs, the demos too, moves as the reader asked the site to. "" says
// none, and the browser's own is followed again.
function mark(motion) {
    var root = globalThis.document && globalThis.document.documentElement;
    if (!root)
        return;
    if (motion === "calm")
        root.setAttribute("data-ljos-motion", "reduce");
    else if (motion === "full")
        root.setAttribute("data-ljos-motion", "no-preference");
    else
        root.removeAttribute("data-ljos-motion");
}
