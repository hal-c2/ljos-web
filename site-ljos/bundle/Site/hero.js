.pragma library
// The front page's live app as source, coloured for the Source tab with
// the code theme's own classes (`tok-*`, the page's CSS), so it follows
// the shell and the scheme as every code block does. It is the app
// Site/HeroApp.qml draws, with its look and its imports left out.

var source = [
    "// A list of tasks, and how far through it you are.",
    "Column {",
    "    id: app",
    "    property string heading: \"Launch week\"",
    "    property var tasks: [",
    "        { title: \"Sketch the shell\", done: true },",
    "        { title: \"Wire up the Observer\", done: true },",
    "        { title: \"Write the release notes\", done: false },",
    "        { title: \"Ship the beta\", done: false }",
    "    ]",
    "    readonly property int done: tasks.filter((task) => task.done).length",
    "",
    "    Text { id: title; text: app.heading }",
    "    Rectangle {",
    "        id: progress",
    "        property real value: app.done / app.tasks.length",
    "        width: parent.width * value",
    "    }",
    "    Repeater {",
    "        id: list",
    "        model: app.tasks",
    "        Task {",
    "            required property var modelData",
    "            text: modelData.title",
    "            checked: modelData.done",
    "        }",
    "    }",
    "}"
].join("\n");

var KEYWORDS = { "import": 1, "property": 1, "readonly": 1, "required": 1, "var": 1, "string": 1, "int": 1, "real": 1, "id": 0 };

function escape(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function span(kind, text) {
    return "<span class=\"tok-" + kind + "\">" + escape(text) + "</span>";
}

// One line, coloured: comments, strings, numbers, keywords, type names
// (a capital first), property names (before a colon), the rest as is.
function line(text) {
    var out = "";
    var pattern = /(\/\/.*$)|("(?:[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?\b)|(\b(?:true|false)\b)|([A-Za-z_][A-Za-z0-9_]*)(\s*:)?|(\S)/g;
    var last = 0;
    var match;
    while ((match = pattern.exec(text)) !== null) {
        out += escape(text.slice(last, match.index));
        last = pattern.lastIndex;
        if (match[1]) out += span("comment", match[1]);
        else if (match[2]) out += span("string", match[2]);
        else if (match[3]) out += span("number", match[3]);
        else if (match[4]) out += span("bool", match[4]);
        else if (match[5]) {
            var word = match[5];
            if (match[6]) out += span("propertyName", word) + span("punctuation", match[6]);
            else if (KEYWORDS[word]) out += span("keyword", word);
            else if (/^[A-Z]/.test(word)) out += span("typeName", word);
            else out += escape(word);
        } else out += span("punctuation", match[7]);
    }
    return out + escape(text.slice(last));
}

// The whole source as rich text: lines as breaks, each line's leading
// spaces kept as its indentation.
function rich() {
    return source.split("\n").map(function (text) {
        var indent = /^ */.exec(text)[0];
        return "&nbsp;".repeat(indent.length) + line(text.slice(indent.length));
    }).join("<br/>");
}
