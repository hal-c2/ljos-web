import QtQuick
import Ljos.Core
// The site's look by the module's name: the dispatch app's Theme is
// Ljós.Controls', and both are wanted here.
import Site as Page
import Ljos.Controls as Controls
import "Dispatch"
import "logic/session.ts" as Session
import "logic/agent.ts" as Agent

// An agent building an app over MCP, replayed: the calls of a real
// session against `ljos mcp` and `ljos run --mcp` (logic/session.ts,
// made from recordings/agent-built.json) beside Brekka Grid's dispatch
// card (Demos/Dispatch/), a made-up grid operator's app, running here.
// Each step puts the running card where that call left it: the filter
// it added, the ink it fixed, the press it made. What the card logs
// comes back beside it, as the agent reads it with `app_watch`; at the
// step where the agent waits on the person at the app, it waits on the
// reader.
//
// It is a component of its own so a page can hold it anywhere: give it
// a size, and `active` while it is on screen. `autoplay` starts it,
// `loop` starts it again at its end; `live` is an edit of the dispatch
// app to run instead, which ends the replay.
Item {
    id: demo
    width: 1280
    height: 760

    // Driven by the page that embeds this file; harmless standalone.
    property bool active: true
    property bool calm: false
    property var live: null
    property bool autoplay: true
    property bool loop: false

    readonly property int total: Session.steps.length
    // The calls made so far: 0 is before the first.
    property int step: 0
    property bool playing: false
    readonly property var current: step > 0 ? Session.steps[step - 1] : null
    // Waiting on the reader: the agent's `app_watch` for a log line.
    readonly property bool waiting: current !== null && current.waits && live === null
    // A line the reader's own pick logged while the agent waited.
    property string yours: ""
    // What the app logged, newest first: [{ line, n }].
    property var heard: []
    property int count: 0

    readonly property bool across: width >= 880
    readonly property var card: app.item && app.item.card !== undefined ? app.item.card : null
    // The ink the session found the card with.
    readonly property string inkBefore: Agent.literalOf(Session.before, "statusInk")
    // What the running card shows now, so a step changes only what it
    // changes and a press the reader made stays.
    property var shown: ({ filter: true, fixed: true, openOnly: false })

    function find(name: string): var {
        if (name === "card")
            return demo.card;
        const walk = (item) => {
            if (!item)
                return null;
            if (item.objectName === name && item.visible)
                return item;
            const kids = Array.from(item.children ?? []);
            if (item.contentItem && !kids.includes(item.contentItem))
                kids.push(item.contentItem);
            for (const kid of kids) {
                const hit = walk(kid);
                if (hit)
                    return hit;
            }
            return null;
        };
        return walk(demo.card);
    }

    // The card as the session has it at this step.
    function show(all: bool) {
        if (!demo.card || demo.live)
            return;
        const at = demo.current ?? { filter: false, fixed: false, openOnly: false };
        const filter = demo.find("openFilter") ?? demo.hiddenFilter;
        const list = demo.find("ticketList");
        if (filter && (all || at.filter !== demo.shown.filter)) {
            demo.hiddenFilter = at.filter ? null : filter;
            filter.visible = at.filter;
        }
        if (all || at.fixed !== demo.shown.fixed)
            demo.card.statusInk = at.fixed ? Qt.binding(() => Controls.Theme.warningForeground) : demo.inkBefore;
        if (filter && list && (all || at.openOnly !== demo.shown.openOnly)) {
            filter.checked = at.openOnly;
            list.openOnly = at.openOnly;
        }
        demo.shown = { filter: at.filter, fixed: at.fixed, openOnly: at.openOnly };
    }
    // The filter while the session has not added it: hidden, so not found.
    property var hiddenFilter: null

    function go(next: int) {
        const to = Agent.clamp(next, demo.total);
        // The agent's wait ends with a pick: the reader's, or the one the
        // person in the recording made.
        if (demo.waiting && to > demo.step && demo.yours === "")
            demo.pickForThem();
        demo.step = to;
    }
    function advance() {
        if (demo.step < demo.total)
            demo.go(demo.step + 1);
        else if (demo.loop)
            demo.restart();
        else
            demo.playing = false;
    }
    function toggle() {
        if (!demo.playing && demo.step >= demo.total)
            demo.restart();
        demo.playing = !demo.playing;
    }
    function restart() {
        demo.step = 0;
        demo.yours = "";
        demo.heard = [];
        demo.hiddenFilter = null;
        demo.shown = { filter: true, fixed: true, openOnly: false };
        // A fresh card, as the session's began: what the reader changed
        // in it goes with the old one.
        app.active = false;
        app.active = true;
    }
    function pickForThem() {
        const combo = demo.find("crew-" + Session.pick.ticket);
        if (!combo || !demo.card)
            return;
        combo.currentIndex = Array.from(combo.model).indexOf(Session.pick.crew);
        demo.card.log(Session.pick.line);
    }
    function logged(line: string) {
        demo.count += 1;
        demo.heard = [{ line, n: demo.count }].concat(demo.heard).slice(0, 4);
        if (demo.waiting && line.indexOf(" assigned to ") >= 0 && demo.yours === "") {
            demo.yours = line;
            answered.restart();
        }
    }

    onStepChanged: {
        demo.show(false);
        if (beat.running)
            beat.restart();
        place.restart();
    }
    onLiveChanged: {
        if (demo.live) {
            demo.playing = false;
            demo.step = demo.total;
        } else {
            demo.restart();
        }
    }
    onActiveChanged: if (demo.active && demo.autoplay && !demo.started) {
        demo.started = true;
        demo.playing = true;
    }
    property bool started: false
    Component.onCompleted: if (demo.active && demo.autoplay) {
        demo.started = true;
        demo.playing = true;
    }

    // How long a step stays, by how much there is to read in it.
    Timer {
        id: beat
        interval: demo.current ? Agent.dwell(demo.current.short.split("\n").length + demo.current.args.split("\n").length) : 1600
        running: demo.playing && demo.active && !demo.waiting && demo.live === null
        onTriggered: demo.advance()
    }
    // The agent waits on the reader a while, then takes the recorded pick.
    Timer {
        id: patience
        interval: 9000
        running: demo.playing && demo.active && demo.waiting && demo.yours === ""
        onTriggered: demo.go(demo.step + 1)
    }
    // The reader's pick shows before the agent reads it.
    Timer {
        id: answered
        interval: 900
        onTriggered: if (demo.waiting)
            demo.go(demo.step + 1)
    }
    // Once the step's changes are laid out: its row in view, its ring on
    // what it touched.
    Timer {
        id: place
        interval: 60
        onTriggered: {
            calls.bring(demo.step);
            ring.follow();
            settle.restart();
        }
    }
    // Again once the card's own motion is over.
    Timer {
        id: settle
        interval: 340
        onTriggered: ring.follow()
    }
    onWidthChanged: place.restart()
    onHeightChanged: place.restart()

    Rectangle {
        anchors.fill: parent
        color: Page.Theme.surface
    }

    // The running app, and what it logs.
    Item {
        id: stage
        x: demo.across ? log.width : 0
        width: demo.across ? demo.width - log.width : demo.width
        height: demo.across ? demo.height : Math.round(demo.height * 0.5)

        Rectangle {
            id: window
            anchors.fill: parent
            anchors.margins: demo.across ? Page.Theme.l : Page.Theme.s
            anchors.bottomMargin: (demo.across ? Page.Theme.l : Page.Theme.s) + strip.height + Page.Theme.s
            radius: Page.Theme.radius
            color: Page.Theme.stage
            border.color: Page.Theme.stageEdge
            border.width: 1
            clip: true

            Item {
                id: bar
                width: parent.width
                height: 36
                Rectangle {
                    id: lamp
                    x: Page.Theme.s
                    anchors.verticalCenter: parent.verticalCenter
                    width: 8
                    height: 8
                    radius: 4
                    color: Page.Theme.accent
                }
                Text {
                    anchors.left: lamp.right
                    anchors.leftMargin: Page.Theme.xs
                    anchors.right: parent.right
                    anchors.rightMargin: Page.Theme.s
                    anchors.verticalCenter: parent.verticalCenter
                    text: demo.live ? t`Your edit of Main.qml, running` : Session.commands[0]
                    color: Page.Theme.textMuted
                    font.family: demo.live ? Page.Theme.sans : Page.Theme.mono
                    font.pixelSize: Page.Theme.captionSize
                    elide: Text.ElideRight
                }
                Rectangle {
                    anchors.bottom: parent.bottom
                    width: parent.width
                    height: 1
                    color: Page.Theme.stageEdge
                }
            }

            Loader {
                id: app
                anchors.fill: parent
                anchors.topMargin: bar.height
                sourceComponent: demo.live ? null : own
                source: demo.live ?? undefined
                onLoaded: {
                    demo.shown = { filter: true, fixed: true, openOnly: false };
                    demo.show(true);
                    place.restart();
                }
            }
            Connections {
                target: app.item
                ignoreUnknownSignals: true
                function onLogged(line) {
                    demo.logged(line);
                }
            }

            // What the step's call was about, ringed in the running app.
            Rectangle {
                id: ring
                property string tool: ""
                property bool on: false
                color: "transparent"
                radius: Page.Theme.radiusSmall + 2
                border.color: Page.Theme.accent
                border.width: 2
                opacity: on ? 1 : 0
                visible: opacity > 0
                Behavior on opacity {
                    NumberAnimation {
                        duration: Page.Theme.enterSmall
                        easing.type: Easing.OutCubic
                    }
                }
                Behavior on x {
                    enabled: !demo.calm && ring.on
                    NumberAnimation { duration: Page.Theme.enterPanel; easing.type: Easing.OutCubic }
                }
                Behavior on y {
                    enabled: !demo.calm && ring.on
                    NumberAnimation { duration: Page.Theme.enterPanel; easing.type: Easing.OutCubic }
                }
                Behavior on width {
                    enabled: !demo.calm && ring.on
                    NumberAnimation { duration: Page.Theme.enterPanel; easing.type: Easing.OutCubic }
                }
                Behavior on height {
                    enabled: !demo.calm && ring.on
                    NumberAnimation { duration: Page.Theme.enterPanel; easing.type: Easing.OutCubic }
                }

                function follow() {
                    const name = demo.waiting ? "crew-" + Session.pick.ticket : demo.current ? demo.current.mark : "";
                    const target = name !== "" ? demo.find(name) : null;
                    if (!target || demo.live) {
                        ring.on = false;
                        return;
                    }
                    const at = target.mapToItem(window, 0, 0);
                    const box = { x: Math.round(at.x - 4), y: Math.round(at.y - 4), width: Math.round(target.width + 8), height: Math.round(target.height + 8) };
                    ring.tool = demo.waiting ? t`waiting on you` : demo.current.tool;
                    if (demo.calm && ring.on && (box.x !== ring.x || box.y !== ring.y)) {
                        // Reduced motion: it fades to its new place.
                        hop.box = box;
                        hop.restart();
                        return;
                    }
                    ring.x = box.x;
                    ring.y = box.y;
                    ring.width = box.width;
                    ring.height = box.height;
                    ring.on = true;
                }

                Rectangle {
                    x: 0
                    y: -height - 4
                    width: tag.implicitWidth + 2 * Page.Theme.xs
                    height: 20
                    radius: 4
                    color: Page.Theme.accent
                    Text {
                        id: tag
                        anchors.centerIn: parent
                        text: ring.tool
                        color: Page.Theme.textOnAccent
                        font.family: Page.Theme.mono
                        font.pixelSize: 12
                    }
                }
            }
            SequentialAnimation {
                id: hop
                property var box: ({ x: 0, y: 0, width: 0, height: 0 })
                NumberAnimation { target: ring; property: "opacity"; to: 0; duration: Page.Theme.exitSmall }
                ScriptAction {
                    script: {
                        ring.x = hop.box.x;
                        ring.y = hop.box.y;
                        ring.width = hop.box.width;
                        ring.height = hop.box.height;
                    }
                }
                NumberAnimation { target: ring; property: "opacity"; to: 1; duration: Page.Theme.enterSmall }
            }
        }

        // What the app logged: what the agent's `app_watch` hears.
        Column {
            id: strip
            x: window.x
            width: window.width
            anchors.bottom: parent.bottom
            anchors.bottomMargin: demo.across ? Page.Theme.l : Page.Theme.s
            spacing: Page.Theme.xxs
            Accessible.role: Accessible.List
            Accessible.name: t`From the app`

            Text {
                text: t`From the app`
                color: Page.Theme.textMuted
                font.family: Page.Theme.sans
                font.pixelSize: Page.Theme.captionSize
                font.weight: Font.DemiBold
            }
            Text {
                visible: demo.heard.length === 0
                width: parent.width
                height: 2 * 20
                text: t`Nothing logged yet. The card logs a line when its filter changes or a crew is assigned.`
                color: Page.Theme.textMuted
                font.family: Page.Theme.sans
                font.pixelSize: Page.Theme.captionSize
                wrapMode: Text.Wrap
            }
            Repeater {
                model: demo.heard.slice(0, 2)
                Text {
                    required property var modelData
                    required property int index
                    width: strip.width
                    height: 20
                    text: "console.info  " + modelData.line
                    color: index === 0 ? Page.Theme.text : Page.Theme.textMuted
                    font.family: Page.Theme.mono
                    font.pixelSize: Page.Theme.captionSize
                    elide: Text.ElideRight
                    Accessible.role: Accessible.ListItem
                    Accessible.name: modelData.line
                    opacity: 0
                    Component.onCompleted: opacity = 1
                    Behavior on opacity {
                        NumberAnimation { duration: Page.Theme.enterSmall; easing.type: Easing.OutCubic }
                    }
                }
            }
        }
    }

    // The session: its calls, and the player's keys.
    Rectangle {
        id: log
        y: demo.across ? 0 : stage.height
        width: demo.across ? Math.round(Math.min(560, Math.max(420, demo.width * 0.4))) : demo.width
        height: demo.across ? demo.height : demo.height - stage.height
        color: Page.Theme.surfaceRaised

        Rectangle {
            visible: demo.across
            anchors.right: parent.right
            width: 1
            height: parent.height
            color: Page.Theme.divider
        }
        Rectangle {
            visible: !demo.across
            width: parent.width
            height: 1
            color: Page.Theme.divider
        }

        Column {
            id: head
            x: Page.Theme.m
            y: Page.Theme.m
            width: log.width - 2 * Page.Theme.m
            spacing: Page.Theme.xs

            Text {
                width: parent.width
                text: t`Agent session`
                color: Page.Theme.text
                font.family: Page.Theme.sans
                font.pixelSize: Page.Theme.subtitleSize
                font.weight: Font.DemiBold
                wrapMode: Text.Wrap
                Accessible.role: Accessible.Heading
            }
            Rectangle {
                width: Math.min(parent.width, replay.implicitWidth + 2 * Page.Theme.s + 14)
                height: Math.max(26, replay.height + 8)
                radius: height / 2
                color: Page.Theme.surface
                border.color: Page.Theme.border
                border.width: 1
                Rectangle {
                    x: Page.Theme.s
                    anchors.verticalCenter: parent.verticalCenter
                    width: 6
                    height: 6
                    radius: 3
                    color: Page.Theme.textMuted
                }
                Text {
                    id: replay
                    x: Page.Theme.s + 14
                    width: parent.width - x - Page.Theme.s
                    anchors.verticalCenter: parent.verticalCenter
                    text: t`Recorded replay — no live model is called`
                    color: Page.Theme.text
                    font.family: Page.Theme.sans
                    font.pixelSize: Page.Theme.captionSize
                    wrapMode: Text.Wrap
                }
            }
            Text {
                width: parent.width
                text: t`Recorded ${Session.recordedOn} against Ljós ${Session.ljos}, the calls and answers as they came.`
                color: Page.Theme.textMuted
                font.family: Page.Theme.sans
                font.pixelSize: Page.Theme.captionSize
                wrapMode: Text.Wrap
            }
            Text {
                visible: demo.live !== null
                width: parent.width
                text: t`Your edit is running, so the replay has ended. Set your edits back to replay it.`
                color: Page.Theme.text
                font.family: Page.Theme.sans
                font.pixelSize: Page.Theme.captionSize
                wrapMode: Text.Wrap
            }
        }

        Flickable {
            id: calls
            x: 0
            y: head.y + head.height + Page.Theme.s
            width: log.width - 1
            height: keys.y - y - Page.Theme.s
            contentWidth: width
            contentHeight: list.height + Page.Theme.m
            boundsBehavior: Flickable.StopAtBounds
            clip: true
            Accessible.role: Accessible.List
            Accessible.name: t`The agent's calls`

            // The current call's row in view, from its top.
            function bring(at: int) {
                const row = at > 0 ? rows.itemAt(at - 1) : null;
                const most = Math.max(0, contentHeight - height);
                const to = row ? Math.max(0, Math.min(most, row.y - Page.Theme.xs)) : 0;
                if (Math.abs(to - contentY) < 1)
                    return;
                if (demo.calm) {
                    glide.to = to;
                    fade.restart();
                } else {
                    glide.to = to;
                    glide.restart();
                }
            }
            NumberAnimation {
                id: glide
                target: calls
                property: "contentY"
                duration: Page.Theme.enterPanel
                easing.type: Easing.OutCubic
            }
            SequentialAnimation {
                id: fade
                NumberAnimation { target: list; property: "opacity"; to: 0; duration: Page.Theme.exitSmall }
                ScriptAction { script: calls.contentY = glide.to }
                NumberAnimation { target: list; property: "opacity"; to: 1; duration: Page.Theme.enterSmall }
            }

            Column {
                id: list
                x: Page.Theme.m
                width: calls.width - 2 * Page.Theme.m
                spacing: Page.Theme.xxs

                // The brief the session carries out.
                Rectangle {
                    width: parent.width
                    height: brief.height + 2 * Page.Theme.s
                    radius: Page.Theme.radiusSmall
                    color: Page.Theme.surface
                    border.color: Page.Theme.border
                    border.width: 1
                    Rectangle {
                        width: 3
                        height: parent.height - 2 * Page.Theme.xs
                        x: Page.Theme.xs
                        y: Page.Theme.xs
                        radius: 2
                        color: Page.Theme.accent
                    }
                    Text {
                        id: brief
                        x: Page.Theme.s + Page.Theme.xs
                        y: Page.Theme.s
                        width: parent.width - x - Page.Theme.s
                        text: t`The brief: give the dispatch card a filter for open tickets, try it in the running app, and keep every status legible in light and dark.`
                        color: Page.Theme.text
                        font.family: Page.Theme.sans
                        font.pixelSize: Page.Theme.captionSize + 1
                        wrapMode: Text.Wrap
                    }
                }
                Item {
                    width: 1
                    height: Page.Theme.xs
                }

                Repeater {
                    id: rows
                    model: Session.steps
                    Call {
                        required property var modelData
                        required property int index
                        width: list.width
                        item: modelData
                        place: index + 1
                    }
                }
            }
        }

        // The player's keys, under the calls.
        Column {
            id: keys
            x: Page.Theme.m
            y: log.height - height - Page.Theme.m
            width: log.width - 2 * Page.Theme.m
            spacing: Page.Theme.xs

            Item {
                width: parent.width
                height: 20
                Text {
                    id: where
                    anchors.verticalCenter: parent.verticalCenter
                    text: t`Step ${demo.step} of ${demo.total}`
                    color: Page.Theme.textMuted
                    font.family: Page.Theme.sans
                    font.pixelSize: Page.Theme.captionSize
                }
                // One mark a call: done, this one, still to come.
                Row {
                    id: marks
                    anchors.left: where.right
                    anchors.leftMargin: Page.Theme.s
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 3
                    Accessible.role: Accessible.ProgressBar
                    Accessible.name: t`Step ${demo.step} of ${demo.total}`
                    Repeater {
                        model: demo.total
                        Rectangle {
                            required property int index
                            width: (marks.width - (demo.total - 1) * marks.spacing) / demo.total
                            height: 4
                            radius: 2
                            color: index < demo.step - 1 ? Page.Theme.accent : index === demo.step - 1 ? Page.Theme.accentHover : Page.Theme.border
                            Behavior on color {
                                ColorAnimation { duration: Page.Theme.moveSmall }
                            }
                        }
                    }
                }
            }
            Row {
                spacing: Page.Theme.xs
                Page.StageButton {
                    text: t`Restart`
                    label: t`Restart replay`
                    onPressed: {
                        demo.restart();
                        demo.playing = true;
                    }
                }
                Page.StageButton {
                    text: "←"
                    label: t`Previous step`
                    enabled: demo.step > 0 && demo.live === null
                    implicitWidth: 40
                    onPressed: {
                        demo.playing = false;
                        demo.go(demo.step - 1);
                    }
                }
                Page.StageButton {
                    primary: true
                    text: demo.playing ? t`Pause` : t`Play replay`
                    enabled: demo.live === null
                    implicitWidth: Math.max(108, implicitHeight)
                    onPressed: demo.toggle()
                }
                Page.StageButton {
                    text: "→"
                    label: t`Next step`
                    enabled: demo.step < demo.total && demo.live === null
                    implicitWidth: 40
                    onPressed: {
                        demo.playing = false;
                        demo.go(demo.step + 1);
                    }
                }
            }
        }
    }

    Component {
        id: own
        Main {}
    }

    // One call of the session: its tool and server, what it is for, and,
    // at the step it is, what was sent and what came back.
    component Call: Item {
        id: call
        property var item: null
        // Its step: 1 for the first call.
        property int place: 0
        readonly property bool now: demo.step === place
        readonly property bool done: demo.step > place
        property bool whole: false
        readonly property bool long: item.short !== item.answer
        readonly property bool edit: item.tool === "qml_edit_apply"
        readonly property var lines: edit ? Agent.changedLines(Session.before, Session.edits, item.edit) : [0, -1]
        readonly property var cut: edit ? Agent.excerpt(Agent.sourceAt(Session.before, Session.edits, item.edit), lines[0], lines[1], 1) : ({ first: 1, lines: [] })

        onNowChanged: if (!now)
            whole = false
        height: body.height + 2 * Page.Theme.xs
        opacity: now || done ? 1 : 0.6
        Behavior on opacity {
            NumberAnimation { duration: Page.Theme.moveSmall }
        }

        Rectangle {
            anchors.fill: parent
            radius: Page.Theme.radiusSmall
            color: call.now ? Page.Theme.surface : hit.containsMouse ? Page.Theme.surfaceHover : "transparent"
            border.color: call.activeFocus ? Page.Theme.focusRing : call.now ? Page.Theme.border : "transparent"
            border.width: call.activeFocus ? 2 : 1
            Behavior on color {
                ColorAnimation { duration: Page.Theme.moveSmall }
            }
        }
        MouseArea {
            id: hit
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            Accessible.ignored: true
            onClicked: {
                demo.playing = false;
                demo.go(call.place);
            }
        }
        activeFocusOnTab: true
        Accessible.role: Accessible.Button
        Accessible.name: t`Step ${call.place}: ${call.item.tool}`
        Accessible.description: call.item.says
        Accessible.onPressAction: () => demo.go(call.place)
        Keys.onPressed: (event) => {
            if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                demo.playing = false;
                demo.go(call.place);
                event.accepted = true;
            }
        }

        Column {
            id: body
            x: Page.Theme.xs
            y: Page.Theme.xs
            width: call.width - 2 * Page.Theme.xs
            spacing: Page.Theme.xxs

            Item {
                width: parent.width
                height: 24
                Rectangle {
                    id: number
                    anchors.verticalCenter: parent.verticalCenter
                    width: 22
                    height: 22
                    radius: 11
                    color: call.done || call.now ? Page.Theme.accent : "transparent"
                    border.color: call.done || call.now ? "transparent" : Page.Theme.border
                    border.width: 1
                    Text {
                        anchors.centerIn: parent
                        text: String(call.place)
                        color: call.done || call.now ? Page.Theme.textOnAccent : Page.Theme.textMuted
                        font.family: Page.Theme.sans
                        font.pixelSize: 12
                        font.weight: Font.DemiBold
                    }
                }
                Text {
                    id: tool
                    anchors.left: number.right
                    anchors.leftMargin: Page.Theme.xs
                    anchors.verticalCenter: parent.verticalCenter
                    text: call.item.tool
                    color: Page.Theme.text
                    font.family: Page.Theme.mono
                    font.pixelSize: Page.Theme.codeSize
                    font.weight: Font.DemiBold
                }
                Rectangle {
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    width: server.implicitWidth + 2 * Page.Theme.xs
                    height: 20
                    radius: 4
                    color: call.item.via === "authoring" ? Page.Theme.surfaceSelected : "transparent"
                    border.color: Page.Theme.border
                    border.width: 1
                    Text {
                        id: server
                        anchors.centerIn: parent
                        text: call.item.via === "authoring" ? "ljos mcp" : "ljos run --mcp"
                        color: Page.Theme.textMuted
                        font.family: Page.Theme.mono
                        font.pixelSize: 12
                    }
                }
            }
            Text {
                x: 22 + Page.Theme.xs
                width: parent.width - x
                text: call.item.says
                color: call.now ? Page.Theme.text : Page.Theme.textMuted
                font.family: Page.Theme.sans
                font.pixelSize: Page.Theme.captionSize
                lineHeightMode: Text.FixedHeight
                lineHeight: 18
                wrapMode: Text.Wrap
            }

            // At its step: the call, what it changed, and its answer.
            Column {
                visible: call.now
                x: 22 + Page.Theme.xs
                width: parent.width - x
                spacing: Page.Theme.xxs
                topPadding: Page.Theme.xxs

                Caption { text: t`Called with` }
                Code { width: parent.width; text: call.item.args }

                Caption {
                    visible: call.edit
                    text: t`${Session.file}, lines ${call.lines[0]}–${call.lines[1]}, after it`
                }
                Rectangle {
                    visible: call.edit
                    width: parent.width
                    height: changed.height + 2 * Page.Theme.xs
                    radius: 4
                    color: Page.Theme.codeBg
                    Column {
                        id: changed
                        y: Page.Theme.xs
                        width: parent.width
                        Repeater {
                            model: call.cut.lines
                            Rectangle {
                                required property string modelData
                                required property int index
                                readonly property int line: call.cut.first + index
                                readonly property bool wrote: line >= call.lines[0] && line <= call.lines[1]
                                width: changed.width
                                height: words.height
                                color: wrote ? Qt.rgba(Page.Theme.accent.r, Page.Theme.accent.g, Page.Theme.accent.b, 0.16) : "transparent"
                                Text {
                                    id: gutter
                                    width: 32
                                    horizontalAlignment: Text.AlignRight
                                    text: String(line)
                                    elide: Text.ElideRight
                                    color: Page.Theme.codeGutter
                                    font.family: Page.Theme.mono
                                    font.pixelSize: 12
                                }
                                Text {
                                    id: words
                                    x: 40
                                    width: parent.width - x - Page.Theme.xs
                                    text: (wrote ? "+ " : "  ") + modelData
                                    color: Page.Theme.codeFg
                                    font.family: Page.Theme.mono
                                    font.pixelSize: 12
                                    lineHeightMode: Text.FixedHeight
                                    lineHeight: 17
                                    wrapMode: Text.WrapAnywhere
                                }
                            }
                        }
                    }
                }

                Caption { text: call.item.failed ? t`It answered with an error` : t`It answered` }
                Code {
                    width: parent.width
                    text: call.whole ? call.item.answer : call.item.short
                    edge: call.item.failed ? Page.Theme.danger : "transparent"
                }
                Page.StageButton {
                    visible: call.long
                    text: call.whole ? t`Show less` : t`Show the whole answer`
                    checkable: true
                    checked: call.whole
                    onPressed: call.whole = !call.whole
                }

                // The step where the agent waits on the reader.
                Text {
                    visible: call.item.waits && demo.live === null
                    width: parent.width
                    text: demo.yours !== "" ? t`You assigned a crew: the app logged “${demo.yours}”.`
                        : t`Waiting on you: pick a crew for ${Session.pick.ticket} in the card. Without one, the agent takes the recorded pick.`
                    color: Page.Theme.text
                    font.family: Page.Theme.sans
                    font.pixelSize: Page.Theme.captionSize
                    font.weight: Font.DemiBold
                    wrapMode: Text.Wrap
                }
                Text {
                    visible: call.place === demo.total && demo.yours !== ""
                    width: parent.width
                    text: t`On this page it was your pick: “${demo.yours}”.`
                    color: Page.Theme.text
                    font.family: Page.Theme.sans
                    font.pixelSize: Page.Theme.captionSize
                    wrapMode: Text.Wrap
                }
            }
        }
    }

    component Caption: Text {
        color: Page.Theme.textMuted
        font.family: Page.Theme.sans
        font.pixelSize: 12
        font.weight: Font.DemiBold
    }

    // Code as it was sent or came back: monospaced, wrapped anywhere, as
    // its lines are longer than the column.
    component Code: Rectangle {
        id: code
        property string text: ""
        property color edge: "transparent"
        height: words.height + 2 * Page.Theme.xs
        radius: 4
        color: Page.Theme.codeBg
        border.color: edge
        border.width: 1
        Text {
            id: words
            x: Page.Theme.xs
            y: Page.Theme.xs
            width: code.width - 2 * Page.Theme.xs
            text: code.text
            color: Page.Theme.codeFg
            font.family: Page.Theme.mono
            font.pixelSize: 12
            lineHeightMode: Text.FixedHeight
            lineHeight: 17
            wrapMode: Text.WrapAnywhere
        }
    }
}
