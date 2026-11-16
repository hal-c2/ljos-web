import { packGiven } from "../codeblocks/parse.js";

// The examples examplefiles.spec.js runs: live code blocks whose QML
// names files by relative address. An example is a project of its own
// files (its fences, its harness), wherever its page is: what it names
// is looked for among them, and what is not there is said to be not
// there, at the line that names it, with nothing asked of the server.
// Written here, not taken from a site's pages, so the test holds
// whatever those pages say.

// A harness of the reader's shell, as a docs site gives one: a snippet
// stands where the marker is.
export const SHELL_HARNESS = `import QtQuick
import Ljos.Blocks

Item {
    width: 320
    height: 120
    //! snippet
}
`;

// A user's shell and the application's both not written: the loader
// shows nothing and says so of both.
export const NEITHER = `ShellLoader {
    id: shell
    anchors.fill: parent
    source: "shell.qml"
    fallback: "AppShell.qml"
}
Text {
    objectName: "said"
    text: shell.status + " " + shell.error
}`;

// The user's shell named by a path known only when the example runs:
// what the user's settings say, which the compiler never sees.
export const CHOSEN_MAIN = `import QtQuick
import Ljos.Blocks

Rectangle {
    width: 280
    height: 120
    color: "#20242e"
    property var settings: JSON.parse('{ "shell": "user/Shell.qml" }')
    ShellLoader {
        id: shell
        anchors.fill: parent
        source: settings.shell
        fallback: "Missing.qml"
    }
}
`;

export const CHOSEN_SHELL = `import QtQuick

Text {
    color: "#9ec1ff"
    text: "My shell"
}
`;

// A shell that, once shown, is moved to a source the example does not
// have and reloaded in the same turn: the reload is what reads it.
export const RELOADED = `import QtQuick
import Ljos.Blocks

Rectangle {
    width: 280
    height: 120
    color: "#20242e"
    property bool moved: false
    ShellLoader {
        id: shell
        anchors.fill: parent
        source: moved ? "Gone.qml" : "user/Shell.qml"
        onStatusChanged: {
            if (shell.status !== ShellLoader.Ready || moved) return;
            moved = true;
            shell.reload();
        }
    }
}
`;

// A picture the example names and does not have.
export const PICTURE = `import QtQuick

Rectangle {
    width: 200
    height: 80
    color: "#20242e"
    Image {
        id: logo
        source: "logo.png"
    }
    Text {
        color: "#e8eaf0"
        text: logo.status === Image.Error ? "no picture" : "picture " + logo.status
    }
}
`;

// A request for a file the example has, and for one it does not: the one
// is read from what the example was given, the other is not there.
export const READ = `import QtQuick

Rectangle {
    width: 280
    height: 80
    color: "#20242e"
    property string has: "…"
    property string lacks: "…"
    function read(name, done) {
        const request = new XMLHttpRequest();
        request.onreadystatechange = () => {
            if (request.readyState === XMLHttpRequest.DONE) done(request);
        };
        request.open("GET", name);
        request.send();
    }
    Component.onCompleted: {
        read("data.json", (r) => has = r.status + " " + JSON.parse(r.responseText).greeting);
        read("notes.json", (r) => lacks = "status " + r.status);
    }
    Text {
        color: "#e8eaf0"
        text: has + " / " + lacks
    }
}
`;

// A name with a `%` that starts no escape is its own name.
export const PERCENT = `import QtQuick

Rectangle {
    width: 200
    height: 80
    color: "#20242e"
    Image {
        id: logo
        source: "100%.png"
    }
    Text {
        color: "#e8eaf0"
        text: logo.status === Image.Error ? "no picture" : "picture " + logo.status
    }
}
`;

// A name with a `%` that starts no escape and a character the URL
// parser escapes: a file the example has, under its own name.
export const MIXED = `import QtQuick

Rectangle {
    width: 200
    height: 80
    color: "#20242e"
    Image {
        id: logo
        source: "my 100%.svg"
    }
    Text {
        color: "#e8eaf0"
        text: logo.status === Image.Ready ? "picture " + logo.implicitWidth : "picture " + logo.status
    }
}
`;

const SQUARE = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><rect width="12" height="12" fill="#9ec1ff"/></svg>\n';

// A script that asks for a file the example does not have as it runs,
// which is while the example compiles.
export const EARLY_MAIN = `import QtQuick
import "early.js" as Early

Rectangle {
    width: 200
    height: 80
    color: "#20242e"
    Text {
        color: "#e8eaf0"
        text: "asked " + Early.asked
    }
}
`;

export const EARLY_SCRIPT = `.pragma library
const request = new XMLHttpRequest();
request.open("GET", "early.json");
request.send();
var asked = true;
`;

// EARLY_MAIN with a module of the runtime's no other example imports, so
// a test can hold the compile while it waits for that module, after the
// example's files are given and before they are linked.
export const GATED_MAIN = `import QtQuick
import QtQuick.Timeline
import "early.js" as Early

Rectangle {
    width: 200
    height: 80
    color: "#20242e"
    Timeline {
        startFrame: 0
        endFrame: 10
    }
    Text {
        color: "#e8eaf0"
        text: "asked " + Early.asked
    }
}
`;

// `fetch` reads a file the example has, from a file in a directory of its
// own (the address is beside that file), and one it does not have is not
// there.
export const FETCHED_MAIN = `import QtQuick
import "lib/load.js" as Load

Rectangle {
    width: 280
    height: 80
    color: "#20242e"
    property string has: "…"
    property string lacks: "…"
    Component.onCompleted: {
        Load.rows((text) => has = text);
        fetch("notes.json").then((r) => lacks = "read " + r.status, (e) => lacks = "failed");
    }
    Text {
        color: "#e8eaf0"
        text: has + " / " + lacks
    }
}
`;

export const FETCHED_SCRIPT = `.pragma library
function rows(done) {
    fetch("rows.json").then((r) => r.json()).then((j) => done(j.rows.length + " rows"));
}
`;

// A request for a file the example has is stopped by its signal as a
// request to a server is: one aborted before it was made, and one aborted
// after it was made but before it was answered.
export const ABORTED_MAIN = `import QtQuick

Text {
    color: "#e8eaf0"
    property string before: "…"
    property string after: "…"
    text: before + " / " + after
    Component.onCompleted: {
        const told = (name) => (e) => name === "before" ? before = e.name : after = e.name;
        fetch("rows.json", { signal: AbortSignal.abort() }).then((r) => before = "read " + r.status, told("before"));
        const user = new AbortController();
        fetch("rows.json", { signal: user.signal }).then((r) => after = "read " + r.status, told("after"));
        user.abort();
    }
}
`;

// What a request for a file the example has answers stays tied to its
// signal until it is read, as a server's does; and a request given an
// explicit null signal is not stopped by the one its Request had.
export const CANCELLED_MAIN = `import QtQuick

Text {
    color: "#e8eaf0"
    property string read: "…"
    property string kept: "…"
    text: read + " / " + kept
    Component.onCompleted: {
        const user = new AbortController();
        fetch("rows.json", { signal: user.signal }).then((r) => { user.abort(); return r.text(); }).then(() => read = "read", (e) => read = e.name);
        const asked = new Request(Qt.resolvedUrl("rows.json"), { signal: AbortSignal.abort() });
        fetch(asked, { signal: null }).then((r) => r.json()).then((j) => kept = j.rows.length + " rows", (e) => kept = e.name);
    }
}
`;

// A Timer a nonvisual object holds as a property's value has that object
// for its parent, as one declared among an item's children has the item.
export const HELD_TIMER_MAIN = `import QtQuick

Text {
    color: "#e8eaf0"
    QtObject {
        id: holder
        property Timer pulse: Timer {}
    }
    text: holder.pulse.parent === holder ? "held" : "parent " + holder.pulse.parent
}
`;

// A picture given as bytes (a site's files=): its Image loads it.
export const GIVEN_MAIN = `import QtQuick
import "parts"

Rectangle {
    width: 200
    height: 80
    color: "#20242e"
    Image {
        id: photo
        source: "photo.png"
    }
    Badge {
        x: 100
        label: photo.status === Image.Ready ? "shown " + photo.sourceSize.width + "x" + photo.sourceSize.height : "status " + photo.status
    }
}
`;

export const GIVEN_BADGE = `import QtQuick

Text {
    property string label
    color: "#e8eaf0"
    text: label
}
`;

// A 2 x 1 PNG.
export const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGP4z8DAwPAfAAcAAf9+CLHQAAAAAElFTkSuQmCC"),
  (c) => c.charCodeAt(0),
);

const figure = (display, more = {}) => ({ v: 1, entry: "Main.qml", before: false, display, prerendered: false, ...more });
const qml = (name, code) => ({ name, code, lang: "qml" });

// Each example as the build writes its payload.
export const EXAMPLES = {
  neither: figure([qml("Main.qml", NEITHER + "\n")], { harness: "shell", harnessTemplate: SHELL_HARNESS, harnessFile: "Main.qml" }),
  chosen: figure([qml("Main.qml", CHOSEN_MAIN), qml("user/Shell.qml", CHOSEN_SHELL)]),
  reloaded: figure([qml("Main.qml", RELOADED), qml("user/Shell.qml", CHOSEN_SHELL)]),
  picture: figure([qml("Main.qml", PICTURE)]),
  read: figure([qml("Main.qml", READ), { name: "data.json", code: '{ "greeting": "hello" }\n', lang: "json" }]),
  percent: figure([qml("Main.qml", PERCENT)]),
  mixed: figure([qml("Main.qml", MIXED), { name: "my 100%.svg", code: SQUARE, lang: "svg" }]),
  early: figure([qml("Main.qml", EARLY_MAIN), { name: "early.js", code: EARLY_SCRIPT, lang: "js" }]),
  gated: figure([qml("Main.qml", GATED_MAIN), { name: "early.js", code: EARLY_SCRIPT, lang: "js" }]),
  fetched: figure([
    qml("Main.qml", FETCHED_MAIN),
    { name: "lib/load.js", code: FETCHED_SCRIPT, lang: "javascript" },
    { name: "lib/rows.json", code: '{ "rows": [1, 2, 3] }\n', lang: "json" },
  ]),
  aborted: figure([qml("Main.qml", ABORTED_MAIN), { name: "rows.json", code: '{ "rows": [1, 2, 3] }\n', lang: "json" }]),
  cancelled: figure([qml("Main.qml", CANCELLED_MAIN), { name: "rows.json", code: '{ "rows": [1, 2, 3] }\n', lang: "json" }]),
  heldTimer: figure([qml("Main.qml", HELD_TIMER_MAIN)]),
  given: figure([qml("Main.qml", GIVEN_MAIN), qml("parts/Badge.qml", GIVEN_BADGE)], { given: packGiven({ "photo.png": PNG }) }),
};

// What may not be asked of the server: every file the examples name.
export const NAMED = /(?:^|\/)(?:(?:shell|AppShell|Shell|Missing|Gone|Badge)\.qml|(?:logo|photo)\.png|100%(?:25)?\.png|my(?: |%20)100%(?:25)?\.svg|(?:data|notes|early|rows)\.json|load\.js)$/;
