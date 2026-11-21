// Written by scripts/agent-session.mjs from recordings/agent-built.json,
// a real session against Ljós's MCP servers: change the recording, not
// this file. Each step is a call as it was sent and the answer as it
// came, with a sentence on what it is for and what the page's running
// app shows after it.

import type { Change } from "./agent.ts"

export type Via = "authoring" | "inspector"

export interface Step {
    readonly via: Via
    readonly tool: string
    readonly args: string
    readonly answer: string
    readonly short: string
    readonly failed: boolean
    readonly says: string
    // The app's item to ring: an objectName, or none.
    readonly mark: string
    // Whether the agent waits here on the person at the app.
    readonly waits: boolean
    // How many of the edits stand after it.
    readonly edit: number
    // The running app after it: the filter there, the ink fixed, the filter on.
    readonly filter: boolean
    readonly fixed: boolean
    readonly openOnly: boolean
}

export const recordedOn: string = "2026-11-21"
export const ljos: string = "67608bc4c"
export const commands: readonly string[] = ["ljos run --headless --mcp=inspect,input,mutate --watch Main.qml","ljos mcp --project . --caps fs","ljos attach ."]
export const file: string = "DispatchCard.qml"
export const before: string = "// Ljos.Core before QtQuick: only its t`` is wanted here, and any name\n// both have stays QtQuick's, the later import.\nimport Ljos.Core\nimport QtQuick\nimport Ljos.Controls\nimport Ljos.Design\nimport \"logic/tickets.ts\" as Tickets\n\n// Brekka Grid's dispatch card: the tickets a shift has, each with its\n// status and the crew on it. Assigning a crew logs a line, which is\n// what an agent following the app reads (`app_watch`, `app_logs`).\nCard {\n    id: dispatch\n    objectName: \"dispatch\"\n\n    // Reduced motion: the list changes by a crossfade, nothing slides.\n    property bool calm: Motion.reduced\n    // The ink of an open ticket's status: a role of the theme, which\n    // keeps 4.5:1 on the fills it is drawn on in every scheme.\n    property color statusInk: \"#d97706\"\n    readonly property bool narrow: width < 520\n\n    signal logged(string line)\n\n    function log(line: string) {\n        console.info(line);\n        dispatch.logged(line);\n    }\n\n    padding: 0\n\n    Column {\n        width: dispatch.availableWidth\n\n        Item {\n            id: headerRow\n            objectName: \"headerRow\"\n            width: parent.width\n            height: Math.max(72, heading.implicitHeight + 32)\n\n            Rectangle {\n                id: mark\n                x: 20\n                anchors.verticalCenter: parent.verticalCenter\n                width: 36\n                height: 36\n                radius: 18\n                color: Theme.accentSurface\n                Icon {\n                    anchors.centerIn: parent\n                    name: \"zap\"\n                    color: Theme.link\n                }\n            }\n            Column {\n                id: heading\n                anchors.left: mark.right\n                anchors.leftMargin: 12\n                anchors.right: tools.left\n                anchors.rightMargin: 12\n                anchors.verticalCenter: parent.verticalCenter\n                Label {\n                    width: parent.width\n                    text: t`Brekka Grid`\n                    color: Theme.textMuted\n                    font.pixelSize: Typography.captionSize\n                    wrapMode: Text.Wrap\n                }\n                Label {\n                    width: parent.width\n                    text: ticketList.openOnly\n                          ? t`Dispatch · ${Tickets.count(Tickets.all, true)} open`\n                          : t`Dispatch · ${Tickets.all.length} tickets`\n                    font.pixelSize: Typography.subtitleSize\n                    font.weight: Font.DemiBold\n                    wrapMode: Text.Wrap\n                    Accessible.role: Accessible.Heading\n                }\n            }\n            Row {\n                id: tools\n                anchors.right: parent.right\n                anchors.rightMargin: 16\n                anchors.verticalCenter: parent.verticalCenter\n                spacing: Theme.spacing\n            }\n        }\n\n        Rectangle {\n            width: parent.width\n            height: 1\n            color: Theme.border\n        }\n\n        Column {\n            id: ticketList\n            objectName: \"ticketList\"\n            width: parent.width\n\n            // Set by the header's filter, when it has one.\n            property bool openOnly: false\n            // What the rows show: `openOnly` at once, or once the list\n            // has faded out where motion is reduced.\n            property bool applied: openOnly\n            onOpenOnlyChanged: {\n                dispatch.log(openOnly ? \"filter: open only\" : \"filter: all tickets\");\n                if (dispatch.calm)\n                    crossfade.restart();\n                else\n                    applied = openOnly;\n            }\n            SequentialAnimation {\n                id: crossfade\n                NumberAnimation { target: ticketList; property: \"opacity\"; to: 0; duration: Motion.exitSmall; easing.type: Easing.InCubic }\n                ScriptAction { script: ticketList.applied = ticketList.openOnly }\n                NumberAnimation { target: ticketList; property: \"opacity\"; to: 1; duration: Motion.enterSmall; easing.type: Easing.OutCubic }\n            }\n\n            // The rows that stay slide to their new place, and none of it\n            // lays the card out again each frame.\n            move: dispatch.calm ? null : slide\n            Transition {\n                id: slide\n                NumberAnimation { properties: \"y\"; duration: Motion.movePanel; easing.type: Easing.InOutCubic }\n            }\n\n            Repeater {\n                model: Tickets.all\n\n                Item {\n                    id: row\n                    required property var modelData\n                    required property int index\n                    readonly property bool open: modelData.status === \"open\"\n\n                    objectName: \"ticket-\" + modelData.id\n                    width: ticketList.width\n                    height: Math.max(64, (dispatch.narrow ? words.implicitHeight + side.implicitHeight + 8\n                                                          : Math.max(words.implicitHeight, side.implicitHeight)) + 24)\n                    visible: Tickets.shows(modelData, ticketList.applied)\n                    // A row that comes back fades in where the others slide\n                    // apart for it. Not the Column's `add`: Ljós's native\n                    // positioner leaves an item it adds at the transition's\n                    // `from`.\n                    onVisibleChanged: if (visible && !dispatch.calm) appear.restart()\n                    NumberAnimation {\n                        id: appear\n                        target: row\n                        property: \"opacity\"\n                        from: 0\n                        to: 1\n                        duration: Motion.enterPanel\n                        easing.type: Easing.OutCubic\n                    }\n\n                    Column {\n                        id: words\n                        anchors.left: parent.left\n                        anchors.leftMargin: 20\n                        anchors.right: dispatch.narrow ? parent.right : side.left\n                        anchors.rightMargin: dispatch.narrow ? 16 : 12\n                        y: dispatch.narrow ? 12 : Math.round((row.height - height) / 2)\n                        spacing: 2\n                        Label {\n                            width: parent.width\n                            text: row.modelData.id + \" · \" + row.modelData.site\n                            color: Theme.textMuted\n                            font.pixelSize: Typography.captionSize\n                            wrapMode: Text.Wrap\n                        }\n                        Label {\n                            width: parent.width\n                            text: row.modelData.title\n                            font.pixelSize: Typography.bodySize\n                            font.weight: Font.Medium\n                            wrapMode: Text.Wrap\n                        }\n                    }\n\n                    Row {\n                        id: side\n                        x: dispatch.narrow ? 20 : row.width - width - 16\n                        y: dispatch.narrow ? words.y + words.height + 8 : Math.round((row.height - height) / 2)\n                        spacing: 12\n\n                        Rectangle {\n                            id: statusPill\n                            objectName: \"statusPill\"\n                            anchors.verticalCenter: parent.verticalCenter\n                            width: stateText.implicitWidth + 16\n                            height: 22\n                            radius: 11\n                            // A fill the theme reaches its inks against, so the\n                            // state keeps 4.5:1 here; the edge carries the hue.\n                            color: Theme.surfaceRaised\n                            border.width: 1\n                            border.color: row.open ? Theme.warningForeground : Theme.border\n                            Label {\n                                id: stateText\n                                objectName: \"stateText\"\n                                anchors.centerIn: parent\n                                text: row.open ? t`Open` : t`Closed`\n                                color: row.open ? dispatch.statusInk : Theme.textMuted\n                                font.pixelSize: Typography.captionSize\n                                font.weight: Font.DemiBold\n                            }\n                        }\n                        // A closed ticket's crew is history: it is read, not\n                        // picked, so it is a label rather than a control\n                        // switched off.\n                        ComboBox {\n                            objectName: \"crew-\" + row.modelData.id\n                            visible: row.open\n                            // Wider with larger text, so no name is cut.\n                            width: Math.max(148, implicitWidth)\n                            model: Tickets.crews\n                            currentIndex: Tickets.crewIndex(row.modelData.crew)\n                            Accessible.name: t`Assign crew to ${row.modelData.id}`\n                            onActivated: dispatch.log(Tickets.assigned(row.modelData, currentText))\n                        }\n                        Label {\n                            visible: !row.open\n                            width: 148\n                            anchors.verticalCenter: parent.verticalCenter\n                            text: row.modelData.crew\n                            color: Theme.textMuted\n                            wrapMode: Text.Wrap\n                        }\n                    }\n\n                    Rectangle {\n                        anchors.bottom: parent.bottom\n                        anchors.left: parent.left\n                        anchors.leftMargin: 20\n                        anchors.right: parent.right\n                        height: 1\n                        color: Theme.border\n                        opacity: 0.6\n                    }\n                }\n            }\n        }\n    }\n}\n"
export const edits: readonly (readonly Change[])[] = [[{"start":2887,"end":2887,"replacement":"                Button {\n                    id: openFilter\n                    objectName: \"openFilter\"\n                    text: t`Open only`\n                    checkable: true\n                    onToggled: ticketList.openOnly = checked\n                }\n"}],[{"start":764,"end":773,"replacement":"Theme.warningForeground"}]]
// The crew the person picked while the agent waited, and the line it logged.
export const pick: { readonly ticket: string; readonly crew: string; readonly line: string } = {"ticket":"BG-415","crew":"Katrín S.","line":"BG-415 assigned to Katrín S."}
export const steps: readonly Step[] = [
    {
        "via": "authoring",
        "tool": "qml_edit_apply",
        "args": "{\n  \"path\": \"DispatchCard.qml\",\n  \"edit\": {\n    \"op\": \"insert_object\",\n    \"parent\": {\n      \"id\": \"tools\"\n    },\n    \"index\": 0,\n    \"text\": \"Button {\\n    id: openFilter\\n    objectName: \\\"openFilter\\\"\\n    text: t`Open only`\\n    checkable: true\\n    onToggled: ticketList.openOnly = checked\\n}\"\n  },\n  \"write\": true\n}",
        "answer": "{\n  \"changes\": [\n    {\n      \"end\": 2889,\n      \"replacement\": \"                Button {\\n                    id: openFilter\\n                    objectName: \\\"openFilter\\\"\\n                    text: t`Open only`\\n                    checkable: true\\n                    onToggled: ticketList.openOnly = checked\\n                }\\n\",\n      \"start\": 2889\n    }\n  ],\n  \"text\": null,\n  \"text_omitted\": false,\n  \"written\": true\n}",
        "short": "{\n  \"changes\": [\n    {\n      \"end\": 2889,\n      \"replacement\": \"                Button {\\n                    id: openFilter\\n                    objectName: \\\"openFilter\\\"\\n                    text: t`Open only`\\n                    checkable: true\\n                    onToggled: ticketList.openOnly = checked\\n                }\\n\",\n      \"start\": 2889\n    }\n  ],\n  \"text\": null,\n  \"text_omitted\": false,\n  \"written\": true\n}",
        "failed": false,
        "says": "Adds an “Open only” filter to the card’s header: a structural edit of DispatchCard.qml, saved.",
        "mark": "",
        "waits": false,
        "edit": 1,
        "filter": false,
        "fixed": false,
        "openOnly": false
    },
    {
        "via": "authoring",
        "tool": "qml_check",
        "args": "{\n  \"paths\": [\n    \"DispatchCard.qml\"\n  ]\n}",
        "answer": "{\n  \"diagnostics\": [],\n  \"next_cursor\": null\n}",
        "short": "{\n  \"diagnostics\": [],\n  \"next_cursor\": null\n}",
        "failed": false,
        "says": "Checks DispatchCard.qml: no errors, no warnings.",
        "mark": "",
        "waits": false,
        "edit": 1,
        "filter": false,
        "fixed": false,
        "openOnly": false
    },
    {
        "via": "inspector",
        "tool": "app_reload",
        "args": "{}",
        "answer": "no file changed; nothing was reloaded",
        "short": "no file changed; nothing was reloaded",
        "failed": false,
        "says": "Asks the running app to take the saved file. It watches its files and took it as it was saved, so nothing is left to reload.",
        "mark": "",
        "waits": false,
        "edit": 1,
        "filter": true,
        "fixed": false,
        "openOnly": false
    },
    {
        "via": "inspector",
        "tool": "app_find",
        "args": "{\n  \"locator\": \"role=button[name=\\\"Open only\\\"]\"\n}",
        "answer": "button \"Open only\" [e1] id=openFilter obj=openFilter at=600.812,74 size=83.188x28  (in window > genericcontainer)\n(1 matches)",
        "short": "button \"Open only\" [e1] id=openFilter obj=openFilter at=600.812,74 size=83.188x28  (in window > genericcontainer)\n(1 matches)",
        "failed": false,
        "says": "Finds the new filter in the running app by its role and name, as a person would.",
        "mark": "openFilter",
        "waits": false,
        "edit": 1,
        "filter": true,
        "fixed": false,
        "openOnly": false
    },
    {
        "via": "inspector",
        "tool": "app_audit",
        "args": "{\n  \"root\": \"#ticketList\",\n  \"matrix\": \"full\"\n}",
        "answer": "color-text-contrast (error): Text does not stand out enough from what is behind it (WCAG 2.2 1.4.3), in at least one colour scheme or contrast setting.\n  fix: Take text and surface from one palette or token pair made for each other (`palette.text` on `palette.base`), never a tint of the surface.\n  guide: docs/design/color.md#color-text-contrast\n  DispatchCard.qml:205:29: the text \"Open\" is #d97706 on #e9eaeb, a contrast of 2.64:1 where 4.5:1 is the least (APCA Lc 46)\n    2.64:1 < 4.5:1 | #stateText | at scheme=light contrast=normal; scheme=light contrast=high\n  DispatchCard.qml:205:29: the text \"Open\" is #d97706 on #e9eaeb, a contrast of 2.64:1 where 4.5:1 is the least (APCA Lc 46)\n    2.64:1 < 4.5:1 | #stateText | at scheme=light contrast=normal; scheme=light contrast=high\n  DispatchCard.qml:205:29: the text \"Open\" is #d97706 on #e9eaeb, a contrast of 2.64:1 where 4.5:1 is the least (APCA Lc 46)\n    2.64:1 < 4.5:1 | #stateText | at scheme=light contrast=normal; scheme=light contrast=high\nNot checked: color-state-only, color-surface-merge, color-translucent-surface, focus-escape-dismiss, focus-indicator-missing, motion-dropped-frames, motion-duration, motion-ease-in-enter, motion-frequent, motion-reduced-ignored, motion-scale-from-zero, motion-theme-switch; these checks press keys, toggle controls and run the application's handlers, which this audit was not asked to do.\n3 error(s), 0 warning(s), 0 hint(s) at current; scheme=light contrast=normal; scheme=light contrast=high; scheme=dark contrast=normal; scheme=dark contrast=high; font-scale=1.5; font-scale=2; size=small; font-scale=2 size=small",
        "short": "color-text-contrast (error): Text does not stand out enough from what is behind it (WCAG 2.2 1.4.3), in at least one colour scheme or contrast setting.\n  fix: Take text and surface from one palette or token pair made for each other (`palette.text` on `palette.base`), never a tint of the surface.\n  guide: docs/design/color.md#color-text-contrast\n  DispatchCard.qml:205:29: the text \"Open\" is #d97706 on #e9eaeb, a contrast of 2.64:1 where 4.5:1 is the least (APCA Lc 46)\n    2.64:1 < 4.5:1 | #stateText | at scheme=light contrast=normal; scheme=light contrast=high\n  DispatchCard.qml:205:29: the text \"Open\" is #d97706 on #e9eaeb, a contrast of 2.64:1 where 4.5:1 is the least (APCA Lc 46)\n    2.64:1 < 4.5:1 | #stateText | at scheme=light contrast=normal; scheme=light contrast=high\n  DispatchCard.qml:205:29: the text \"Open\" is #d97706 on #e9eaeb, a contrast of 2.64:1 where 4.5:1 is the least (APCA Lc 46)\n    2.64:1 < 4.5:1 | #stateText | at scheme=light contrast=normal; scheme=light contrast=high\nNot checked: color-state-only, color-surface-merge, color-translucent-surface, focus-escape-dismiss, focus-indicator-missing, motion-dropped-frames, motion-duration, motion-ease-in-enter, motion-frequent, motion-reduced-ignored, motion-scale-from-zero, motion-theme-switch; these checks press keys, toggle controls and run the application's handlers, which this audit was not asked to do.\n3 error(s), 0 warning(s), 0 hint(s) at current; scheme=light contrast=normal; scheme=light contrast=high; scheme=dark contrast=normal; scheme=dark contrast=high; font-scale=1.5; font-scale=2; size=small; font-scale=2 size=small",
        "failed": false,
        "says": "Audits the ticket list in light and dark, high contrast, larger text and a small window. In light, the text \"Open\" is #d97706 on #e9eaeb, a contrast of 2.64:1 where 4.5:1 is the least (APCA Lc 46).",
        "mark": "stateText",
        "waits": false,
        "edit": 1,
        "filter": true,
        "fixed": false,
        "openOnly": false
    },
    {
        "via": "inspector",
        "tool": "app_inspect",
        "args": "{\n  \"target\": \"at=501,157\",\n  \"dependencies\": \"color\"\n}",
        "answer": "label \"Open\" [e2] id=stateText obj=stateText readonly\nLabel id=stateText obj=stateText\ndeclared at DispatchCard.qml:205:29\nkey @2#card>DispatchCard|DispatchCard#ticketList/Repeater[0]~DispatchCard|DispatchCard/Column[0]/ticketList/Repeater[0].default[0]#stateText\ngeometry x=8 y=4 30.66x14; in the window at 485.34,150 size 30.66x14\nstate visible=true enabled=true focus=false lattice=\"active\"\ndependencies of `color`: bound at tier 1\n  reads: open of row, statusInk of card\n  read by: (a handler), (a handler)\nproperties (97):\n  objectName: string = stateText  (assigned)\n  x: real = 8  (assigned)\n  y: real = 4  (assigned)\n  width: real = 30.65625  (bound)\n  height: real = 14  (bound)\n  implicitWidth: real = 30.65625  (assigned)\n  implicitHeight: real = 14  (assigned)\n  parent: QtObject = Rectangle @52.1  (assigned)\n  childrenRect: rect = QRectF(0, 0, 0, 0)  (bound, read-only)\n  baselineOffset: real = 10.859375  (assigned)\n  anchors.centerIn: QtObject = Rectangle @52.1  (bound, tier 0, line 208, `parent`)\n  palette.alternateBase: color = #2b2b2b  (host)\n  palette.base: color = #000000  (host)\n  palette.brightText: color = #000000  (host)\n  palette.button: color = #2f2f2f  (host)\n  palette.buttonText: color = #d4d6d8  (host)\n  palette.dark: color = #c8c9cb  (host)\n  palette.highlight: color = #0d69f2  (host)\n  palette.highlightedText: color = #fdfdfd  (host)\n  palette.light: color = #1a1a1a  (host)\n  palette.link: color = #2f86b1  (host)\n  palette.mid: color = #626262  (host)\n  palette.midlight: color = #2c2c2c  (host)\n  palette.placeholderText: color = #88c8c9cb  (host)\n  palette.text: color = #eff0f2  (host)\n  palette.toolTipBase: color = #000000  (host)\n  palette.toolTipText: color = #ffffff  (host)\n  palette.window: color = #000000  (host)\n  palette.windowText: color = #d4d6d8  (host)\n  palette.active.alternateBase: color = #2b2b2b  (host)\n  palette.active.base: color = #000000  (host)\n  palette.active.brightText: color = #000000  (host)\n  palette.active.button: color = #2f2f2f  (host)\n  palette.active.buttonText: color = #d4d6d8  (host)\n  palette.active.dark: color = #c8c9cb  (host)\n  palette.active.highlight: color = #0d69f2  (host)\n  palette.active.highlightedText: color = #fdfdfd  (host)\n  palette.active.light: color = #1a1a1a  (host)\n  palette.active.link: color = #2f86b1  (host)\n  palette.active.mid: color = #626262  (host)\n  palette.active.midlight: color = #2c2c2c  (host)\n  palette.active.placeholderText: color = #88c8c9cb  (host)\n  palette.active.text: color = #eff0f2  (host)\n  palette.active.toolTipBase: color = #000000  (host)\n  palette.active.toolTipText: color = #ffffff  (host)\n  palette.active.window: color = #000000  (host)\n  palette.active.windowText: color = #d4d6d8  (host)\n  palette.inactive.alternateBase: color = #2b2b2b  (host)\n  palette.inactive.base: color = #000000  (host)\n  palette.inactive.brightText: color = #000000  (host)\n  palette.inactive.button: color = #2f2f2f  (host)\n  palette.inactive.buttonText: color = #d4d6d8  (host)\n  palette.inactive.dark: color = #c8c9cb  (host)\n  palette.inactive.highlight: color = #0d69f2  (host)\n  palette.inactive.highlightedText: color = #fdfdfd  (host)\n  palette.inactive.light: color = #1a1a1a  (host)\n  palette.inactive.link: color = #2f86b1  (host)\n  palette.inactive.mid: color = #626262  (host)\n  palette.inactive.midlight: color = #2c2c2c  (host)\n  palette.inactive.placeholderText: color = #88c8c9cb  (host)\n  palette.inactive.text: color = #eff0f2  (host)\n  palette.inactive.toolTipBase: color = #000000  (host)\n  palette.inactive.toolTipText: color = #ffffff  (host)\n  palette.inactive.window: color = #000000  (host)\n  palette.inactive.windowText: color = #d4d6d8  (host)\n  palette.disabled.alternateBase: color = #2b2b2b  (host)\n  palette.disabled.base: color = #292929  (host)\n  palette.disabled.brightText: color = #4d000000  (host)\n  palette.disabled.button: color = #2f2f2f  (host)\n  palette.disabled.buttonText: color = #4dd4d6d8  (host)\n  palette.disabled.dark: color = #c8c9cb  (host)\n  palette.disabled.highlight: color = #01060f  (host)\n  palette.disabled.highlightedText: color = #fdfdfd  (host)\n  palette.disabled.light: color = #1a1a1a  (host)\n  palette.disabled.link: color = #2f86b1  (host)\n  palette.disabled.mid: color = #626262  (host)\n  palette.disabled.midlight: color = #2c2c2c  (host)\n  palette.disabled.placeholderText: color = #88c8c9cb  (host)\n  palette.disabled.text: color = #7fc8c9cb  (host)\n  palette.disabled.toolTipBase: color = #000000  (host)\n  palette.disabled.toolTipText: color = #ffffff  (host)\n  palette.disabled.window: color = #000000  (host)\n  palette.disabled.windowText: color = #3f4040  (host)\n  text: string = Open  (bound, tier 1, line 209, `row.open ? t`Open` : t`Closed``)\n  color: color = #d97706  (bound, tier 1, line 210, `row.open ? dispatch.statusInk : Theme.textMuted`)\n  font: font = QFont(Sans Serif,-1,12,5,600,0,0,0,0,0,0,0,0,0,0,1,,0,0)  (bound, tier 0, line 211, `Typography.captionSize`)\n  horizontalAlignment: HAlignment = Text.AlignLeft (1)  (bound)\n  effectiveHorizontalAlignment: HAlignment = Text.AlignLeft (1)  (bound, read-only)\n  contentWidth: real = 30.65625  (assigned, read-only)\n  contentHeight: real = 14  (assigned, read-only)\n  linkColor: color = #2f93c2  (bound, line 8)\n  leftPadding: real = 0  (bound)\n  topPadding: real = 0  (bound)\n  rightPadding: real = 0  (bound)\n  bottomPadding: real = 0  (bound)\n  implicitBackgroundWidth: real = 0  (bound, read-only)\n  implicitBackgroundHeight: real = 0  (bound, read-only)\n(93 properties still at their default are left out; `all: true` lists them)",
        "short": "label \"Open\" [e2] id=stateText obj=stateText readonly\nLabel id=stateText obj=stateText\ndeclared at DispatchCard.qml:205:29\nkey @2#card>DispatchCard|DispatchCard#ticketList/Repeater[0]~DispatchCard|DispatchCard/Column[0]/ticketList/Repeater[0].default[0]#stateText\ngeometry x=8 y=4 30.66x14; in the window at 485.34,150 size 30.66x14\nstate visible=true enabled=true focus=false lattice=\"active\"\ndependencies of `color`: bound at tier 1\n  reads: open of row, statusInk of card\n  read by: (a handler), (a handler)\nproperties (97):\n… 83 lines left out\n  text: string = Open  (bound, tier 1, line 209, `row.open ? t`Open` : t`Closed``)\n  color: color = #d97706  (bound, tier 1, line 210, `row.open ? dispatch.statusInk : Theme.textMuted`)\n… 13 lines left out",
        "failed": false,
        "says": "Inspects a flagged label: its colour is a binding that reads the card’s statusInk, #d97706 here.",
        "mark": "stateText",
        "waits": false,
        "edit": 1,
        "filter": true,
        "fixed": false,
        "openOnly": false
    },
    {
        "via": "authoring",
        "tool": "qml_edit_apply",
        "args": "{\n  \"path\": \"DispatchCard.qml\",\n  \"edit\": {\n    \"op\": \"set_binding\",\n    \"object\": {\n      \"id\": \"dispatch\"\n    },\n    \"name\": \"statusInk\",\n    \"value\": \"Theme.warningForeground\"\n  },\n  \"write\": true\n}",
        "answer": "{\n  \"changes\": [\n    {\n      \"end\": 773,\n      \"replacement\": \"Theme.warningForeground\",\n      \"start\": 764\n    }\n  ],\n  \"text\": null,\n  \"text_omitted\": false,\n  \"written\": true\n}",
        "short": "{\n  \"changes\": [\n    {\n      \"end\": 773,\n      \"replacement\": \"Theme.warningForeground\",\n      \"start\": 764\n    }\n  ],\n  \"text\": null,\n  \"text_omitted\": false,\n  \"written\": true\n}",
        "failed": false,
        "says": "Binds the status ink to the theme’s warning colour, which is made legible on every surface, and saves DispatchCard.qml.",
        "mark": "",
        "waits": false,
        "edit": 2,
        "filter": true,
        "fixed": false,
        "openOnly": false
    },
    {
        "via": "authoring",
        "tool": "qml_check",
        "args": "{\n  \"paths\": [\n    \"DispatchCard.qml\"\n  ]\n}",
        "answer": "{\n  \"diagnostics\": [],\n  \"next_cursor\": null\n}",
        "short": "{\n  \"diagnostics\": [],\n  \"next_cursor\": null\n}",
        "failed": false,
        "says": "Checks DispatchCard.qml: no errors, no warnings.",
        "mark": "",
        "waits": false,
        "edit": 2,
        "filter": true,
        "fixed": false,
        "openOnly": false
    },
    {
        "via": "inspector",
        "tool": "app_reload",
        "args": "{}",
        "answer": "reloaded; generation 1",
        "short": "reloaded; generation 1",
        "failed": false,
        "says": "Asks the running app to take the saved file. It does, and keeps its state.",
        "mark": "",
        "waits": false,
        "edit": 2,
        "filter": true,
        "fixed": true,
        "openOnly": false
    },
    {
        "via": "inspector",
        "tool": "app_audit",
        "args": "{\n  \"root\": \"#ticketList\",\n  \"matrix\": \"full\"\n}",
        "answer": "Not checked: color-state-only, color-surface-merge, color-translucent-surface, focus-escape-dismiss, focus-indicator-missing, motion-dropped-frames, motion-duration, motion-ease-in-enter, motion-frequent, motion-reduced-ignored, motion-scale-from-zero, motion-theme-switch; these checks press keys, toggle controls and run the application's handlers, which this audit was not asked to do.\nNothing found. 0 error(s), 0 warning(s), 0 hint(s) at current; scheme=light contrast=normal; scheme=light contrast=high; scheme=dark contrast=normal; scheme=dark contrast=high; font-scale=1.5; font-scale=2; size=small; font-scale=2 size=small",
        "short": "Not checked: color-state-only, color-surface-merge, color-translucent-surface, focus-escape-dismiss, focus-indicator-missing, motion-dropped-frames, motion-duration, motion-ease-in-enter, motion-frequent, motion-reduced-ignored, motion-scale-from-zero, motion-theme-switch; these checks press keys, toggle controls and run the application's handlers, which this audit was not asked to do.\nNothing found. 0 error(s), 0 warning(s), 0 hint(s) at current; scheme=light contrast=normal; scheme=light contrast=high; scheme=dark contrast=normal; scheme=dark contrast=high; font-scale=1.5; font-scale=2; size=small; font-scale=2 size=small",
        "failed": false,
        "says": "Audits the ticket list again under every setting: nothing found.",
        "mark": "",
        "waits": false,
        "edit": 2,
        "filter": true,
        "fixed": true,
        "openOnly": false
    },
    {
        "via": "inspector",
        "tool": "app_click",
        "args": "{\n  \"target\": \"e1\"\n}",
        "answer": "clicked `e1` at 642.41,88\nchanged heading \"Dispatch · 3 open\" [e3] readonly\nchanged button \"Open only\" [e1] id=openFilter obj=openFilter focused checked\nremoved label \"BG-408 · West ridge\" readonly\nremoved label \"Battery test\" readonly\nremoved label \"Closed\" id=stateText obj=stateText readonly\nremoved label \"Maren T.\" readonly\nremoved label \"BG-404 · Harbour row\" readonly\nremoved label \"Meter seal check\" readonly\nremoved label \"Closed\" id=stateText obj=stateText readonly\nremoved label \"Jónas B.\" readonly\nremoved label \"BG-401 · Line 7, span 31\" readonly\nremoved label \"Vegetation clearance\" readonly\nremoved label \"Closed\" id=stateText obj=stateText readonly\nremoved label \"Emil R.\" readonly\n(snapshot 1: 2 changed, 0 added, 12 removed; 38 ms)",
        "short": "clicked `e1` at 642.41,88\nchanged heading \"Dispatch · 3 open\" [e3] readonly\nchanged button \"Open only\" [e1] id=openFilter obj=openFilter focused checked\nremoved label \"BG-408 · West ridge\" readonly\nremoved label \"Battery test\" readonly\nremoved label \"Closed\" id=stateText obj=stateText readonly\nremoved label \"Maren T.\" readonly\nremoved label \"BG-404 · Harbour row\" readonly\nremoved label \"Meter seal check\" readonly\nremoved label \"Closed\" id=stateText obj=stateText readonly\n… 6 lines left out",
        "failed": false,
        "says": "Presses the filter in the running app: the heading says “Dispatch · 3 open”, and the closed tickets leave the list.",
        "mark": "openFilter",
        "waits": false,
        "edit": 2,
        "filter": true,
        "fixed": true,
        "openOnly": true
    },
    {
        "via": "inspector",
        "tool": "app_snapshot",
        "args": "{\n  \"root\": \"#card\",\n  \"depth\": 2\n}",
        "answer": "- genericcontainer [e4] id=card obj=dispatch\n  - label \"Brekka Grid\" [e5] readonly\n  - heading \"Dispatch · 3 open\" [e3] readonly\n  - button \"Open only\" [e1] id=openFilter obj=openFilter focused checked\n    - (hidden: 6 nodes)\n  - label \"BG-419 · Quay\" [e6] readonly\n  - label \"Relay cabinet door sensor\" [e7] readonly\n  - label \"Open\" [e2] id=stateText obj=stateText readonly\n  - combobox \"Assign crew to BG-419\" [e8] obj=crew-BG-419 collapsed\n    - (hidden: 2 nodes)\n  - label \"BG-415 · Feeder 12\" [e9] readonly\n  - label \"Voltage sag log\" [e10] readonly\n  - label \"Open\" [e11] id=stateText obj=stateText readonly\n  - combobox \"Assign crew to BG-415\" [e12] obj=crew-BG-415 collapsed\n    - (hidden: 2 nodes)\n  - label \"BG-412 · Substation Nord-4\" [e13] readonly\n  - label \"Transformer fan alert\" [e14] readonly\n  - label \"Open\" [e15] id=stateText obj=stateText readonly\n  - combobox \"Assign crew to BG-412\" [e16] obj=crew-BG-412 collapsed\n    - (hidden: 2 nodes)\n  - (hidden: 57 nodes)\n(snapshot 2, 16 items)",
        "short": "- genericcontainer [e4] id=card obj=dispatch\n  - label \"Brekka Grid\" [e5] readonly\n  - heading \"Dispatch · 3 open\" [e3] readonly\n  - button \"Open only\" [e1] id=openFilter obj=openFilter focused checked\n    - (hidden: 6 nodes)\n  - label \"BG-419 · Quay\" [e6] readonly\n  - label \"Relay cabinet door sensor\" [e7] readonly\n  - label \"Open\" [e2] id=stateText obj=stateText readonly\n  - combobox \"Assign crew to BG-419\" [e8] obj=crew-BG-419 collapsed\n    - (hidden: 2 nodes)\n… 12 lines left out",
        "failed": false,
        "says": "Reads the card’s accessibility outline: what a screen reader hears, and the references an agent acts on.",
        "mark": "card",
        "waits": false,
        "edit": 2,
        "filter": true,
        "fixed": true,
        "openOnly": true
    },
    {
        "via": "inspector",
        "tool": "app_watch",
        "args": "{\n  \"topics\": [\n    \"logs\"\n  ]\n}",
        "answer": "frames 6, paints 0, logs 1, reloads 1, traces 0, models 0, wakes 0, rests 7 (the counts to give as `since`). The UI thread sleeps for 4 ms; no frame is owed; not at rest",
        "short": "frames 6, paints 0, logs 1, reloads 1, traces 0, models 0, wakes 0, rests 7 (the counts to give as `since`). The UI thread sleeps for 4 ms; no frame is owed; not at rest",
        "failed": false,
        "says": "Asks for the app’s counts, to wait from them.",
        "mark": "",
        "waits": false,
        "edit": 2,
        "filter": true,
        "fixed": true,
        "openOnly": true
    },
    {
        "via": "inspector",
        "tool": "app_watch",
        "args": "{\n  \"topics\": [\n    \"logs\"\n  ],\n  \"since\": {\n    \"frames\": 6,\n    \"logs\": 1,\n    \"models\": 0,\n    \"paints\": 0,\n    \"reloads\": 1,\n    \"rests\": 7,\n    \"traces\": 0,\n    \"wakes\": 0\n  },\n  \"wait_ms\": 30000,\n  \"settle_ms\": 800\n}",
        "answer": "frames 19, paints 0, logs 2, reloads 1, traces 0, models 0, wakes 0, rests 21; changed: logs. The UI thread sleeps until something happens; no frame is owed; at rest",
        "short": "frames 19, paints 0, logs 2, reloads 1, traces 0, models 0, wakes 0, rests 21; changed: logs. The UI thread sleeps until something happens; no frame is owed; at rest",
        "failed": false,
        "says": "Waits for the app to log something. On this page it waits for you: assign a crew to a ticket in the card.",
        "mark": "",
        "waits": true,
        "edit": 2,
        "filter": true,
        "fixed": true,
        "openOnly": true
    },
    {
        "via": "inspector",
        "tool": "app_logs",
        "args": "{\n  \"since\": 1,\n  \"level\": \"info\"\n}",
        "answer": "2 info DispatchCard.qml:26 BG-415 assigned to Katrín S.\n(1 lines; `since: 2` gives what comes after)\n",
        "short": "2 info DispatchCard.qml:26 BG-415 assigned to Katrín S.\n(1 lines; `since: 2` gives what comes after)\n",
        "failed": false,
        "says": "Reads what the app logged: the crew the person at the app picked.",
        "mark": "",
        "waits": false,
        "edit": 2,
        "filter": true,
        "fixed": true,
        "openOnly": true
    }
]
