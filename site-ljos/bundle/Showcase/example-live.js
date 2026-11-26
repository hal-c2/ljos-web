.pragma library
.import "../live.js" as Live
.import "later.js" as Later
.import "../host.js" as Host

// What the showcase compiles an engine's example with as the reader
// edits it (Site/ShowcaseEngine.qml): the page's own compiler (live.js,
// fetched with the first edit) over the example's files, the one the
// reader changed as they left it. The project is the example's QML and
// the engine's beside it (<name>-project.json, written by the build), so
// an edit is checked against the engine it runs on. Each example keeps
// its own, by name.

var held = {};
function example(name) {
    if (!held[name])
        held[name] = { project: null, own: { inspected: null } };
    return held[name];
}

// The files, with their highlighting, imported when the reader first
// opens the editor or runs the example, so nothing else loads them.
async function load(name) {
    const state = example(name);
    if (!state.project)
        state.project = (await Later.project(name)).default;
    return state.project;
}

// The example as `edits` ({ path: text }) make it from `entry`: a
// function a Loader's source takes, or an Error saying what broke and
// where, with what was said of each file as its `diagnostics`.
async function compile(name, entry, edits) {
    const state = example(name);
    const files = {};
    for (const file of (await load(name)).files)
        files[file.path] = Object.hasOwn(edits, file.path) ? edits[file.path] : file.code;
    const made = await (await Live.compileWith(state.own))({ files: files, entry: entry, base: globalThis.location.href });
    if (made.diagnostics) {
        const said = {};
        made.diagnostics.forEach(function (d) {
            const file = d.file || entry;
            if (d.line)
                (said[file] = said[file] || []).push(d);
        });
        const error = new Error(made.diagnostics.map(function (d) {
            return (d.file || entry) + (d.line ? ":" + d.line + ":" + (d.column || 1) : "") + ": " + d.message;
        }).join("\n"));
        error.diagnostics = said;
        throw error;
    }
    const component = made.component;
    return function () {
        return Promise.resolve({ "default": component });
    };
}

// The example's frame, for a Loader's source: imported when it is first
// run; on the desktop, its file's address (later.native.js).
function app(name) {
    if (Host.desktop)
        return Later.example(name);
    return function () {
        return Later.example(name);
    };
}

// "" where the compiler can run; else the sentence the editor shows.
function needsWasm() {
    return Live.needsWasm();
}

// What the compiler said of `path` in an error `compile` gave, for the
// editor's squiggles.
function diagnosticsOf(error, path) {
    const said = error && error.diagnostics;
    return (said && said[path]) || [];
}
