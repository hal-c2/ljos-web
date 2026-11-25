.pragma library
// The live demos, each imported once a frame asks for one
// (Site/DemoFrame.qml's `source`). They are not in this directory's
// qmldir: a module brings every type it lists into each page that
// imports it, and what these draw with (the 3D scene's renderer, a
// shader's) would then be in the files every page loads first.

function orbit() { return import("./Orbit.qml"); }
function watch() { return import("./WatchDemo.qml"); }
function shader() { return import("./Shader.qml"); }
function fieldGuide() { return import("./FieldGuide.qml"); }
function motion() { return import("./Motion.qml"); }
function lottie() { return import("./Lottie.qml"); }
function agent() { return import("./AgentStage.qml"); }
// What the replay asks the card through. By its path, as the Observer is
// (observing.js): its types are ljos-web's alone.
function inspectorSession() { return import("ljos-web/observer/InspectorSession.qml"); }
