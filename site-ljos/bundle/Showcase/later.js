.pragma library
// A showcase recording, imported once one is to play
// (Site/ShowcaseApp.qml's `source`). Not in a qmldir: what plays a
// video would then be in the files every page loads first.

function recording() { return import("./Recording.qml"); }
