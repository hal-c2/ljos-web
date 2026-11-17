.pragma library
// What a running example shows of itself besides what it draws: the
// lines it logged, its root's own declared properties and the signals
// they fire. A value an example is about (a handler's count, a match's
// result) proves it ran; the picture alone may not. The values strip
// under each stage reads it here, and so may any page that follows a
// running app the way the Observer does: nothing here knows of a
// stage.
//
// Nothing polls. A line is kept as it is logged and the example's
// watchers are called; a declared property is read where it is shown,
// so the page's bindings follow it; a signal is connected to.

// Kept per example, most recent last: enough to follow what changed.
var KEPT = 50;
var LEVELS = ["log", "debug", "info", "warn", "error"];

var logs = {};
var watchers = {};
var inspects = {};

function lines(id) {
    return logs[id] || [];
}

function watch(id, fn) {
    (watchers[id] = watchers[id] || []).push(fn);
}

function unwatch(id, fn) {
    var list = watchers[id];
    if (list)
        watchers[id] = list.filter(function (each) {
            return each !== fn;
        });
}

function tell(id) {
    (watchers[id] || []).slice().forEach(function (fn) {
        fn(lines(id));
    });
}

// An example that has gone (its block with it): its lines, watchers and
// console go too.
function forget(id) {
    delete logs[id];
    delete watchers[id];
    delete inspects[id];
}

// `level`: as console names it ("log", "warn", "signal" for one that
// fired).
function say(id, level, message) {
    var kept = (logs[id] || []).concat([{ level: level, message: message }]);
    logs[id] = kept.length > KEPT ? kept.slice(kept.length - KEPT) : kept;
    tell(id);
}

// Lines that stand for a run that has not happened here (what it said
// as the build made it), or none, as a run starts.
function reset(id, said) {
    logs[id] = (said || []).map(function (message) {
        return { level: "log", message: message };
    });
    tell(id);
}

// A value as a line shows it: as qml6 prints it, a string as it is.
// One argument only, so it can be handed to `map` as it is.
function show(value) {
    return showWithin(value, []);
}

// `within`: the arrays `value` is inside of, so one that holds itself
// is said to, not followed for ever (the log it is in must still
// print).
function showWithin(value, within) {
    if (typeof value === "string")
        return value;
    if (value === undefined)
        return "undefined";
    if (value === null)
        return "null";
    if (typeof value === "function")
        return "function";
    if (Array.isArray(value)) {
        if (within.indexOf(value) >= 0)
            return "[circular]";
        var inside = within.concat([value]);
        return "[" + value.map(function (item) {
            return showWithin(item, inside);
        }).join(", ") + "]";
    }
    try {
        return String(value);
    } catch (e) {
        return Object.prototype.toString.call(value);
    }
}

// `ljos-web/inspect` as an example compiled with `inspect` sees it:
// the page's, with a console whose lines are also the example's. One
// per example, so the compiler bridges it once (its bridges are kept
// per namespace).
function inspectFor(id, namespace) {
    if (!inspects[id]) {
        var own = Object.assign({}, namespace);
        own.$console = function (place) {
            var placed = namespace.$console(place);
            var mine = Object.create(placed);
            LEVELS.forEach(function (name) {
                mine[name] = function () {
                    var args = Array.prototype.slice.call(arguments);
                    say(id, name, args.map(show).join(" "));
                    return placed[name].apply(placed, args);
                };
            });
            return mine;
        };
        inspects[id] = own;
    }
    return inspects[id];
}

// What the root declares of its own, by name: `property int count` and
// `signal hit(int n)`, from every file that made it (a root that is a
// component of the example's declares that component's too).
function declared(root) {
    var properties = [];
    var signals = [];
    var props = root && root.$props;
    if (!props)
        return { properties: properties, signals: signals };
    var levels = props.$levels || [props];
    levels.forEach(function (level) {
        [].concat(level.$declare || []).forEach(function (declare) {
            Object.keys(declare.properties || {}).forEach(function (name) {
                if (properties.indexOf(name) < 0)
                    properties.push(name);
            });
            (declare.signals || []).forEach(function (name) {
                if (signals.indexOf(name) < 0)
                    signals.push(name);
            });
        });
    });
    return { properties: properties, signals: signals };
}

// What the example writes on its root, by name (`width: 120`,
// `objectName: "panel"`, `title: "Window"`), from the file that made
// it: for a root that declares nothing of its own, what it was given
// is what it is about, and what the reader sees of a root that draws
// nothing. Handlers, attached and grouped properties, and the
// objects it holds are not values to show.
var HANDLER = /^(\w+\$)?on[A-Z_]/;
var HELD = ["children", "data", "resources", "states", "transitions", "contentItem", "contentData"];

function written(root) {
    var props = root && root.$props;
    if (!props)
        return [];
    // Who gave what, the type's own files first: the example's is the
    // last that writes anything.
    var levels = props.$levels || [props];
    var keep = function (name) {
        if (name.charAt(0) === "$" || name.indexOf("$") >= 0 || HANDLER.test(name) || HELD.indexOf(name) >= 0 || !(name in root))
            return false;
        var value = root[name];
        if (value && typeof value === "object" && value.$props)
            return false;
        return value === null || typeof value !== "object" || Array.isArray(value) || (typeof value.toString === "function" && value.toString !== Object.prototype.toString);
    };
    for (var i = levels.length - 1; i >= 0; i--) {
        var names = Object.keys(levels[i]).filter(keep);
        if (names.length > 0)
            return names;
    }
    return [];
}

// What the strip names: the root's own declared properties, or, when
// it declares none, what it was written with.
function shown(root) {
    var own = declared(root).properties;
    return own.length > 0 ? own : written(root);
}

// Each of the root's own signals, as it fires, a line: `hit(3)`. What
// it returns disconnects them.
function connectSignals(id, root) {
    var made = declared(root).signals.map(function (name) {
        var signal = root[name];
        if (!signal || typeof signal.connect !== "function")
            return null;
        var fn = function () {
            say(id, "signal", name + "(" + Array.prototype.slice.call(arguments).map(show).join(", ") + ")");
        };
        signal.connect(fn);
        return function () {
            signal.disconnect(fn);
        };
    }).filter(function (each) {
        return each !== null;
    });
    return function () {
        made.forEach(function (disconnect) {
            disconnect();
        });
    };
}
