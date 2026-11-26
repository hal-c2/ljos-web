.pragma library
.import "../host.js" as Host
// later.js as the desktop runs it (`mise run site:native`, host.js says
// how it stands in its place): Ljós on the desktop has no import() of a
// QML file yet, so each is its file's address, which a Loader makes as it
// is asked for all the same.
var recording = Qt.resolvedUrl("Recording.qml");

function example(name) {
    switch (name) {
        case "snail-post": return Qt.resolvedUrl("SnailPostDemo.qml");
    }
    throw new Error("no showcase example " + name);
}

// As import() gives a JSON file: { default: value }.
function project(name) {
    switch (name) {
        case "snail-post": return read("snail-post-project.json");
    }
    throw new Error("no showcase example " + name);
}

function read(file) {
    return Host.desktop.read(Qt.resolvedUrl(file)).then(function (value) {
        return { "default": value };
    });
}
