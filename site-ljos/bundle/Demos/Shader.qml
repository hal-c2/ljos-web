// Ljos.Core before QtQuick so t`` is available while shared names stay QtQuick's.
import Ljos.Core
import QtQuick
import "logic/shader.ts" as ShaderLogic

// A custom GLSL fragment shader (light.frag) wired straight to QML properties
// as uniforms, with loop timing and palette maths in logic/shader.ts.
// Move the pointer to stir the waves; tap or press Space to cycle palettes.
// Try changing loopSeconds, startPalette, or the wave constants in light.frag.
Rectangle {
    id: root
    width: 720
    height: 420
    color: look.canvas
    activeFocusOnTab: true

    // Remix knobs: one-line edits change the cycle speed and opening palette.
    property real loopSeconds: 24
    property real calmLoopSeconds: 72
    property int startPalette: 0
    // Not a knob: light.frag draws exactly three ramps for each scheme.
    readonly property int paletteCount: 3

    // Host contract: DemoFrame pauses off-screen demos and slows calm ones.
    property bool active: true
    property bool calm: false
    readonly property real pace: ShaderLogic.radiansPerSecond(calm, loopSeconds, calmLoopSeconds)
    // Stays false until the shader compiles so the poster holds until then.
    readonly property bool ready: effect.status === ShaderEffect.Compiled

    Keys.onPressed: (event) => {
        if (event.key === Qt.Key_Space || event.key === Qt.Key_Return) {
            effect.cycle();
            event.accepted = true;
        }
    }

    QtObject {
        id: look
        readonly property bool dark: Application.styleHints.colorScheme === Qt.ColorScheme.Dark
        readonly property color canvas: dark ? "#101320" : "#f6f4ee"
        readonly property color ink: dark ? "#e6e9f2" : "#1b1f2a"
        readonly property color muted: dark ? "#aeb6c9" : "#3d4454"
    }

    ShaderEffect {
        id: effect
        anchors.fill: parent
        // Uniforms in the exact order light.frag declares them.
        property real time: 0
        property point pointer: Qt.point(0.3, 0.6)
        property int choice: root.startPalette
        property real palette: ShaderLogic.paletteIndex(choice, look.dark, root.paletteCount)
        property point resolution: Qt.point(Math.max(width, 1), Math.max(height, 1))
        fragmentShader: "light.frag.qsb"

        function cycle() {
            choice = ShaderLogic.nextPalette(choice, root.paletteCount);
        }

        // Paused off screen so an idle card runs at 0 % CPU and resumes in phase.
        FrameAnimation {
            running: true
            paused: !root.active
            onTriggered: effect.time = ShaderLogic.advanceTime(effect.time, frameTime, root.pace)
        }
    }

    MouseArea {
        anchors.fill: parent
        hoverEnabled: true
        Accessible.name: t`Shader canvas. Move the pointer to stir the light; tap to change the colours.`
        Accessible.role: Accessible.Button
        Accessible.onPressAction: effect.cycle()
        onPositionChanged: (mouse) => {
            const uv = ShaderLogic.pointerUv(mouse.x, mouse.y, width, height);
            effect.pointer = Qt.point(uv.x, uv.y);
        }
        onClicked: effect.cycle()
    }

    // The hint beside the badge where both fit on one line, over it
    // where not; a hint wider than the card wraps.
    readonly property bool stacked: hint.implicitWidth + badge.implicitWidth + 3 * 14 > width

    Text {
        id: hint
        anchors.left: parent.left
        anchors.bottom: root.stacked ? badge.top : parent.bottom
        anchors.margins: 14
        anchors.bottomMargin: root.stacked ? 6 : 14
        width: Math.min(implicitWidth, root.width - 28)
        wrapMode: Text.Wrap
        color: look.ink
        font.pixelSize: 14
        text: t`Move to stir the light · tap for other colours`
    }
    Text {
        id: badge
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.margins: 14
        color: look.muted
        font.pixelSize: 13
        text: t`A custom fragment shader`
    }
}
