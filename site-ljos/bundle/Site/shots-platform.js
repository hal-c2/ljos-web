.pragma library

// What shots.ts asks of the browser that Ljós's checker has no types for:
// dates, query encoding and a fetch that takes `cache`. Calls alone, each
// typed in shots-platform.d.ts; what to do with them is shots.ts's.
var DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
var TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });

function timeOf(iso) {
    return Date.parse(iso);
}

function dayText(at) {
    return DAY.format(at);
}

function timeText(at) {
    return TIME.format(at);
}

function queryText(fields) {
    return new URLSearchParams(fields).toString();
}

// The browser's own fetch: a bare `fetch` in a script is QML's, which
// takes no `cache`.
function uncached(address) {
    return globalThis.fetch(address, { cache: "no-cache" });
}
