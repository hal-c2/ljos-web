.pragma library
.import "../live.js" as Live
.import "pro-later.js" as Later

// What a pro demo's page compiles its editor's files with: the page's
// own compiler (live.js, fetched with the first edit) over the demo's
// files, each as the reader left it. The project is every QML and
// TypeScript file of the demo, so an edit is checked against the files
// it runs beside; `base` is where the build put those files as they are
// (demos/<name>/source/), so what an edit does not hold — a model, a
// picture — is read from there. Each demo keeps its own, by name.

var held = {};
function demo(name) {
    if (!held[name])
        // `own` is where live.js keeps the compiler it makes for this
        // demo, as it keeps one on each live block's example: made with
        // the first edit, with all of the page's modules.
        held[name] = { project: null, own: { inspected: null } };
    return held[name];
}

// The files, with their highlighting (<name>-project.json, written by
// the build), imported when the page is made so no other page loads them.
async function load(name) {
    const state = demo(name);
    if (!state.project)
        state.project = (await Later.project(name)).default;
    return state.project;
}

// The demo as `edits` ({ path: text }) make it from `entry`, at `base`:
// a function a Loader's source takes, or an Error saying what broke
// and where, with what was said of each file as its `diagnostics`
// ({ path: [diagnostic] }). Those go with the error to the page, which
// keeps them only for the edits they are of: kept here, a compile that
// lands after its edits were set back would bring them back.
async function compile(name, entry, edits, base) {
    const state = demo(name);
    const files = {};
    for (const file of (await load(name)).files)
        files[file.path] = Object.hasOwn(edits, file.path) ? edits[file.path] : file.code;
    const made = await (await Live.compileWith(state.own))({ files: files, entry: entry, base: new URL(base, globalThis.location.href).href });
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

// The demo's app, for a Loader's source: imported when it is first run.
function app(name) {
    // On the desktop, its file's address (pro-later.js).
    if (Qt.platform.os !== "wasm")
        return Later.app(name);
    return function () {
        return Later.app(name);
    };
}

// "" where the compiler can run; else the sentence the page shows.
function needsWasm() {
    return Live.needsWasm();
}
