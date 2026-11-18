.pragma library
.import "../live.js" as Live

// What the cockpit page's editor compiles with: the page's own compiler
// (live.js, fetched with the first edit) over the cockpit's files, each
// as the reader left it. The project is every file of Demos/Cockpit, so
// an edit is checked against the files it runs beside; `base` is where
// the build put those files as they are (demos/cockpit/source/), so what
// an edit does not hold — the car's GLBs — is read from there.

var project = null;
// What the last compile said, by file: the editor's squiggles.
var said = {};

// The files, with their highlighting (cockpit-project.json, written by
// the build), imported when the page is made so no other page loads them.
async function load() {
    if (!project)
        project = (await import("./cockpit-project.json")).default;
    return project;
}

function diagnosticsFor(path) {
    return said[path] || [];
}

// The cockpit as `edits` ({ path: text }) make it, at `base`: a function
// a Loader's source takes, or an Error saying what broke and where.
async function compile(edits, base) {
    const files = {};
    for (const file of (await load()).files)
        files[file.path] = Object.hasOwn(edits, file.path) ? edits[file.path] : file.code;
    const made = await (await Live.compileWith())({ files: files, entry: "Main.qml", base: new URL(base, location.href).href });
    said = {};
    if (made.diagnostics) {
        made.diagnostics.forEach(function (d) {
            const file = d.file || "Main.qml";
            if (d.line)
                (said[file] = said[file] || []).push(d);
        });
        throw new Error(made.diagnostics.map(function (d) {
            return (d.file || "Main.qml") + (d.line ? ":" + d.line + ":" + (d.column || 1) : "") + ": " + d.message;
        }).join("\n"));
    }
    const component = made.component;
    return function () {
        return Promise.resolve({ "default": component });
    };
}

// "" where the compiler can run; else the sentence the page shows.
function needsWasm() {
    return Live.needsWasm();
}
