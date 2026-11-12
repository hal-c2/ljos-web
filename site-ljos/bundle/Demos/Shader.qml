import QtQuick

// An item painted entirely by a fragment shader of its own
// (light.frag beside this file). The QML properties below are the
// shader's uniforms: moving the pointer stirs the light, tapping
// cycles the colours, and time only advances while the page says
// the demo is on screen and motion is welcome.
Rectangle {
    id: root
    width: 720
    height: 420
    color: "#101320"
    activeFocusOnTab: true

    property bool active: true
    property bool calm: false

    Keys.onPressed: (event) => {
        if (event.key === Qt.Key_Space || event.key === Qt.Key_Return) {
            effect.cycle();
            event.accepted = true;
        }
    }

    ShaderEffect {
        id: effect
        anchors.fill: parent
        // The uniforms, in the order light.frag declares them.
        property real time: 0
        property point pointer: Qt.point(0.3, 0.6)
        property real palette: 0
        property point resolution: Qt.point(Math.max(width, 1), Math.max(height, 1))
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

    MouseArea {
        anchors.fill: parent
        hoverEnabled: true
        Accessible.name: qsTr("Shader canvas. Move the pointer to stir the light; tap to change the colours.")
        Accessible.role: Accessible.Button
        Accessible.onPressAction: effect.cycle()
        onPositionChanged: (mouse) => {
            effect.pointer = Qt.point(mouse.x / Math.max(width, 1), 1.0 - mouse.y / Math.max(height, 1));
        }
        onClicked: effect.cycle()
    }

    Text {
        anchors.left: parent.left
        anchors.bottom: parent.bottom
        anchors.margins: 14
        color: "#e6e9f2"
        font.pixelSize: 14
        text: qsTr("Move to stir the light · tap for other colours")
    }
    Text {
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.margins: 14
        color: "#aeb6c9"
        font.pixelSize: 13
        text: qsTr("A custom fragment shader")
    }
}
