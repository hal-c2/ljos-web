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
