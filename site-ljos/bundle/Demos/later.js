.pragma library
// In the browser each is a function giving import() of its module, so
// it is fetched only when first asked for. Ljós on the desktop (`mise run
// site:native`) has no import() of a QML file yet, so there each is its
// file's address, which a Loader makes as it is asked for all the same.
var browser = Qt.platform.os === "wasm";
// The live demos, each imported once a frame asks for one
// (Site/DemoFrame.qml's `source`). They are not in this directory's
// qmldir: a module brings every type it lists into each page that
// imports it, and what these draw with (the 3D scene's renderer, a
// shader's) would then be in the files every page loads first.

var orbit = browser ? function () { return import("./Orbit.qml"); } : Qt.resolvedUrl("Orbit.qml");
var watch = browser ? function () { return import("./WatchDemo.qml"); } : Qt.resolvedUrl("WatchDemo.qml");
var shader = browser ? function () { return import("./Shader.qml"); } : Qt.resolvedUrl("Shader.qml");
var fieldGuide = browser ? function () { return import("./FieldGuide.qml"); } : Qt.resolvedUrl("FieldGuide.qml");
var motion = browser ? function () { return import("./Motion.qml"); } : Qt.resolvedUrl("Motion.qml");
var agent = browser ? function () { return import("./AgentStage.qml"); } : Qt.resolvedUrl("AgentStage.qml");
// What the replay asks the card through. By its path, as the Observer is
// (observing.js): its types are ljos-web's alone, so on the desktop there
// is none and the replay stays at its end result.
var inspectorSession = browser ? function () { return import("ljos-web/observer/InspectorSession.qml"); } : undefined;
