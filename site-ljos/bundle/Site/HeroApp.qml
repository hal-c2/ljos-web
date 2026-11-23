// Ljós's Core before QtQuick: only its t`` is wanted here.
import Ljos.Core
import QtQuick
import Site

// The front page's live app: a list of tasks and how far through it you
// are (its source is hero.js's). The reader ticks tasks; the hero's
// recorded agent drives the same app through what an agent would call
// (`toggle`, `rename`), and `pointing` rings the part it acts on.
Item {
    id: app

    property string heading: t`Launch week`
    property var tasks: [
        { title: t`Sketch the shell`, done: true },
        { title: t`Wire up the Observer`, done: true },
        { title: t`Write the release notes`, done: false },
        { title: t`Ship the beta`, done: false }
    ]
    readonly property int done: tasks.filter((task) => task.done).length
    readonly property real progress: tasks.length > 0 ? done / tasks.length : 0
    // What the agent acts on: "title", "progress", a task's index, or "".
    property var pointing: ""

    function toggle(at) {
        var next = tasks.slice();
        next[at] = { title: next[at].title, done: !next[at].done };
        tasks = next;
    }
    function rename(words) {
        heading = words;
    }
    function find(title) {
        return tasks.findIndex((task) => task.title === title);
    }
    function reset() {
        heading = t`Launch week`;
        tasks = [
            { title: t`Sketch the shell`, done: true },
            { title: t`Wire up the Observer`, done: true },
            { title: t`Write the release notes`, done: false },
            { title: t`Ship the beta`, done: false }
        ];
        pointing = "";
    }

    Accessible.role: Accessible.Grouping
    Accessible.name: t`Task list`

    Column {
        x: Theme.l
        y: Theme.l
        width: app.width - 2 * Theme.l
        spacing: Theme.s

        Item {
            width: parent.width
            height: titleText.implicitHeight

            Text {
                id: titleText
                text: app.heading
                color: Theme.text
                font.family: Theme.sans
                font.pixelSize: Theme.titleSize
                font.weight: Font.DemiBold
                font.letterSpacing: -0.3
            }
            Text {
                anchors.right: parent.right
                anchors.baseline: titleText.baseline
                text: t`${app.done} of ${app.tasks.length} done`
                color: Theme.textMuted
                font.family: Theme.sans
                font.pixelSize: Theme.captionSize
            }
            Ring {
                target: titleText
                on: app.pointing === "title"
            }
        }
        Item {
            width: parent.width
            height: 6

            Rectangle {
                width: parent.width
                height: parent.height
                radius: 3
                color: Theme.surfaceHover
            }
            Rectangle {
                width: Math.round(parent.width * app.progress)
                height: parent.height
                radius: 3
                color: Theme.accent
                Behavior on width {
                    NumberAnimation {
                        duration: Theme.enterPanel
                        easing.type: Easing.OutCubic
                    }
                }
            }
            Ring {
                target: parent
                on: app.pointing === "progress"
            }
        }
        Item {
            width: 1
            height: Theme.xxs
        }
        Repeater {
            model: app.tasks

            Item {
                id: row
                required property var modelData
                required property int index

                width: parent.width
                height: 40
                activeFocusOnTab: true
                Accessible.role: Accessible.CheckBox
                Accessible.name: modelData.title
                Accessible.checkable: true
                Accessible.checked: modelData.done
                Accessible.onPressAction: () => app.toggle(index)
                Keys.onPressed: (event) => {
                    if (event.key === Qt.Key_Space || event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                        app.toggle(row.index);
                        event.accepted = true;
                    }
                }

                Rectangle {
                    anchors.fill: parent
                    radius: Theme.radiusSmall
                    color: area.containsMouse ? Theme.surfaceHover : "transparent"
                }
                Rectangle {
                    id: box
                    x: Theme.xs
                    anchors.verticalCenter: parent.verticalCenter
                    width: 20
                    height: 20
                    radius: 6
                    color: row.modelData.done ? Theme.accent : "transparent"
                    border.color: row.modelData.done ? Theme.accent : Theme.border
                    border.width: 1.5
                    Behavior on color {
                        ColorAnimation {
                            duration: Theme.enterSmall
                        }
                    }
                    Text {
                        anchors.centerIn: parent
                        visible: row.modelData.done
                        text: "✓"
                        color: Theme.textOnAccent
                        font.family: Theme.sans
                        font.pixelSize: 13
                        font.weight: Font.Bold
                        Accessible.ignored: true
                    }
                }
                Text {
                    x: box.x + box.width + Theme.s
                    anchors.verticalCenter: parent.verticalCenter
                    width: parent.width - x - Theme.xs
                    elide: Text.ElideRight
                    text: row.modelData.title
                    color: row.modelData.done ? Theme.textMuted : Theme.text
                    font.family: Theme.sans
                    font.pixelSize: Theme.bodySize - 1
                    font.strikeout: row.modelData.done
                }
                MouseArea {
                    id: area
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    Accessible.ignored: true
                    onClicked: app.toggle(row.index)
                }
                Ring {
                    target: parent
                    on: app.pointing === row.index
                }
            }
        }
    }

    // The ring round what the agent acts on, in the second colour, so
    // the reader sees where each call lands.
    component Ring: Rectangle {
        required property Item target
        property bool on: false
        x: (target === parent ? 0 : target.x) - 4
        y: (target === parent ? 0 : target.y) - 4
        width: target.width + 8
        height: target.height + 8
        radius: Theme.radiusSmall
        color: "transparent"
        border.color: Theme.accent2
        border.width: 2
        opacity: on ? 1 : 0
        Accessible.ignored: true
        Behavior on opacity {
            NumberAnimation {
                duration: Theme.enterSmall
                easing.type: Easing.OutCubic
            }
        }
    }
}
