.pragma library
// later.js as the desktop runs it (`mise run site:native`, host.js says
// how it stands in its place): Ljós on the desktop has no import() of a
// QML file yet, so each is its file's address, which a Loader makes as it
// is asked for all the same.
var cyberpunk = Qt.resolvedUrl("Cyberpunk.qml");
var workbench = Qt.resolvedUrl("Workbench.qml");
var desktop = Qt.resolvedUrl("Desktop.qml");
