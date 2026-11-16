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
    color: look.canvas
    activeFocusOnTab: true

    property bool active: true
    property bool calm: false
    // How fast the shader's time goes, a second: its loop (four whole
    // turns of every wave) in 24 s, or in 72 s when calm is asked for.
    readonly property real pace: (calm ? 1 / 72 : 1 / 24) * 4 * Math.PI
    // Drawn once its shader is: a page that shows a picture until then
    // (Site/DemoFrame.qml) keeps it till.
    readonly property bool ready: effect.status === ShaderEffect.Compiled

    Keys.onPressed: (event) => {
        if (event.key === Qt.Key_Space || event.key === Qt.Key_Return) {
            effect.cycle();
            event.accepted = true;
        }
    }

    // The colours this app draws with, for the scheme the reader chose:
    // each the dark it was drawn in or a light that keeps the text on it
    // as readable.
    QtObject {
        id: look
        readonly property bool dark: Application.styleHints.colorScheme === Qt.ColorScheme.Dark
        readonly property color canvas: dark ? "#101320" : "#f6f4ee"
        readonly property color ink: dark ? "#e6e9f2" : "#1b1f2a"
        readonly property color muted: dark ? "#aeb6c9" : "#4d5566"
    }

    ShaderEffect {
        id: effect
        anchors.fill: parent
        // The uniforms, in the order light.frag declares them.
        property real time: 0
        property point pointer: Qt.point(0.3, 0.6)
        // Which of the three colourings the reader tapped to; the
        // shader has each in a dark and a light, and is told both.
        property int choice: 0
        property real palette: choice + (look.dark ? 0 : 3)
        property point resolution: Qt.point(Math.max(width, 1), Math.max(height, 1))
        fragmentShader: "light.frag.qsb"

        function cycle() {
            choice = (choice + 1) % 3;
        }

        // Moved on each frame by its pace (as Orbit's turn), wrapping at
        // a whole loop: a new pace is taken at once, and paused off
        // screen it goes on where it was rather than from 0.
        FrameAnimation {
            running: true
            paused: !root.active
            onTriggered: effect.time = (effect.time + frameTime * root.pace) % (4 * Math.PI)
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
        color: look.ink
        font.pixelSize: 14
        text: qsTr("Move to stir the light · tap for other colours")
    }
    Text {
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.margins: 14
        color: look.muted
        font.pixelSize: 13
        text: qsTr("A custom fragment shader")
    }
}
