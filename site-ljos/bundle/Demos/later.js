.pragma library
// The live demos, each imported once a frame asks for one
// (Site/DemoFrame.qml's `source`). They are not in this directory's
// qmldir: a module brings every type it lists into each page that
// imports it, and what these draw with (the 3D scene's renderer, a
// shader's) would then be in the files every page loads first.

function orbit() { return import("./Orbit.qml"); }
function shader() { return import("./Shader.qml"); }
function fieldGuide() { return import("./FieldGuide.qml"); }
function motion() { return import("./Motion.qml"); }
function cockpit() { return import("./CockpitDemo.qml"); }
