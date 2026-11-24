.pragma library
// later.js as the desktop runs it (`mise run site:native`, host.js says
// how it stands in its place): Ljós on the desktop has no import() of a
// QML file yet, so each is its file's address, which a Loader makes as it
// is asked for all the same.
var shellChoices = Qt.resolvedUrl("ShellChoices.qml");
var languageChoices = Qt.resolvedUrl("LanguageChoices.qml");
var shellSource = Qt.resolvedUrl("ShellSource.qml");
var controlsLook = Qt.resolvedUrl("ControlsLook.qml");
var landing = Qt.resolvedUrl("Landing.qml");
var showcase = Qt.resolvedUrl("ShowcasePage.qml");
var liveSource = Qt.resolvedUrl("LiveSource.qml");
