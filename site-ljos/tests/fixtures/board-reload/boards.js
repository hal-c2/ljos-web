.pragma library
// The board's module as it now stands: each version is a module of the
// build, and the loader's source is the one function that names it.
var version = "before";

function use(next) {
    version = next;
}

function current() {
    switch (version) {
    case "after": return import("./BoardAfter.qml");
    case "broken": return import("./BoardBroken.qml");
    }
    return import("./BoardBefore.qml");
}
