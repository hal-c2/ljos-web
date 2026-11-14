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
};

// What may not be asked of the server: every file the examples name.
export const NAMED = /(?:^|\/)(?:(?:shell|AppShell|Shell|Missing|Gone)\.qml|logo\.png|100%(?:25)?\.png|(?:data|notes)\.json)$/;
