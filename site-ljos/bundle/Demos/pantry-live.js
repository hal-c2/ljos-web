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
    const made = await compile({ files: files, entry: "Shell.qml" });
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
