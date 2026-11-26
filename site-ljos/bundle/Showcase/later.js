.pragma library
// A showcase recording, imported once one is to play
// (Site/ShowcaseApp.qml's `source`), and an engine's example that runs in
// the page, with its files for the editor, imported once the reader runs
// or opens it (Site/ShowcaseEngine.qml). Not in a qmldir: what plays a
// video, or a world and its engine, would then be in the files every page
// loads first.

function recording() { return import("./Recording.qml"); }

function example(name) {
    switch (name) {
        case "snail-post": return import("./SnailPostDemo.qml");
    }
    throw new Error("no showcase example " + name);
}

function project(name) {
    switch (name) {
        case "snail-post": return import("./snail-post-project.json");
    }
    throw new Error("no showcase example " + name);
}
