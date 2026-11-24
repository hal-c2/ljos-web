.pragma library
// What the Pantry demo's visitor shell compiles with: the compiler
// in the page (`ljos-web/compiler`, A15), given the page's own
// modules, as bundle/live.js gives a code block's. The project a
// shell compiles against is the edited Shell.qml over the Pantry
// blocks' files exactly as the app ships them (PantryProject,
// written by the build from bundle/Demos and bundle/Pantry), so a
// shell is checked against the contracts the app itself runs.

var project = null;
var shellText = "";
var compiler = null;
// What the last compile said of Shell.qml: the editor's squiggles.
var said = [];

function diagnostics() {
    return said;
}

function setProject(files, text) {
    project = files;
    shellText = text;
}

// Every apply sets the shell, so this is where the site's own test
// counts them: a reload the demo did not mean to make shows in the
// count the moment it starts, where a remade node would show only
// once its compile had landed. The test opts in by putting
// `__ljosTest` on the page before it loads; a visitor's page has no
// such object, and the demo records nothing and adds no global.
function setShell(text) {
    shellText = text;
    var probe = globalThis.__ljosTest;
    if (probe)
        probe.pantryApplies = (probe.pantryApplies || 0) + 1;
}

// "" where the compiler can run; else the sentence the demo shows
// instead of compiling (`ljos-web/wasm-check.js`).
// The address of a QML file beside this one, for the desktop, from its
// name without ".qml". The web compiler makes any QML file's name
// written out whole into an import of that file, which would put it in
// the first load of every page that imports this one.
var QML = ".qml";
function fileAt(name) { return Qt.resolvedUrl(name + QML); }

// The Pantry's shell, as the desktop's loader takes it.
function shellAt() {
    return fileAt("PantryShell");
}

async function needsWasm() {
    // The check alone, not the compiler: it is asked as the page is
    // made, and the compiler comes only with the first edit.
    if (Qt.platform.os !== "wasm")
        return "Live editing runs in the browser; on the desktop this is the example as it was built.";
    const made = await import("ljos-web/wasm-check");
    return made.wasmWorks() ? "" : made.NEEDS_WASM;
}

async function compileWith() {
    if (!compiler) {
        // As bundle/live.js gives a live block's: the page's own
        // modules, and Qt Quick Controls — this page is built with
        // them (ControlsHost), and a block of the Pantry's uses one.
        const made = await import("ljos-web/compiler");
        const mods = await import("ljos-web/compiler/modules");
        const modules = Object.assign({}, mods.modules, {
            "ljos-web/QtQuick/Controls": function () {
                return import("ljos-web/QtQuick/Controls");
            }
        });
        compiler = made.createCompiler({ modules: modules }).compile;
    }
    return compiler;
}

async function moduleFor() {
    const compile = await compileWith();
    const files = Object.assign({}, project, { "Shell.qml": shellText });
    // With its places, as the shell the build compiled has them: the
    // Observer's tree names a rewritten shell's blocks as it did the app's.
    const made = await compile({ files: files, entry: "Shell.qml", inspect: true });
    said = (made.diagnostics || []).filter(function (d) {
        return (d.file || "Shell.qml") === "Shell.qml" && d.line;
    });
    if (made.diagnostics) {
        throw new Error(made.diagnostics.map(function (d) {
            return d.line ? (d.file || "Shell.qml") + ":" + d.line + ":" + (d.column || 1) + ": " + d.message : (d.file || "Shell.qml") + ": " + d.message;
        }).join("\n"));
    }
    return { "default": made.component };
}

function sourceFor() {
    return moduleFor;
}
