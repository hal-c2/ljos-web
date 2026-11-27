import Ljos.Ui
import Ljos.Core
import Ljos.Layout
// Ljos.Ui has no `ShaderEffect` yet: it comes from QtQuick, by name.
import QtQuick as Q
import Site
import "logic/shader.ts" as ShaderLogic

// Liquid light: a GLSL fragment shader, written out in logic/shader.ts,
// whose uniforms are the effect's own properties. The light swirls
// round the pointer (round a slow path of its own when no pointer is
// over it), a tap sends a ripple out, the chips choose its colours,
// and "Edit shader" opens its source beside it: what you type is what
// the next frame draws. An edit that does not compile keeps the last
// picture that did, and the editor marks the lines the compiler named.
// Try loopSeconds, startPalette, or FLOW and SWIRL in the shader.
Rectangle {
    id: root
    width: 720
    height: 420
    fill: look.canvas
    activeFocusOnTab: true

    // Remix knobs: one loop of the light, and under reduced motion,
    // which slows it and never stops it; the colours it opens with.
    property real loopSeconds: 12
    property real calmLoopSeconds: 36
    property int startPalette: 0
    // Below this width the source opens under the picture, not beside it.
    property int besideFrom: 640

    // Host contract: DemoFrame pauses off-screen demos and slows calm ones.
    property bool active: true
    property bool calm: false
    readonly property real pace: ShaderLogic.radiansPerSecond(calm, loopSeconds, calmLoopSeconds)
    // The poster holds until the shader compiles; a broken edit later
    // keeps the picture before it, which is the last that did.
    readonly property bool ready: effect.status === Q.ShaderEffect.Compiled || kept.status === Q.ShaderEffect.Compiled

    // The source the reader is writing, and the last of it that compiled.
    property string draft: ShaderLogic.SOURCE
    property string good: ShaderLogic.SOURCE
    readonly property bool broken: effect.status === Q.ShaderEffect.Error
    readonly property var diagnostics: broken ? ShaderLogic.diagnosticsOf(effect.log, draft) : []
    property bool editing: false
    readonly property bool beside: width >= besideFrom

    // Where the vortex is led: the pointer while one is over the
    // picture, its own slow path while none is.
    property bool led: false
    property var aim: ShaderLogic.wander(0)

    onDraftChanged: later(root.settle)
    function settle(): void {
        if (effect.status === Q.ShaderEffect.Compiled)
            good = draft;
    }
    function rippleAt(x: real, y: real): void {
        effect.tap = point(x, y);
        effect.ripple = 0;
    }
    function reset(): void {
        editor.text = ShaderLogic.SOURCE;
        draft = ShaderLogic.SOURCE;
    }

    Keys.onPressed: (event: KeyEvent) => {
        if (event.key === Key.Space || event.key === Key.Return) {
            root.rippleAt(effect.pointer.x, effect.pointer.y);
            event.accepted = true;
        }
    }

    Object {
        id: look
        readonly property bool dark: App.hints.colorScheme === ColorScheme.Dark
        readonly property color canvas: dark ? "#0b0d16" : "#f6f4ee"
        readonly property color ink: dark ? "#eef0f7" : "#1b1f2a"
        readonly property color muted: dark ? "#b4bccd" : "#3d4454"
        // The bars and the source over the picture: enough of the page
        // behind them to read on, light still showing through.
        readonly property color glass: dark ? "#d90b0d16" : "#e6f6f4ee"
        readonly property color chip: dark ? "#2b3144" : "#e4e0d5"
        readonly property color accent: dark ? "#7ee0c3" : "#0d6b57"
        readonly property color onAccent: dark ? "#08140f" : "#ffffff"
        readonly property color error: dark ? "#ff9a8a" : "#a3271a"
    }

    Q.ShaderEffect {
        id: effect
        anchors.fill: parent
        // Each uniform the shader declares, by its name.
        property real time: 0
        property point pointer: point(root.aim.x, root.aim.y)
        property point tap: point(0.5, 0.5)
        property real ripple: ShaderLogic.RIPPLE_DONE
        property real palette: ShaderLogic.paletteOf(root.startPalette)
        property real dark: look.dark ? 1 : 0
        property point resolution: point(Math.max(width, 1), Math.max(height, 1))
        // An edit that does not compile draws nothing here: the last that
        // did is drawn under it instead.
        visible: !root.broken
        fragmentShader: ShaderLogic.addressOf(root.draft)
        onStatusChanged: root.settle()

        // Paused off screen so an idle card runs at 0 % CPU and resumes in phase.
        FrameAnimation {
            running: true
            paused: !root.active
            onTriggered: {
                effect.time = ShaderLogic.advanceTime(effect.time, frameTime, root.pace);
                if (effect.ripple < ShaderLogic.RIPPLE_DONE)
                    effect.ripple = ShaderLogic.advanceRipple(effect.ripple, frameTime, root.calm);
                const target = root.led ? root.aim : ShaderLogic.wander(effect.time);
                const next = ShaderLogic.follow(effect.pointer, target, frameTime, root.calm);
                effect.pointer = point(next.x, next.y);
            }
        }
    }
    // The last source that compiled, while the one being written does
    // not: no size, so nothing drawn, otherwise.
    Q.ShaderEffect {
        id: kept
        width: root.broken ? root.width : 0
        height: root.broken ? root.height : 0
        property real time: effect.time
        property point pointer: effect.pointer
        property point tap: effect.tap
        property real ripple: effect.ripple
        property real palette: effect.palette
        property real dark: effect.dark
        property point resolution: effect.resolution
        fragmentShader: ShaderLogic.addressOf(root.good)
    }

    PointerArea {
        anchors.fill: parent
        hoverEnabled: true
        Accessible.name: t`Shader picture. Move or drag over it to swirl the light; tap to send a ripple.`
        Accessible.role: Accessible.Button
        Accessible.onPressAction: root.rippleAt(effect.pointer.x, effect.pointer.y)
        function aimAt(x: real, y: real): void {
            const uv = ShaderLogic.uvOf(x, y, width, height);
            root.aim = uv;
            root.led = true;
        }
        onPositionChanged: aimAt(mouseX, mouseY)
        onPressed: {
            aimAt(mouseX, mouseY);
            root.rippleAt(root.aim.x, root.aim.y);
        }
        onContainsMouseChanged: if (!containsMouse && !pressed) root.led = false
        onReleased: if (!containsMouse) root.led = false
    }

    // --- What it says, and the source button -------------------------------
    Rectangle {
        id: header
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        height: Math.max(hint.implicitHeight, editButton.height) + 20
        fill: look.glass

        Text {
            id: hint
            anchors.left: parent.left
            anchors.right: editButton.left
            anchors.verticalCenter: parent.verticalCenter
            anchors.leftMargin: 14
            anchors.rightMargin: 10
            wrap: Text.Wrap
            color: look.ink
            font.size: 14
            text: t`Drag to swirl the light · tap for a ripple`
        }
        Rectangle {
            id: editButton
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            anchors.rightMargin: 10
            width: editLabel.implicitWidth + 28
            height: 40
            radius: 8
            fill: root.editing ? look.chip : look.accent
            activeFocusOnTab: true
            Accessible.name: root.editing ? t`Close the shader's source` : t`Edit the shader's source`
            Accessible.role: Accessible.Button
            Accessible.onPressAction: root.editing = !root.editing
            Keys.onPressed: (event: KeyEvent) => {
                if (event.key === Key.Space || event.key === Key.Return) {
                    root.editing = !root.editing;
                    event.accepted = true;
                }
            }
            Text {
                id: editLabel
                anchors.centerIn: parent
                color: root.editing ? look.ink : look.onAccent
                font.size: 15
                font.weight: Font.Bold
                text: root.editing ? t`Close source` : t`Edit shader`
            }
            PointerArea {
                anchors.fill: parent
                onClicked: root.editing = !root.editing
            }
        }
    }

    // --- The colours --------------------------------------------------------
    Rectangle {
        id: bar
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: chips.implicitHeight + 20
        fill: look.glass

        Flow {
            id: chips
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            anchors.leftMargin: 10
            anchors.rightMargin: 10
            spacing: 8

            Repeater {
                model: ShaderLogic.PALETTES
                delegate: Rectangle {
                    id: chip
                    required property string modelData
                    required property int index
                    readonly property bool chosen: effect.palette === index
                    width: chipLabel.implicitWidth + 44
                    height: 40
                    radius: 20
                    fill: chosen ? look.accent : look.chip
                    activeFocusOnTab: true
                    Accessible.name: t`${modelData} colours`
                    Accessible.role: Accessible.RadioButton
                    Accessible.checked: chosen
                    Accessible.onPressAction: effect.palette = chip.index
                    Keys.onPressed: (event: KeyEvent) => {
                        if (event.key === Key.Space || event.key === Key.Return) {
                            effect.palette = chip.index;
                            event.accepted = true;
                        }
                    }
                    // The palette's first colour, as the shader draws it.
                    Rectangle {
                        anchors.left: parent.left
                        anchors.leftMargin: 12
                        anchors.verticalCenter: parent.verticalCenter
                        width: 14
                        height: 14
                        radius: 7
                        fill: ["#1af2bf", "#ff521f", "#0dbfff"][chip.index]
                    }
                    Text {
                        id: chipLabel
                        anchors.left: parent.left
                        anchors.leftMargin: 32
                        anchors.verticalCenter: parent.verticalCenter
                        color: chip.chosen ? look.onAccent : look.ink
                        font.size: 15
                        text: chip.modelData
                    }
                    PointerArea {
                        anchors.fill: parent
                        onClicked: effect.palette = chip.index
                    }
                }
            }
        }
    }

    // --- The source, edited live --------------------------------------------
    Rectangle {
        id: panel
        visible: root.editing
        x: root.beside ? Math.round(root.width * 0.46) : 0
        y: root.beside ? header.height : Math.round(header.height + (root.height - header.height - bar.height) * 0.3)
        width: root.width - x
        height: root.height - bar.height - y
        fill: look.glass
        clip: true
        border.color: editor.activeFocus ? Theme.focusRing : "transparent"
        border.width: 2

        Text {
            id: heading
            anchors.left: parent.left
            anchors.top: parent.top
            anchors.margins: 12
            color: look.muted
            font.size: 13
            text: t`Fragment shader · GLSL ES 3.0`
        }
        Rectangle {
            id: resetButton
            anchors.right: parent.right
            anchors.verticalCenter: heading.verticalCenter
            anchors.rightMargin: 10
            width: resetLabel.implicitWidth + 24
            height: 32
            radius: 6
            fill: look.chip
            activeFocusOnTab: true
            Accessible.name: t`Reset the shader's source`
            Accessible.role: Accessible.Button
            Accessible.onPressAction: root.reset()
            Keys.onPressed: (event: KeyEvent) => {
                if (event.key === Key.Space || event.key === Key.Return) {
                    root.reset();
                    event.accepted = true;
                }
            }
            Text {
                id: resetLabel
                anchors.centerIn: parent
                color: look.ink
                font.size: 14
                text: t`Reset`
            }
            PointerArea {
                anchors.fill: parent
                onClicked: root.reset()
            }
        }

        Flickable {
            id: scroll
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: resetButton.bottom
            anchors.bottom: told.top
            anchors.margins: 10
            contentWidth: editor.width
            contentHeight: editor.height
            clip: true

            CodeEditor {
                id: editor
                // The Flickable's own width: its content item is as wide as
                // the editor, so `parent.width` would go round.
                width: Math.max(scroll.width, implicitWidth)
                code: ShaderLogic.SOURCE
                lang: "glsl"
                label: t`Edit the fragment shader`
                color: look.ink
                diagnostics: root.diagnostics
                errors: told
                onTextChanged: retype.restart()
            }
        }
        Text {
            id: told
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            anchors.margins: 12
            height: root.broken ? implicitHeight : 0
            wrap: Text.Wrap
            color: look.error
            font.size: 13
            maximumLineCount: 3
            elide: Text.ElideRight
            text: root.broken ? t`Did not compile; keeping the last working version: ${ShaderLogic.toldOf(root.diagnostics)}` : ""
        }
    }

    // A pause in the typing, and the next frame draws what was typed.
    Timer {
        id: retype
        interval: 250
        onTriggered: root.draft = editor.text
    }
}
