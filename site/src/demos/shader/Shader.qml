import Ljos.Ui
import Ljos.Core
// Ljos.Ui has no `ShaderEffect` yet: it comes from QtQuick, by name.
import QtQuick as Q

// An item painted entirely by a fragment shader of its own
// (light.frag beside this file). The QML properties below are the
// shader's uniforms: moving the pointer stirs the light, tapping
// cycles the colours, and time only advances while the page says
// the demo is on screen and motion is welcome.
Rectangle {
    id: root
    width: 720
    height: 420
    fill: "#101320"
    activeFocusOnTab: true

    property bool active: true
    property bool calm: false

    Keys.onPressed: (event: KeyEvent) => {
        if (event.key === Key.Space || event.key === Key.Return) {
            effect.cycle();
            event.accepted = true;
        }
    }

    Q.ShaderEffect {
        id: effect
        anchors.fill: parent
        // The uniforms, in the order light.frag declares them.
        property real time: 0
        property point pointer: point(0.3, 0.6)
        property real palette: 0
        property point resolution: point(Math.max(width, 1), Math.max(height, 1))
        fragmentShader: "light.frag.qsb"

        function cycle() {
            palette = (palette + 1) % 3;
        }

        NumberAnimation on time {
            // Four whole turns of every wave in the shader, so the
            // loop wraps seamlessly. Stopped off screen; held still
            // (but still stirrable) when calm is asked for.
            running: root.active && !root.calm
            from: 0
            to: 12.5663706
            duration: 24000
            loops: Animation.Infinite
        }
    }

    PointerArea {
        anchors.fill: parent
        hoverEnabled: true
        Accessible.name: t`Shader canvas. Move the pointer to stir the light; tap to change the colours.`
        Accessible.role: Accessible.Button
        Accessible.onPressAction: effect.cycle()
        // Where the pointer is: the area's own, as its signal's is.
        onPositionChanged: {
            effect.pointer = point(mouseX / Math.max(width, 1), 1.0 - mouseY / Math.max(height, 1));
        }
        onClicked: effect.cycle()
    }

    Text {
        anchors.left: parent.left
        anchors.bottom: parent.bottom
        anchors.margins: 14
        color: "#e6e9f2"
        font.size: 14
        text: t`Move to stir the light · tap for other colours`
    }
    Text {
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.margins: 14
        color: "#aeb6c9"
        font.size: 13
        text: t`A custom fragment shader`
    }
}
