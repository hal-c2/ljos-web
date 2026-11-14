.pragma library
// What a CodeEditor brings in when it is used: CodeMirror over the
// field (`ljos-web/codeblock/attach`), imported on the reader's first
// focus or press and, before that, when the page is idle. Nothing of
// it is in the page's first load, and a page prerendered for a reader
// with no script shows the field's Text, highlighted by the build.

var attaching = null;
var waiting = false;
// Each field's editor, once it has one.
var editors = new WeakMap();
// Fields gone from the page: one that goes while its editor is still
// being fetched gets none.
var gone = new WeakSet();
// Fields the reader is moving into: one they leave while its editor
// is on its way keeps their focus where they took it.
var entering = new WeakSet();

function module() {
    if (!attaching)
        attaching = import("ljos-web/codeblock/attach");
    return attaching;
}

// Once the page has nothing else to do: so the first press finds the
// editor ready. Where there is no idle time to wait for (a prerender),
// nothing is fetched.
function whenIdle() {
    var idle = globalThis.requestIdleCallback;
    if (waiting || typeof idle !== "function")
        return;
    waiting = true;
    idle(function () {
        module();
    }, { timeout: 4000 });
}

// Where a press at `local` (the field's own coordinates) is on the page.
function pagePoint(field, local) {
    var node = field.$node;
    if (!node || !local)
        return undefined;
    var box = node.getBoundingClientRect();
    return { x: box.left + local.x, y: box.top + local.y };
}

// The field's editor, made the first time it is asked for. `focus`
// moves the reader into it; `local` is where a press was, for the
// caret.
async function bringIn(field, shown, focus, local) {
    if (!field.$node || !globalThis.document)
        return null;
    if (focus)
        entering.add(field);
    if (!editors.has(field)) {
        var made = await module();
        if (gone.has(field))
            return null;
        if (!editors.has(field)) {
            editors.set(field, made.attachCodeEditor(field, {
                lang: field.lang,
                label: field.label,
                like: shown,
                errors: field.errors,
                point: pagePoint(field, local)
            }));
            field.editing = true;
            editors.get(field).setDiagnostics(field.diagnostics || []);
        }
    }
    if (focus && entering.has(field))
        editors.get(field).focus();
    entering.delete(field);
    return editors.get(field);
}

// The field is going: its editor goes with it. CodeMirror listens on
// the window and the document, and the editor watches the field's
// size, until it is destroyed, so a field that left its editor behind
// would keep it, and its listeners, for as long as the page is open.
function dispose(field) {
    gone.add(field);
    var editor = editors.get(field);
    if (editor)
        editor.destroy();
    editors.delete(field);
}

function left(field) {
    entering.delete(field);
    var editor = editors.get(field);
    if (editor)
        editor.blur();
}

function textChanged(field) {
    var editor = editors.get(field);
    if (editor)
        editor.setText(field.text);
}

function diagnosticsChanged(field) {
    var editor = editors.get(field);
    if (editor)
        editor.setDiagnostics(field.diagnostics || []);
}

// The build's colouring of a block as markup: it ships packed, a
// token its text between `<` and a letter for its class and `>` (none
// where the next starts at once), behind a private-use mark. This is
// `ljos-web/codeblock/rich`'s `unpackRich`, kept here as a library
// file imports nothing; the site's tests hold the two to each other.
var TOKENS = ["topic", "keyword", "string", "number", "comment", "typeName", "function", "propertyName",
              "variableName", "operator", "punctuation", "bool", "null", "regexp", "meta", "invalid"];

function richOf(packed) {
    var text = String(packed || "");
    if (text.charAt(0) !== "\uE000")
        return text;
    var open = false;
    var html = text.slice(1).replace(/<([a-z])|>/g, function (all, letter) {
        var close = open ? "</span>" : "";
        open = letter !== undefined;
        return open ? close + '<span class="tok-' + TOKENS[letter.charCodeAt(0) - 97] + '">' : close;
    });
    return open ? html + "</span>" : html;
}

// Rich text keeps no run of spaces, and lines are breaks: the
// highlighted code as the Text shows it, every space a space that
// stays, and code with no highlighting (edited before the editor came)
// escaped.
function shownAs(rich, text, written) {
    var html = text === written && rich ? richOf(rich) : String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return html.replace(/\n$/, "").split("\n").map(function (line) {
        return line.replace(/(^|>)([^<]+)/g, function (all, before, words) {
            return before + words.replace(/ /g, "&nbsp;");
        });
    }).join("<br/>");
}
