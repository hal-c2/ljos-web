.pragma library
// In the browser each is a function giving import() of its module, so
// it is fetched only when first asked for. Ljós on the desktop (`mise run
// site:native`) has no import() of a QML file yet, so there each is its
// file's address, which a Loader makes as it is asked for all the same.
var browser = Qt.platform.os === "wasm";
// The address of a QML file beside this one, for the desktop, from its
// name without ".qml". The web compiler makes any QML file's name
// written out whole into an import of that file, which would put it in
// the first load of every page that imports this one.
var QML = ".qml";
function fileAt(name) { return Qt.resolvedUrl(name + QML); }
// What the site shows only once a reader asks for it, each a module of
// its own: they are drawn with Ljós's own controls, which no page's first
// load carries (tests/payload.spec.js). In the browser each is one
// function, the same each time it is asked for, so a loader is not given
// a new source on every read.
var shellChoices = browser ? function () { return import("./ShellChoices.qml"); } : fileAt("ShellChoices");
var languageChoices = browser ? function () { return import("./LanguageChoices.qml"); } : fileAt("LanguageChoices");
var shellSource = browser ? function () { return import("./ShellSource.qml"); } : fileAt("ShellSource");
var controlsLook = browser ? function () { return import("./ControlsLook.qml"); } : fileAt("ControlsLook");
// The front page, which no other page's first load carries. It is chosen
// by the address alone, the same in the prerender and the browser, so a
// page made at `/` waits for it before it is written or taken over (a
// Loader's `awaited` source), and the page as written holds it all the same.
var landing = browser ? function () { return import("./Landing.qml"); } : fileAt("Landing");
if (browser)
    landing.awaited = true;

// The showcase, which no other page's first load carries, with its apps'
// data (ShowcaseApps). It is chosen by the address alone, the same in the
// prerender and the browser, so a page made at `/showcase/` waits for it
// before it is written or taken over (a Loader's `awaited` source), and
// the page as written holds it all the same.
function showcase() { return import("./ShowcasePage.qml"); }
showcase.awaited = true;

// A pro demo's page, which no other page's first load carries: it is
// chosen by the address alone, so the page made at a pro demo's route
// waits for it, as the showcase's does. It is one module for every pro
// demo, so the page is kept from one to the next.
function proDemo() { return import("./ProDemoPage.qml"); }
proDemo.awaited = true;
function liveSource() { return import("./LiveSource.qml"); }
// What the search found: no page is written with a query typed.
function searchResults() { return import("./SearchResults.qml"); }
