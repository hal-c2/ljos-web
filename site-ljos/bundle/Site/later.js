.pragma library
// What the site shows only once a reader asks for it, each a module of
// its own: they are drawn with Ljós's own controls, which no page's first
// load carries (tests/payload.spec.js). Each is one function, the same
// each time it is asked for, so a loader is not given a new source on
// every read.
function shellChoices() { return import("./ShellChoices.qml"); }
function languageChoices() { return import("./LanguageChoices.qml"); }
function shellSource() { return import("./ShellSource.qml"); }
function controlsLook() { return import("./ControlsLook.qml"); }
// The front page, which no other page's first load carries. It is chosen
// by the address alone, the same in the prerender and the browser, so a
// page made at `/` waits for it before it is written or taken over (a
// Loader's `awaited` source), and the page as written holds it all the same.
function landing() { return import("./Landing.qml"); }
landing.awaited = true;

// The showcase, which no other page's first load carries, with its apps'
// data (ShowcaseApps). It is chosen by the address alone, the same in the
// prerender and the browser, so a page made at `/showcase/` waits for it
// before it is written or taken over (a Loader's `awaited` source), and
// the page as written holds it all the same.
function showcase() { return import("./ShowcasePage.qml"); }
showcase.awaited = true;
function liveSource() { return import("./LiveSource.qml"); }
