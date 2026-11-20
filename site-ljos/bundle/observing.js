.pragma library
// The Observer a stage's toolbar opens: one for the page, on the app
// that toolbar's stage runs, in the dock the shell holds
// (Site/ObserverDock.qml). A toolbar asks for it by its stage's key; the
// dock shows what was asked last, and each toolbar's Observer button
// follows whether it is its own. Nothing of the Observer is fetched
// until a reader opens it: `panel` imports it then.

// The dock, once the shell has made it.
var dock = null;
// What is shown, or null: { key, target, logs, title }.
var shown = null;
var watchers = [];
var made = 0;

// A key for a stage that has none of its own (a demo's frame).
function keyFor(what) {
    made += 1;
    return what + "#" + made;
}

function attach(made) {
    dock = made;
    if (shown)
        dock.show(shown);
}

function detach(made) {
    if (dock === made)
        dock = null;
}

function isShown(key) {
    return shown !== null && shown.key === key;
}

// Opens the Observer on `target`: `logs` is what it was heard saying
// (observed.js's `logSource`), `title` what it is called.
function open(key, target, logs, title) {
    shown = { key: key, target: target, logs: logs, title: title };
    if (dock)
        dock.show(shown);
    tell();
}

// The stage's app was made again (an edit, a reload): the Observer
// follows the new one, as a reload. Gone (stopped), the Observer closes.
function retarget(key, target) {
    if (!isShown(key))
        return;
    if (!target)
        return close(key);
    shown = { key: key, target: target, logs: shown.logs, title: shown.title };
    if (dock)
        dock.show(shown);
}

// Closes it, if it is `key`'s (or whichever is shown, with none).
function close(key) {
    if (shown === null || (key && shown.key !== key))
        return;
    shown = null;
    if (dock)
        dock.hide();
    tell();
}

function toggle(key, target, logs, title) {
    if (isShown(key))
        close(key);
    else
        open(key, target, logs, title);
}

function watch(fn) {
    watchers.push(fn);
}

function unwatch(fn) {
    watchers = watchers.filter(function (each) {
        return each !== fn;
    });
}

function tell() {
    watchers.slice().forEach(function (fn) {
        fn();
    });
}

// The Observer itself, as a Loader's source: a chunk of its own.
function panel() {
    return import("ljos-web/observer/ObserverPanel.qml");
}
