import Ljos.Ui
import Ljos.Core
import Ljos.Layout
import Site
import "logic/tasks.ts" as Tasks

// The front page's live app: a list of tasks and how far through it you
// are (its source is hero.js's). The reader ticks tasks; the hero's
// recorded agent drives the same app through what an agent would call
// (`toggle`, `rename`), and `pointing` rings the part it acts on.
Item {
    id: app

    property string heading: t`Launch week`
    property list<Tasks.Task> tasks: [
        { title: t`Sketch the shell`, done: true },
        { title: t`Wire up the Observer`, done: true },
        { title: t`Write the release notes`, done: false },
        { title: t`Ship the beta`, done: false }
    ]
    readonly property int done: tasks.filter((task: Tasks.Task) => task.done).length
    readonly property real progress: tasks.length > 0 ? done / tasks.length : 0
    // What the agent acts on: "title", "progress", a task's index, or "".
    property Tasks.Pointing pointing: ""

    function toggle(at: number): void {
        if (tasks[at] === undefined)
            return;
        tasks = tasks.map((task: Tasks.Task, i: number): Tasks.Task => i === at ? { title: task.title, done: !task.done } : task);
    }
    function rename(words: string): void {
        heading = words;
    }
    function find(title: string): number {
        return Tasks.indexOf(tasks, title);
    }
    function reset(): void {
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
        // Where it starts, read from the left; a right-to-left page
        // sets it as far from the right (LayoutMirroring).
        readonly property real startX: Theme.l
        x: LayoutMirroring.enabled ? parent.width - width - startX : startX
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
                font.size: Theme.titleSize
                font.weight: Font.DemiBold
                font.letterSpacing: -0.3
            }
            Text {
                anchors.right: parent.right
                anchors.baseline: titleText.baseline
                text: t`${app.done} of ${app.tasks.length} done`
                color: Theme.textMuted
                font.family: Theme.sans
                font.size: Theme.captionSize
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
                fill: Theme.surfaceHover
            }
            Rectangle {
                width: Math.round(parent.width * app.progress)
                height: parent.height
                radius: 3
                fill: Theme.accent
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
                required property Tasks.Task modelData
                required property int index

                width: parent.width
                height: 40
                activeFocusOnTab: true
                Accessible.role: Accessible.CheckBox
                Accessible.name: modelData.title
                Accessible.checkable: true
                Accessible.checked: modelData.done
                Accessible.onPressAction: () => app.toggle(index)
                Keys.onPressed: (event: KeyEvent) => {
                    if (event.key === Key.Space || event.key === Key.Return || event.key === Key.Enter) {
                        app.toggle(row.index);
                        event.accepted = true;
                    }
                }

                Rectangle {
                    anchors.fill: parent
                    radius: Theme.radiusSmall
                    fill: area.containsMouse ? Theme.surfaceHover : "transparent"
                }
                Rectangle {
                    id: box
                    // Where it starts, read from the left; a right-to-left page
                    // sets it as far from the right (LayoutMirroring).
                    readonly property real startX: Theme.xs
                    x: LayoutMirroring.enabled ? parent.width - width - startX : startX
                    anchors.verticalCenter: parent.verticalCenter
                    width: 20
                    height: 20
                    radius: 6
                    fill: row.modelData.done ? Theme.accent : "transparent"
                    border.color: row.modelData.done ? Theme.accent : Theme.border
                    border.width: 1.5
                    Behavior on fill {
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
                        font.size: 13
                        font.weight: Font.Bold
                        Accessible.ignored: true
                    }
                }
                Text {
                    // Where it starts, read from the left; a right-to-left page
                    // sets it as far from the right (LayoutMirroring).
                    readonly property real startX: box.startX + box.width + Theme.s
                    x: LayoutMirroring.enabled ? parent.width - width - startX : startX
                    anchors.verticalCenter: parent.verticalCenter
                    width: parent.width - startX - Theme.xs
                    elide: Text.ElideRight
                    text: row.modelData.title
                    color: row.modelData.done ? Theme.textMuted : Theme.text
                    font.family: Theme.sans
                    font.size: Theme.bodySize - 1
                    font.strikeout: row.modelData.done
                }
                PointerArea {
                    id: area
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Cursor.PointingHand
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
        fill: "transparent"
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
