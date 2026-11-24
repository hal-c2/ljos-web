import Ljos.Ui
import Ljos.Core
import Ljos.Layout
import "logic/motion.ts" as MotionLogic

// Declarative motion in three forms: a spring-driven puck, list transitions
// when tiles shuffle, and a card that opens with animated state. Clamping,
// tuning, and shuffle steps live in logic/motion.ts.
// Try changing livelyDamping, tileMoveMs, or puckSize.
Rectangle {
    id: root
    width: 720
    height: 420
    fill: look.canvas
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
    // Narrower than this, the tray and the tiles are shorter and the
    // controls wrap onto two lines.
    property int compactBelow: 520

    readonly property bool compact: width < compactBelow

    // Host contract: DemoFrame pauses off-screen demos and sets calm for reduced motion.
    property bool active: true
    property bool calm: false

    readonly property unknown spring: MotionLogic.springTuning(
        calm, livelySpring, livelyDamping, calmSpring, calmDamping
    )
    readonly property int tileDuration: MotionLogic.duration(calm, tileMoveMs, calmMoveMs)

    Object {
        id: look
        readonly property bool dark: App.hints.colorScheme === ColorScheme.Dark
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
        height: root.compact ? 132 : 168
        fill: look.panel
        radius: 10
        // A tray that changes size (a window narrowed past compactBelow, a
        // phone turned) keeps a puck the reader has led inside it. Before
        // the first gesture the puck's centring binding already does.
        // The reader's last target is kept, clamped to the new tray, not
        // the springing x and y. Where the clamp moved the target, it is
        // placed there, not sprung. A target the tray still holds it
        // springs on to, drawn no further out than the tray's edge (kept):
        // the spring itself is left be, as one given a new start keeps
        // its velocity and would carry the puck past that edge.
        function keepPuck() {
            if (!puck.led)
                return;
            const inside = MotionLogic.clampPuck(puck.goalX + puck.width / 2, puck.goalY + puck.height / 2, puck.width, width, height);
            puck.kept = true;
            if (inside.x === puck.goalX && inside.y === puck.goalY)
                return;
            puck.goalX = inside.x;
            puck.goalY = inside.y;
            // Where it stands is given first, which stops a spring still
            // on its way: the target alone may be the one the spring
            // already heads for, and giving that again changes nothing.
            puck.placing = true;
            puck.x = puck.x;
            puck.y = puck.y;
            puck.x = inside.x;
            puck.y = inside.y;
            puck.placing = false;
        }
        onWidthChanged: keepPuck()
        onHeightChanged: keepPuck()

        Text {
            x: 14
            y: 10
            width: parent.width - 28
            elide: Text.ElideRight
            color: look.muted1
            font.size: 13
            text: t`Press and move — the puck springs after you`
        }

        Rectangle {
            id: puck
            width: root.puckSize
            height: root.puckSize
            radius: root.puckSize / 2
            fill: look.accent
            x: tray.width / 2 - width / 2
            y: tray.height / 2 - height / 2
            property real goalX: x
            property real goalY: y
            // Wait for the first pointer gesture before enabling springs so
            // initial layout sizing does not launch the puck on its own.
            property bool led: false
            // Set while the tray places the puck itself (keepPuck).
            property bool placing: false
            // From a tray's change of size until the reader next leads it
            // from inside, the puck is drawn within the tray wherever its
            // spring is.
            property bool kept: false
            readonly property unknown held: MotionLogic.clampPuck(x + width / 2, y + height / 2, width, tray.width, tray.height)
            transform: Translate {
                x: puck.kept ? puck.held.x - puck.x : 0
                y: puck.kept ? puck.held.y - puck.y : 0
            }

            Behavior on x {
                enabled: root.active && puck.led && !puck.placing
                SpringAnimation {
                    spring: root.spring.spring
                    damping: root.spring.damping
                    epsilon: 0.4
                }
            }
            Behavior on y {
                enabled: root.active && puck.led && !puck.placing
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

        PointerArea {
            id: chase
            anchors.fill: parent
            Accessible.name: t`Spring tray. Press and move to lead the puck; it springs after the pointer.`
            Accessible.role: Accessible.Slider
            function lead(mouse) {
                const target = MotionLogic.clampPuck(mouse.x, mouse.y, puck.width, tray.width, tray.height);
                puck.led = true;
                // A spring still past the edge has yet to come in from it.
                puck.kept = puck.kept && (Math.abs(puck.held.x - puck.x) > 0.5 || Math.abs(puck.held.y - puck.y) > 0.5);
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
        height: root.compact ? 56 : 76
        orientation: ListView.Horizontal
        spacing: root.compact ? 6 : 10
        interactive: false
        model: tiles
        delegate: Rectangle {
            required property string label
            required property string tone
            width: (strip.width - strip.spacing * 5) / 6
            height: root.compact ? 48 : 64
            radius: 10
            fill: tone
            Text {
                anchors.centerIn: parent
                // A tile narrower than its word shrinks the word to fit.
                scale: Math.min(1, (parent.width - 8) / Math.max(1, implicitWidth))
                color: look.onTile
                font.size: 17
                font.weight: Font.Bold
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
    // Side by side where both fit; the card under the button where not.
    Flow {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: strip.bottom
        anchors.margins: 16
        spacing: 12

        Rectangle {
            id: shuffleButton
            width: 168
            height: 42
            radius: 8
            fill: shufflePress.pressed ? look.accentPressed : look.accent
            scale: shufflePress.pressed ? 0.97 : 1.0
            activeFocusOnTab: true
            Accessible.name: t`Shuffle the tiles`
            Accessible.role: Accessible.Button
            Accessible.onPressAction: shuffleButton.shuffle()
            Keys.onPressed: (event) => {
                if (event.key === Key.Space || event.key === Key.Return) {
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
                font.size: 15
                font.weight: Font.Bold
                text: t`Shuffle the tiles`
            }
            PointerArea {
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
            width: Math.min(300, parent.width)
            height: open ? root.cardOpenHeight : 42
            radius: 8
            fill: look.raised
            clip: true
            property bool open: false
            activeFocusOnTab: true
            Accessible.name: t`About this motion. Tap to open or close.`
            Accessible.role: Accessible.Button
            Accessible.onPressAction: card.open = !card.open
            Keys.onPressed: (event) => {
                if (event.key === Key.Space || event.key === Key.Return) {
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
                font.size: 15
                text: card.open ? t`About this motion ▾` : t`About this motion ▸`
            }
            Text {
                x: 12
                y: 42
                width: parent.width - 24
                wrap: Text.WordWrap
                color: look.muted2
                font.size: 13
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
            PointerArea {
                anchors.fill: parent
                onClicked: card.open = !card.open
            }
        }
    }
}
