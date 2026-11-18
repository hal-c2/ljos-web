import QtQuick
import Site
import "../Demos/later.js" as Later
import "../Demos/cockpit-live.js" as Live

// The cockpit demo's page: Svala GT's cockpit, an instrument cluster
// over a touchscreen for a made-up car, running in the page, with its
// files below it to read, change and download. An edit is compiled in the page
// against the other files as they stand and, once it compiles, the
// cockpit is made again from it; one that does not is refused with what
// broke, and the last cockpit that compiled stays. The files come with
// the page's script (Demos/cockpit-project.json), not in its HTML: a
// reader without script has the cockpit's picture and a link to each
// file to download.
Column {
    id: page

    property var scroller: null
    property bool wide: true

    // The files, once they came: [{ path, lang, code, rich }].
    property var files: []
    property string path: "Main.qml"
    // What the reader changed, by file; a file they set back is not here.
    property var edits: ({})
    property var live: null
    property string said: ""
    property bool runs: true
    // The text last given to the editor by the page, so the editor saying
    // it back is not taken for an edit.
    property string own: ""
    readonly property var file: files.find((entry) => entry.path === path) ?? null
    readonly property string sourceBase: Content.base + "demos/cockpit/source/"

    width: parent ? parent.width : 1040
    spacing: Theme.l
    topPadding: page.wide ? Theme.xl : Theme.m

    Component.onCompleted: {
        Live.load().then((project) => {
            page.files = project.files;
            page.show(page.path);
        });
        Live.needsWasm().then((why) => {
            if (why) {
                page.runs = false;
                page.said = why;
            }
        });
    }

    function show(next) {
        path = next;
        const text = Object.hasOwn(edits, next) ? edits[next] : (file ? file.code : "");
        own = text;
        editor.text = text;
        editor.diagnostics = Live.diagnosticsFor(next);
        debounce.stop();
    }
    function edited(text) {
        if (text === own || !file)
            return;
        own = text;
        const next = Object.assign({}, edits);
        if (text === file.code)
            delete next[path];
        else
            next[path] = text;
        edits = next;
        debounce.restart();
    }
    function apply() {
        if (!runs)
            return;
        const asked = edits;
        Live.compile(asked, sourceBase).then((made) => {
            if (asked !== page.edits)
                return;
            page.said = "";
            page.live = Object.keys(asked).length > 0 ? made : null;
            editor.diagnostics = [];
        }, (error) => {
            if (asked !== page.edits)
                return;
            page.said = error.message;
            editor.diagnostics = Live.diagnosticsFor(page.path);
        });
    }
    function reset() {
        edits = {};
        live = null;
        said = "";
        show(path);
    }

    Timer {
        id: debounce
        interval: 500
        onTriggered: page.apply()
    }

    Column {
        width: parent.width
        spacing: Theme.s

        Text {
            width: parent.width
            text: "Svala GT cockpit"
            color: Theme.text
            font.family: Theme.sans
            font.pixelSize: page.wide ? Theme.displaySize : Theme.compactDisplaySize
            font.weight: Font.Bold
            lineHeightMode: Text.FixedHeight
            lineHeight: page.wide ? Theme.displayLine : Theme.compactDisplayLine
            wrapMode: Text.Wrap
            readonly property int headingLevel: 1
            Accessible.role: Accessible.Heading
        }
        Text {
            width: Math.min(parent.width, Theme.measure)
            text: "An instrument cluster over a touchscreen, for a car that does not exist. Open its doors on the 3D car, set the climate, play music, follow the route. The pages are the Ljós dialect over typed TypeScript; the drive runs on timers, and nothing runs while nothing changes."
            color: Theme.textMuted
            font.family: Theme.sans
            font.pixelSize: Theme.subtitleSize - 1
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.subtitleLine - 2
            wrapMode: Text.Wrap
        }
    }

    DemoFrame {
        width: parent.width
        scroller: page.scroller
        needs: "webgl2"
        route: "/demos/cockpit/"
        aspect: 900 / 1600
        // The cockpit is dark unless the reader picked light for the site
        // (Demos/CockpitDemo.qml), so its picture is too.
        picture: Theme.picked === "light" ? "/pictures/demo-cockpit.webp" : "/pictures/demo-cockpit-dark.webp"
        what: "the cockpit"
        description: "A car's instrument cluster, speed and power dials either side of the gear, over a touchscreen showing the car in 3D, music, climate or a map."
        demo: running
    }
    // The cockpit, with the page's edits given to it as they compile.
    Component {
        id: running
        Item {
            id: host
            property bool active: true
            property bool calm: false
            Loader {
                anchors.fill: parent
                source: Later.cockpit
                onLoaded: {
                    item.active = Qt.binding(() => host.active);
                    item.calm = Qt.binding(() => host.calm);
                    item.live = Qt.binding(() => page.live);
                }
            }
        }
    }

    Column {
        width: parent.width
        spacing: Theme.s

        Text {
            width: parent.width
            text: "Its files"
            color: Theme.text
            font.family: Theme.sans
            font.pixelSize: page.wide ? Theme.titleSize + 1 : Theme.titleSize - 1
            font.weight: Font.Bold
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.titleLine + 4
            readonly property int headingLevel: 2
            Accessible.role: Accessible.Heading
        }
        Text {
            width: Math.min(parent.width, Theme.measure)
            text: "Change any of them: the cockpit is made again from your files as soon as they compile. Try Theme.qml's cyan, or the first leg of the drive in logic/drive.ts."
            color: Theme.textMuted
            font.family: Theme.sans
            font.pixelSize: Theme.bodySize
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.bodyLine
            wrapMode: Text.Wrap
        }

        Flow {
            width: parent.width
            spacing: Theme.xxs
            Accessible.role: Accessible.List
            Accessible.name: "The cockpit's files"

            Repeater {
                model: page.files
                delegate: Rectangle {
                    id: tab
                    required property var modelData
                    readonly property bool chosen: modelData.path === page.path
                    readonly property bool changed: Object.hasOwn(page.edits, modelData.path)
                    width: name.implicitWidth + 2 * Theme.xs
                    height: name.implicitHeight + Theme.xs
                    radius: Theme.radiusSmall
                    color: chosen ? Theme.surfaceSelected : press.containsMouse ? Theme.surfaceHover : Theme.surface
                    border.color: activeFocus ? Theme.focusRing : chosen ? Theme.accent : Theme.border
                    border.width: activeFocus ? 2 : 1
                    activeFocusOnTab: true
                    Accessible.role: Accessible.Button
                    Accessible.name: modelData.path + (changed ? ", changed" : "")
                    Accessible.onPressAction: () => page.show(modelData.path)
                    Keys.onPressed: (event) => {
                        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                            page.show(tab.modelData.path);
                            event.accepted = true;
                        }
                    }

                    Text {
                        id: name
                        anchors.centerIn: parent
                        text: tab.modelData.path + (tab.changed ? " •" : "")
                        color: tab.chosen ? Theme.text : Theme.textMuted
                        font.family: Theme.mono
                        font.pixelSize: Theme.captionSize
                    }
                    MouseArea {
                        id: press
                        anchors.fill: parent
                        hoverEnabled: true
                        Accessible.ignored: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: page.show(tab.modelData.path)
                    }
                }
            }
        }

        Rectangle {
            width: parent.width
            height: head.implicitHeight + Theme.xs
            color: Theme.panel
            border.color: Theme.border
            border.width: 1

            Row {
                id: head
                anchors.left: parent.left
                anchors.leftMargin: Theme.s
                anchors.verticalCenter: parent.verticalCenter
                spacing: Theme.m

                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: page.path
                    color: Theme.muted
                    font.family: Theme.mono
                    font.pixelSize: Theme.captionSize
                }
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    visible: Object.keys(page.edits).length > 0
                    text: "Reset every file"
                    color: Theme.link
                    font.family: Theme.sans
                    font.pixelSize: Theme.captionSize
                    activeFocusOnTab: visible
                    Accessible.role: Accessible.Button
                    Accessible.name: text
                    Accessible.onPressAction: () => page.reset()
                    Keys.onPressed: (event) => {
                        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                            page.reset();
                            event.accepted = true;
                        }
                    }
                    MouseArea {
                        anchors.fill: parent
                        Accessible.ignored: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: page.reset()
                    }
                }
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: "<a href=\"" + page.sourceBase + page.path + "\" download>Download it</a>"
                    textFormat: Text.RichText
                    linkColor: Theme.link
                    font.family: Theme.sans
                    font.pixelSize: Theme.captionSize
                    onLinkActivated: (link) => Qt.openUrlExternally(link)
                }
            }
        }

        Rectangle {
            width: parent.width
            height: page.wide ? 420 : 320
            color: Theme.codeBg
            border.color: editor.activeFocus ? Theme.focusRing : Theme.border
            border.width: editor.activeFocus ? 2 : 1

            Flickable {
                anchors.fill: parent
                anchors.margins: Theme.s
                contentWidth: editor.width
                contentHeight: editor.height
                clip: true

                CodeEditor {
                    id: editor
                    width: Math.max(parent.width, implicitWidth)
                    code: page.file ? page.file.code : ""
                    rich: page.file && !Object.hasOwn(page.edits, page.path) ? page.file.rich : ""
                    lang: page.file ? page.file.lang : "qml"
                    label: "Edit the cockpit's " + page.path
                    errors: told
                    onTextChanged: page.edited(text)
                }
            }
        }

        Text {
            id: told
            visible: page.said !== ""
            width: parent.width
            text: page.said
            color: Theme.danger
            font.family: Theme.mono
            font.pixelSize: Theme.captionSize
            wrapMode: Text.Wrap
        }
    }
}
