.pragma library
// later.js as the desktop runs it (`mise run site:native`, host.js says
// how it stands in its place): Ljós on the desktop has no import() of a
// QML file yet, so each is its file's address, which a Loader makes as it
// is asked for all the same.
var orbit = Qt.resolvedUrl("Orbit.qml");
var watch = Qt.resolvedUrl("WatchDemo.qml");
var shader = Qt.resolvedUrl("Shader.qml");
var fieldGuide = Qt.resolvedUrl("FieldGuide.qml");
var motion = Qt.resolvedUrl("Motion.qml");
var lottie = Qt.resolvedUrl("Lottie.qml");
var agent = Qt.resolvedUrl("AgentStage.qml");
// The replay's card is ljos-web's alone (observing.js), so on the desktop
// there is none and the replay stays at its end result.
var inspectorSession = undefined;
