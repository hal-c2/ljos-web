.pragma library
// What a live code block compiles with: the compiler in the page
// (`ljos-web/compiler`, A15), given the page's own modules and Qt
// Quick Controls — this page is built with them (ControlsHost), so
// an example that imports them compiles and reloads here as it
// prerendered at build. Nothing is fetched until the first compile.
//
// A block's stage is a ShellLoader whose source is `sourceFor(id)`:
// resolving it compiles the block's current files (assembled as
// `ljos-web/codeblocks/parse` assembles them, harness spliced), and
// ShellLoader.reload() after an edit resolves it again and carries
// the running result's state across (A21, A13).
//
// Each example is a project of only its own files (`closed`), at a
// root of its own: what it names by a relative address is among its
// fences and its harness, and what it names and does not have is not
// there, told to the block as lines it shows, never asked of a server.

var examples = {};
var compiler = null;
// What the last compile of each block said, by display file, in the
// file's own lines (`parse.displayPosition`): the squiggles its editors
// show. A compile that worked says nothing.
var said = {};

function diagnosticsFor(id, index) {
    var lists = said[id];
    return lists && lists[index] ? lists[index] : [];
}

// `told(lines)`: what the running example asked for and does not have,
// one line each, as it changes.
function setExample(id, display, entry, harnessTemplate, harnessFile, told) {
    examples[id] = {
        display: display,
        entry: entry,
        harnessTemplate: harnessTemplate || undefined,
        harnessFile: harnessFile || undefined,
        told: told || function () {},
        absent: []
    };
}

function setFiles(id, display) {
    if (examples[id])
        examples[id].display = display;
}

async function compileWith() {
    if (!compiler) {
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

async function moduleFor(id) {
    const example = examples[id];
    if (!example)
        throw new Error("no example " + id);
    const compile = await compileWith();
    const parse = await import("ljos-web/codeblocks/parse");
    const files = parse.exampleFiles(example);
    const root = "ljos-example://" + id + "/";
    const made = await compile({
        files: files.files,
        entry: files.entry,
        base: root,
        closed: true,
        // What the last project was told goes when this compile gives the
        // example its files, before its scripts run: a compile that fails
        // sooner keeps what the example that still runs was told.
        enclosed: function () {
            if (example.absent.length > 0) {
                example.absent = [];
                example.told("");
            }
        },
        missing: function (name, url) {
            example.absent = example.absent.concat([parse.notThereLine(example.display, root, name, url)]);
            example.told(example.absent.join("\n"));
        }
    });
    said[id] = {};
    if (made.diagnostics) {
        made.diagnostics.forEach(function (d) {
            const at = parse.displayPosition(example, d);
            if (at.index < 0 || !at.line)
                return;
            (said[id][at.index] = said[id][at.index] || []).push(Object.assign({}, d, at, { file: example.display[at.index].name }));
        });
        throw new Error(made.diagnostics.map(function (d) {
            return d.line ? (d.file || files.entry) + ":" + d.line + ":" + (d.column || 1) + ": " + d.message : (d.file || files.entry) + ": " + d.message;
        }).join("\n"));
    }
    return { "default": made.component };
}

function sourceFor(id) {
    return function () {
        return moduleFor(id);
    };
}
