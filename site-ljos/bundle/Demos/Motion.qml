// Ljos.Core before QtQuick so t`` is available while shared names stay QtQuick's.
import Ljos.Core
import QtQuick
import "logic/motion.ts" as MotionLogic

// Declarative motion in three forms: a spring-driven puck, list transitions
// when tiles shuffle, and a card that opens with animated state. Clamping,
// tuning, and shuffle steps live in logic/motion.ts.
// Try changing livelyDamping, tileMoveMs, or puckSize.
Rectangle {
    id: root
    width: 720
    height: 420
    color: look.canvas
    radius: 8

    // Remix knobs: tune the spring feel, shuffle pace, and puck size here.
    property real puckSize: 54
    property real livelySpring: 3.2
    property real livelyDamping: 0.28
    property real calmSpring: 4.0
    property real calmDamping: 1.0
    property int tileMoveMs: 520
    property int calmMoveMs: 300
    property int cardOpenHeight: 118

    // Host contract: DemoFrame pauses off-screen demos and sets calm for reduced motion.
    property bool active: true
    property bool calm: false

    readonly property var spring: MotionLogic.springTuning(
        calm, livelySpring, livelyDamping, calmSpring, calmDamping
    )
    readonly property int tileDuration: MotionLogic.duration(calm, tileMoveMs, calmMoveMs)

    QtObject {
        id: look
        readonly property bool dark: Application.styleHints.colorScheme === Qt.ColorScheme.Dark
        readonly property color accent: dark ? "#e8a33d" : "#c07a12"
        readonly property color accentPressed: dark ? "#c77f2a" : "#a8650a"
        readonly property color onAccent: "#1a1408"
        readonly property color onTile: "#14161d"
        readonly property color canvas: dark ? "#171a23" : "#f6f4ee"
        readonly property color ink: dark ? "#e8eaf0" : "#1b1f2a"
        readonly property color muted1: dark ? "#9aa3b2" : "#4d5566"
        readonly property color muted2: dark ? "#b9c0d0" : "#4d5566"
        readonly property color panel: dark ? "#1f2432" : "#ebe8df"
        readonly property color raised: dark ? "#232839" : "#ffffff"
    }

    // --- Spring tray ------------------------------------------------------
    Rectangle {
        id: tray
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.margins: 16
        height: 168
        color: look.panel
        radius: 10

        Text {
            x: 14
            y: 10
            color: look.muted1
            font.pixelSize: 13
            text: t`Press and move — the puck springs after you`
        }

        Rectangle {
            id: puck
            width: root.puckSize
            height: root.puckSize
            radius: root.puckSize / 2
            color: look.accent
            x: tray.width / 2 - width / 2
            y: tray.height / 2 - height / 2
            property real goalX: x
            property real goalY: y
            // Wait for the first pointer gesture before enabling springs so
            // initial layout sizing does not launch the puck on its own.
            property bool led: false

            Behavior on x {
                enabled: root.active && puck.led
                SpringAnimation {
                    spring: root.spring.spring
                    damping: root.spring.damping
                    epsilon: 0.4
                }
            }
            Behavior on y {
                enabled: root.active && puck.led
                SpringAnimation {
                    spring: root.spring.spring
                    damping: root.spring.damping
                    epsilon: 0.4
                }
            }
            scale: chase.pressed ? 0.92 : 1.0
            Behavior on scale {
                enabled: root.active
                NumberAnimation {
                    duration: MotionLogic.duration(root.calm, 140, 150)
                    easing.type: Easing.OutCubic
                }
            }
        }

        MouseArea {
            id: chase
            anchors.fill: parent
            Accessible.name: t`Spring tray. Press and move to lead the puck; it springs after the pointer.`
            Accessible.role: Accessible.Slider
            function lead(mouse) {
                const target = MotionLogic.clampPuck(mouse.x, mouse.y, puck.width, tray.width, tray.height);
                puck.led = true;
                puck.goalX = target.x;
                puck.goalY = target.y;
                puck.x = target.x;
                puck.y = target.y;
            }
            onPressed: (mouse) => lead(mouse)
            onPositionChanged: (mouse) => {
                if (pressed)
                    lead(mouse);
            }
        }
    }

    // --- Gliding tiles ----------------------------------------------------
    ListModel {
        id: tiles
        ListElement { label: "Ljós"; tone: "#e8a33d" }
        ListElement { label: "holds"; tone: "#7b9bc8" }
        ListElement { label: "state"; tone: "#7ba05b" }
        ListElement { label: "while"; tone: "#c97ba0" }
        ListElement { label: "it"; tone: "#5ba8a0" }
        ListElement { label: "moves"; tone: "#e07a50" }
    }

    ListView {
        id: strip
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: tray.bottom
        anchors.margins: 16
        height: 76
        orientation: ListView.Horizontal
        spacing: 10
        interactive: false
        model: tiles
        delegate: Rectangle {
            required property string label
            required property string tone
            width: (strip.width - strip.spacing * 5) / 6
            height: 64
            radius: 10
            color: tone
            Text {
                anchors.centerIn: parent
                color: look.onTile
                font.pixelSize: 17
                font.bold: true
                text: label
            }
        }
        moveDisplaced: Transition {
            NumberAnimation {
                properties: "x,y"
                duration: root.tileDuration
                easing.type: root.calm ? Easing.OutCubic : Easing.OutBack
            }
        }
        move: Transition {
            NumberAnimation {
                properties: "x,y"
                duration: root.tileDuration
                easing.type: root.calm ? Easing.OutCubic : Easing.OutBack
            }
        }
    }

    // --- Controls ---------------------------------------------------------
    Row {
        anchors.left: parent.left
        anchors.top: strip.bottom
        anchors.margins: 16
        spacing: 12

        Rectangle {
            id: shuffleButton
            width: 168
            height: 42
            radius: 8
            color: shufflePress.pressed ? look.accentPressed : look.accent
            scale: shufflePress.pressed ? 0.97 : 1.0
            activeFocusOnTab: true
            Accessible.name: t`Shuffle the tiles`
            Accessible.role: Accessible.Button
            Accessible.onPressAction: shuffleButton.shuffle()
            Keys.onPressed: (event) => {
                if (event.key === Qt.Key_Space || event.key === Qt.Key_Return) {
                    shuffleButton.shuffle();
                    event.accepted = true;
                }
            }
            Behavior on scale {
                enabled: root.active
                NumberAnimation {
                    duration: MotionLogic.duration(root.calm, 120, 150)
                    easing.type: Easing.OutCubic
                }
            }
            Text {
                anchors.centerIn: parent
                color: look.onAccent
                font.pixelSize: 15
                font.bold: true
                text: t`Shuffle the tiles`
            }
            MouseArea {
                id: shufflePress
                anchors.fill: parent
                onClicked: shuffleButton.shuffle()
            }
            function shuffle() {
                MotionLogic.shuffleMoves(tiles.count).forEach((step) => tiles.move(step.from, step.to, 1));
            }
        }

        Rectangle {
            id: card
            width: 300
            height: open ? root.cardOpenHeight : 42
            radius: 8
            color: look.raised
            clip: true
            property bool open: false
            activeFocusOnTab: true
            Accessible.name: t`About this motion. Tap to open or close.`
            Accessible.role: Accessible.Button
            Accessible.onPressAction: card.open = !card.open
            Keys.onPressed: (event) => {
                if (event.key === Qt.Key_Space || event.key === Qt.Key_Return) {
                    card.open = !card.open;
                    event.accepted = true;
                }
            }
            Behavior on height {
                enabled: root.active
                NumberAnimation {
                    duration: MotionLogic.duration(root.calm, 320, 200)
                    easing.type: Easing.InOutCubic
                }
            }
            Text {
                x: 12
                y: 11
                color: look.ink
                font.pixelSize: 15
                text: card.open ? t`About this motion ▾` : t`About this motion ▸`
            }
            Text {
                x: 12
                y: 42
                width: parent.width - 24
                wrapMode: Text.WordWrap
                color: look.muted2
                font.pixelSize: 13
                opacity: card.open ? 1 : 0
                Behavior on opacity {
                    enabled: root.active
                    NumberAnimation {
                        duration: MotionLogic.duration(root.calm, 220, 180)
                        easing.type: Easing.OutCubic
                    }
                }
                text: t`Springs, behaviors, list transitions and states are declarations beside the values they move — no animation loop of yours to run, and nothing ticks while this is off screen.`
            }
            MouseArea {
                anchors.fill: parent
                onClicked: card.open = !card.open
            }
        }
    }
}
