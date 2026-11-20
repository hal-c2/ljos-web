.pragma library
// What the site shows only once a reader asks for it, each a module of
// its own: they are drawn with Ljós's own controls, which no page's first
// load carries (tests/payload.spec.js). Each is one function, the same
// each time it is asked for, so a loader is not given a new source on
// every read.
function shellChoices() { return import("./ShellChoices.qml"); }
function shellSource() { return import("./ShellSource.qml"); }
function controlsLook() { return import("./ControlsLook.qml"); }
