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

function setExample(id, display, entry, harnessTemplate, harnessFile) {
    examples[id] = {
        display: display,
        entry: entry,
        harnessTemplate: harnessTemplate || undefined,
        harnessFile: harnessFile || undefined
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
    const made = await compile({ files: files.files, entry: files.entry });
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
