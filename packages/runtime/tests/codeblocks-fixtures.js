// The examples the code-block tests run, and the documents they sit
// in. Kept apart from the spec so a build (the test page, the site's
// fixture docs) can use the same texts the tests hold them to.
export const COUNTER = `import QtQuick

Rectangle {
    id: root
    width: 320
    height: 180
    color: "#20242e"
    property int count: 0

    Text {
        anchors.centerIn: parent
        color: "#e8eaf0"
        font.pixelSize: 24
        text: "Count: " + root.count
    }
    MouseArea {
        anchors.fill: parent
        onClicked: root.count = root.count + 1
    }
}
`;

export const WINDOW = `import QtQuick

Rectangle {
    width: 240
    height: 120
    color: "#20242e"
    //! snippet
}
`;

export const SNIPPET = `Text {
    anchors.centerIn: parent
    color: "#e8eaf0"
    text: "Hello from a snippet"
}`;

export const PANEL = `import QtQuick

Rectangle {
    width: 120
    height: 60
    color: "#33415e"
    Text {
        anchors.centerIn: parent
        color: "#e8eaf0"
        text: "Panel"
    }
}
`;

export const GROUP_MAIN = `import QtQuick

Rectangle {
    width: 200
    height: 120
    color: "#20242e"
    Panel {
        anchors.centerIn: parent
    }
}
`;

// The user's own shell over an app's blocks (SITE-2 correction
// 2026-11-11): a ShellLoader example with a Slot contribution, as the
// docs page on replacing an app's shell will show. The counter lives
// outside the shell, in the app.
export const SHELL_MAIN = `import QtQuick
import Ljos.Blocks

Rectangle {
    width: 280
    height: 160
    color: "#20242e"
    QtObject {
        id: counter
        property int count: 0
    }
    Contribution {
        slot: "main"
        Text {
            objectName: "counter-view"
            color: "#e8eaf0"
            text: "Count: " + counter.count
        }
    }
    ShellLoader {
        anchors.fill: parent
        source: "user/Shell.qml"
        fallback: "Default.qml"
    }
    MouseArea {
        anchors.fill: parent
        onClicked: counter.count = counter.count + 1
    }
}
`;

export const SHELL_USER = `import QtQuick
import Ljos.Blocks

Column {
    spacing: 6
    Text {
        color: "#9ec1ff"
        text: "My shell"
    }
    Slot {
        name: "main"
    }
}
`;

export const SHELL_DEFAULT = `import QtQuick
import Ljos.Blocks

Column {
    spacing: 6
    Text {
        color: "#e8eaf0"
        text: "App shell"
    }
    Slot {
        name: "main"
    }
}
`;

export const SHELL_DOC = [
  "```qml file=Main.qml group=shell",
  SHELL_MAIN.trimEnd(),
  "```",
  "```qml file=user/Shell.qml group=shell",
  SHELL_USER.trimEnd(),
  "```",
  "```qml file=Default.qml group=shell",
  SHELL_DEFAULT.trimEnd(),
  "```",
].join("\n");

export const DOC = [
  "# Blocks",
  "",
  "```qml",
  COUNTER.trimEnd(),
  "```",
  "",
  "```qml harness=window",
  SNIPPET,
  "```",
  "",
  "```qml file=Main.qml group=pair",
  GROUP_MAIN.trimEnd(),
  "```",
  "```qml file=Panel.qml group=pair",
  PANEL.trimEnd(),
  "```",
  "",
  "```qml before",
  'import QtQuick\n\nRectangle { width: 80; height: 40; color: "red" }',
  "```",
  "",
  "```sh",
  "ljos check Main.qml",
  "```",
  "",
].join("\n");

