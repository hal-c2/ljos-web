.pragma library
.import "../nav.js" as Nav
// How the showcase's recordings and captures are named in its page. Only
// the showcase's module imports this, so no other page's first load
// carries it (tests/payload.spec.js).

// A picture in rich text in the formats it is kept in: AVIF, then WebP,
// then a PNG for a browser with neither. `href` names it from the
// site's root without its extension. One lower on the page than the
// reader first sees (`soon` false) is fetched only as it nears the
// view; each is sized as written, so nothing moves as it comes.
function pictureSet(route, href, width, height, alt, soon) {
    var at = Nav.escape(Nav.fromPage(route, href));
    return "<picture><source type=\"image/avif\" srcset=\"" + at + ".avif\"><source type=\"image/webp\" srcset=\"" + at + ".webp\">" +
        "<img src=\"" + at + ".png\" width=\"" + Math.round(width) + "\" height=\"" + Math.round(height) + "\" alt=\"" + Nav.escape(alt) + "\" loading=\"" + (soon ? "eager" : "lazy") + "\" decoding=\"async\"></picture>";
}

// The file a recording is played from in this browser: WebM (VP9) where
// it plays, the smaller and open one; MP4 (H.264) elsewhere, as Safari
// on an older iPhone.
function recordingFormat() {
    var document = globalThis.document;
    var probe = document ? document.createElement("video") : null;
    return probe && probe.canPlayType && probe.canPlayType("video/webm; codecs=\"vp9\"") !== "" ? ".webm" : ".mp4";
}
