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

// The framework review, which no other page's first load carries, with
// its numbers, code and words (ReviewBuilt). Chosen by the address alone,
// as the showcase is, so the page made at `/review/` waits for it.
function review() { return import("./ReviewPage.qml"); }
review.awaited = true;

// The demos page, which no other page's first load carries: the Pantry
// and the demos it shows are the front page's too, which a docs page has
// no use for. It is chosen by the address alone, so the page made at
// `/demos/` waits for it, as the front page's does.
function demosPage() { return import("./DemosPage.qml"); }
demosPage.awaited = true;

// A pro demo's page, which no other page's first load carries: it is
// chosen by the address alone, so the page made at a pro demo's route
// waits for it, as the showcase's does. It is one module for every pro
// demo, so the page is kept from one to the next.
function proDemo() { return import("./ProDemoPage.qml"); }
proDemo.awaited = true;
function liveSource() { return import("./LiveSource.qml"); }
// What the search found: no page is written with a query typed.
function searchResults() { return import("./SearchResults.qml"); }
