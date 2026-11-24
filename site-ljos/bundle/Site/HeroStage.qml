import Ljos.Ui
import QtQuick as Q
import Ljos.Core
import Ljos.Layout
import Site
import "hero.js" as Hero
import "logic/tasks.ts" as Tasks

// The front page's device: a small live app, and under it what a person
// or an agent sees of it while it runs: its source, its objects with
// their live values (Observer), and a recorded agent session that drives
// it through the same calls an agent makes over MCP (Agent). Every value
// shown is the running app's own, read as it changes.
DeviceFrame {
    id: hero

    // The app's tree as the Observer shows it, above its tasks.
    readonly property list<Tasks.Line> lines: [
        { depth: 0, type: "Column", name: "#app", key: "done", value: String(app.done), point: "" },
        { depth: 1, type: "Text", name: "#title", key: "text", value: "\"" + app.heading + "\"", point: "title" },
        { depth: 1, type: "Rectangle", name: "#progress", key: "value", value: app.progress.toFixed(2), point: "progress" },
        { depth: 1, type: "Repeater", name: "#list", key: "count", value: String(app.tasks.length), point: "" }
    ]

    title: "TaskList.qml"
    tabs: [t`Source`, t`Observer`, t`Agent`]
    // The app alone until a tab is picked, and all of it: its four tasks
    // clear of the tabs.
    current: -1
    stageHeight: 320
    pageHeight: current < 0 ? 0 : 252

    // The task the recorded agent ticks, and the title it gives the list.
    readonly property string aimed: t`Write the release notes`
    readonly property string renamed: t`Beta week`
    readonly property string locator: "role=checkbox[name=\"" + aimed + "\"]"
    // The recorded session: each call as the agent sent it, and what it
    // does to the running app, which answers with what it now holds.
    readonly property list<Tasks.Step> steps: [
        { tool: "app_find", args: "{ locator: '" + locator + "' }", act: () => {
            const at = app.find(hero.aimed);
            app.pointing = at;
            return at >= 0 ? t`1 match` : t`no match`;
        } },
        { tool: "app_click", args: "{ target: '" + locator + "' }", act: () => {
            const at = app.find(hero.aimed);
            app.pointing = at;
            app.toggle(at);
            return "checked: " + app.tasks[at]?.done;
        } },
        { tool: "app_set_property", args: "{ target: \"#title\", property: \"text\", value: \"" + renamed + "\" }", act: () => {
            app.pointing = "title";
            app.rename(hero.renamed);
            return "text: \"" + app.heading + "\"";
        } },
        { tool: "app_inspect", args: "{ target: \"#progress\" }", act: () => {
            app.pointing = "progress";
            return "value: " + app.progress.toFixed(2);
        } }
    ]
    // What each call answered, in order.
    property list<string> answers: []

    function step(): void {
        const call = steps[answers.length];
        if (call === undefined)
            return;
        const said = call.act();
        answers = answers.concat([said]);
        Running.calls = Tasks.withCall(Running.calls, { tool: call.tool, args: call.args, said: said });
    }
    function replay(): void {
        answers = [];
        app.reset();
    }

    stage: HeroApp {
        id: app
        width: hero.stageWidth
        height: hero.stageHeight
    }

    pages: [
        // The source, as the app is written.
        DevicePage {
            frame: hero
            index: 0
            Rectangle {
                anchors.fill: parent
                fill: Theme.codeBg
            }
            Flickable {
                anchors.fill: parent
                contentWidth: width
                contentHeight: code.implicitHeight + 2 * Theme.m
                clip: true
                Text {
                    id: code
                    // As far from either side, so the same on a mirrored page.
                    x: Theme.m
                    y: Theme.m
                    width: parent.width - 2 * Theme.m
                    format: Text.RichText
                    text: Hero.rich()
                    color: Theme.codeFg
                    font.family: Theme.mono
                    font.size: 12
                    lineHeightMode: Text.FixedHeight
                    lineHeight: 18
                    wrap: Text.Wrap
                }
            }
        },
        // Its objects, with their values as they are now: a pointer on a
        // row rings that object in the app, as the Observer does.
        DevicePage {
            frame: hero
            index: 1
            Column {
                // As far from either side, so the same on a mirrored page.
                x: Theme.m
                y: Theme.s
                width: parent.width - 2 * Theme.m

                Repeater {
                    model: hero.lines.concat(app.tasks.map((task: Tasks.Task, at: number): Tasks.Line => ({ depth: 2, type: "Task", name: "\"" + task.title + "\"", key: "checked", value: String(task.done), point: at })))

                    Item {
                        id: line
                        required property Tasks.Line modelData
                        width: parent.width
                        height: 26

                        Rectangle {
                            anchors.fill: parent
                            radius: 4
                            fill: Theme.surfaceHover
                            opacity: hover.containsMouse ? 1 : 0
                        }
                        Row {
                            id: named
                            // Where it starts, read from the left; a right-to-left page
                            // sets it as far from the right (LayoutMirroring).
                            readonly property real startX: Theme.xs + line.modelData.depth * Theme.m
                            x: Q.LayoutMirroring.enabled ? parent.width - width - startX : startX
                            anchors.verticalCenter: parent.verticalCenter
                            spacing: Theme.xs
                            Text {
                                id: kind
                                text: line.modelData.type
                                color: Theme.text
                                font.family: Theme.mono
                                font.size: 12
                                font.weight: Font.Medium
                            }
                            // A long name gives way to its reading on the
                            // right, ending in an ellipsis, never under it.
                            Text {
                                width: Math.max(0, Math.min(implicitWidth, reading.startX - Theme.s - named.startX - kind.width - named.spacing))
                                text: line.modelData.name
                                elide: Text.ElideRight
                                color: Theme.accent2Text
                                font.family: Theme.mono
                                font.size: 12
                            }
                        }
                        Row {
                            id: reading
                            // Where it starts, read from the left; a right-to-left page
                            // sets it as far from the right (LayoutMirroring).
                            readonly property real startX: parent.width - width - Theme.xs
                            x: Q.LayoutMirroring.enabled ? parent.width - width - startX : startX
                            anchors.verticalCenter: parent.verticalCenter
                            spacing: Theme.xs
                            Text {
                                text: line.modelData.key
                                color: Theme.textMuted
                                font.family: Theme.mono
                                font.size: 12
                            }
                            Text {
                                text: line.modelData.value
                                color: Theme.link
                                font.family: Theme.mono
                                font.size: 12
                                font.weight: Font.DemiBold
                            }
                        }
                        PointerArea {
                            id: hover
                            anchors.fill: parent
                            hoverEnabled: true
                            Accessible.ignored: true
                            onContainsMouseChanged: app.pointing = containsMouse ? line.modelData.point : ""
                        }
                    }
                }
            }
        },
        // The recorded agent: each call, what the app answered, and the
        // next one to send.
        DevicePage {
            frame: hero
            index: 2
            Item {
                id: agentBar
                width: parent.width
                height: 48

                Rectangle {
                    // Where it starts, read from the left; a right-to-left page
                    // sets it as far from the right (LayoutMirroring).
                    readonly property real startX: Theme.m
                    x: Q.LayoutMirroring.enabled ? parent.width - width - startX : startX
                    anchors.verticalCenter: parent.verticalCenter
                    width: badge.implicitWidth + 2 * Theme.xs
                    height: 22
                    radius: 11
                    fill: "transparent"
                    border.color: Theme.accent2
                    border.width: 1
                    Text {
                        id: badge
                        anchors.centerIn: parent
                        text: t`Recorded replay`
                        color: Theme.accent2Text
                        font.family: Theme.sans
                        font.size: 12
                        font.weight: Font.DemiBold
                    }
                }
                Row {
                    // Where it starts, read from the left; a right-to-left page
                    // sets it as far from the right (LayoutMirroring).
                    readonly property real startX: parent.width - width - Theme.m
                    x: Q.LayoutMirroring.enabled ? parent.width - width - startX : startX
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: Theme.xs
                    StageButton {
                        text: t`Reset demo`
                        enabled: hero.answers.length > 0
                        onPressed: hero.replay()
                    }
                    StageButton {
                        primary: true
                        text: t`Next step`
                        enabled: hero.answers.length < hero.steps.length
                        onPressed: hero.step()
                    }
                }
            }
            Column {
                y: agentBar.height
                // As far from either side, so the same on a mirrored page.
                x: Theme.m
                width: parent.width - 2 * Theme.m
                spacing: Theme.xs

                Repeater {
                    model: hero.steps

                    Column {
                        id: call
                        required property Tasks.Step modelData
                        required property int index
                        readonly property bool sent: index < hero.answers.length
                        readonly property bool next: index === hero.answers.length
                        width: parent.width
                        opacity: sent ? 1 : next ? 0.7 : 0.35
                        Behavior on opacity {
                            NumberAnimation {
                                duration: Theme.enterSmall
                            }
                        }

                        Text {
                            width: parent.width
                            elide: Text.ElideRight
                            format: Text.StyledText
                            text: "<b>" + call.modelData.tool + "</b> " + call.modelData.args.replace(/&/g, "&amp;").replace(/</g, "&lt;")
                            color: Theme.text
                            font.family: Theme.mono
                            font.size: 12
                            lineHeightMode: Text.FixedHeight
                            lineHeight: 18
                        }
                        Text {
                            visible: call.sent
                            Layout.leftMargin: Theme.m
                            text: "→ " + (call.sent ? hero.answers[call.index] : "")
                            color: Theme.link
                            font.family: Theme.mono
                            font.size: 12
                            lineHeightMode: Text.FixedHeight
                            lineHeight: 18
                        }
                    }
                }
            }
        }
    ]
}
