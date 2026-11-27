import Ljos.Ui
import Ljos.Core
import Ljos.Layout
import "logic/motion.ts" as MotionLogic

// Three springs, one ring. Each ball is pulled to where the ring is, a
// frame at a time, by a spring of its own (logic/motion.ts's `step`, the
// tick SpringAnimation takes): the same target, three tunings, three ways
// of moving. Drag the ring and they follow; let go and, after a moment,
// the ring hops round on its own. Under reduced motion they get a calmer
// tuning, slower and with no overshoot, and still travel: they never jump.
// Try changing a spring or a damping in `springs`, or `ballShare`.
Rectangle {
    id: root
    width: 720
    height: 420
    fill: look.canvas
    radius: 8

    // Remix knobs: the springs, as SpringAnimation takes them (bigger
    // `spring` is quicker, smaller `damping` bouncier), the balls' size
    // as a part of the stage's shorter side, and how long the ring waits
    // between hops of its own.
    property list<MotionLogic.Spring> springs: [
        { name: t`Snappy`, spring: 8, damping: 0.5 },
        { name: t`Bouncy`, spring: 3, damping: 0.07 },
        { name: t`Lazy`, spring: 0.6, damping: 0.18 }
    ]
    property real ballShare: 0.1
    property int hopMs: 2200
    property int calmHopMs: 3200
    // After the reader lets go, the ring rests this long before hopping.
    property int restMs: 3000
    // Narrower than this, the legend wraps under the stage.
    property int compactBelow: 520

    // Host contract: DemoFrame pauses off-screen demos and sets calm for reduced motion.
    property bool active: true
    property bool calm: false

    readonly property bool compact: width < compactBelow
    readonly property list<string> tones: look.dark ? ["#7fd6ff", "#ff8fb8", "#ffd36e"] : ["#0b6fa8", "#b52c66", "#8a5600"]

    Object {
        id: look
        readonly property bool dark: App.hints.colorScheme === ColorScheme.Dark
        readonly property color canvas: dark ? "#171a23" : "#f6f4ee"
        readonly property color stage: dark ? "#10131b" : "#ffffff"
        readonly property color edge: dark ? "#2b3142" : "#dcd8cc"
        readonly property color ink: dark ? "#e8eaf0" : "#1b1f2a"
        readonly property color muted: dark ? "#a7afbf" : "#4d5566"
        readonly property color ring: dark ? "#ffffff" : "#1b1f2a"
        readonly property color focus: dark ? "#7fd6ff" : "#0b6fa8"
        // On a ball: dark on the dark scheme's pale balls, white on the light one's deep ones.
        readonly property color letter: dark ? "#10131b" : "#ffffff"
    }

    Text {
        id: hint
        x: 16
        y: 12
        width: parent.width - 32
        elide: Text.ElideRight
        color: look.muted
        font.size: 14
        text: t`Drag the ring · three springs chase it`
    }

    // --- The stage --------------------------------------------------------
    Rectangle {
        id: stage
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: hint.bottom
        anchors.bottom: legend.top
        anchors.leftMargin: 16
        anchors.rightMargin: 16
        anchors.topMargin: 10
        anchors.bottomMargin: 12
        fill: look.stage
        radius: 12
        border.width: stage.activeFocus ? 2 : 1
        border.color: stage.activeFocus ? look.focus : look.edge
        // A bouncy ball swings past a ring near the edge: the stage keeps
        // it in.
        clip: true
        activeFocusOnTab: true
        Accessible.name: t`Spring stage. Drag the ring or move it with the arrow keys; three springs follow it.`
        Accessible.role: Accessible.Grouping

        // Where the ring is, as parts of the stage, so a stage that
        // changes size keeps it where it was.
        property MotionLogic.Point goal: MotionLogic.hop(0)
        property int hops: 0
        // The reader is leading the ring.
        property bool held: false
        // The springs wait for the first layout, so the stage taking its
        // size does not launch them.
        property bool started: false
        readonly property real ball: MotionLogic.ballOn(width, height, root.ballShare)
        // The balls rest this far from the ring's middle, round it.
        readonly property real reach: ball * 0.95
        // The ring stays this far in, so the balls round it stay on the stage.
        readonly property real margin: reach + ball * 0.6
        readonly property real ringX: MotionLogic.placeOf(goal.x, width, margin)
        readonly property real ringY: MotionLogic.placeOf(goal.y, height, margin)

        // Where the ring is drawn, gliding to where it is led, and each
        // ball as the frames have moved it.
        property MotionLogic.Point ringAt: ({ x: ringX, y: ringY })
        property list<MotionLogic.Body> bodies: MotionLogic.NO_BODIES
        // Something has still to come to rest.
        property bool moving: false
        readonly property real glideSeconds: root.calm ? 0.12 : 0.05

        Component.onCompleted: later(() => {
            stage.settle();
            stage.started = true;
        })
        onRingXChanged: stage.stir()
        onRingYChanged: stage.stir()
        onReachChanged: stage.stir()

        // Where ball `index` rests: round the ring.
        function seatOf(index: int): MotionLogic.Point {
            const seat = MotionLogic.seat(index, root.springs.length, stage.reach);
            return { x: stage.ringX + seat.x, y: stage.ringY + seat.y };
        }
        // Everything at rest where it belongs, at once: before the first
        // frame, so taking its size launches nothing.
        function settle(): void {
            stage.ringAt = { x: stage.ringX, y: stage.ringY };
            stage.bodies = root.springs.map((_, index) => MotionLogic.still(stage.seatOf(index)));
        }
        function stir(): void {
            if (!stage.started)
                return;
            if (!root.active) {
                stage.settle();
                return;
            }
            stage.moving = true;
        }
        function advance(dt: real): void {
            const goal = { x: stage.ringX, y: stage.ringY };
            stage.ringAt = stage.held ? goal : MotionLogic.glide(stage.ringAt, goal, dt, stage.glideSeconds);
            let still = stage.ringAt.x === goal.x && stage.ringAt.y === goal.y;
            stage.bodies = root.springs.map((spring, index) => {
                const to = stage.seatOf(index);
                const from = stage.bodies[index] ?? MotionLogic.still(to);
                const next = MotionLogic.step(from, to, MotionLogic.tuned(spring, root.calm), dt);
                if (!MotionLogic.resting(next, to)) {
                    still = false;
                    return next;
                }
                return MotionLogic.still(to);
            });
            if (still)
                stage.moving = false;
        }

        function lead(x: real, y: real): void {
            stage.goal = MotionLogic.partOf(x, y, stage.width, stage.height, stage.margin);
        }
        function nudge(dx: real, dy: real): void {
            stage.goal = {
                x: Math.min(Math.max(stage.goal.x + dx, 0), 1),
                y: Math.min(Math.max(stage.goal.y + dy, 0), 1)
            };
            rest.restart();
        }

        Keys.onPressed: (event: KeyEvent) => {
            const step = 0.12;
            if (event.key === Key.Left) stage.nudge(-step, 0);
            else if (event.key === Key.Right) stage.nudge(step, 0);
            else if (event.key === Key.Up) stage.nudge(0, -step);
            else if (event.key === Key.Down) stage.nudge(0, step);
            else return;
            event.accepted = true;
        }

        // The ring hops while nobody leads it. Between hops, once the
        // springs settle, nothing runs.
        Timer {
            id: hopper
            interval: root.calm ? root.calmHopMs : root.hopMs
            repeat: true
            running: root.active && !stage.held && !rest.running
            onTriggered: {
                stage.hops += 1;
                stage.goal = MotionLogic.hop(stage.hops);
            }
        }
        Timer {
            id: rest
            interval: root.restMs
        }

        Repeater {
            model: root.springs
            delegate: Rectangle {
                id: ball
                required property MotionLogic.Spring modelData
                required property int index
                readonly property MotionLogic.Point seat: MotionLogic.seat(index, root.springs.length, stage.reach)
                width: stage.ball
                height: stage.ball
                radius: width / 2
                fill: root.tones[index % root.tones.length]
                // Where the frames have moved it, once they have; till then
                // where it rests.
                readonly property MotionLogic.Point at: stage.bodies[index] ?? { x: stage.ringX + seat.x, y: stage.ringY + seat.y }
                x: at.x - width / 2
                y: at.y - height / 2
                // A rope from the ball to the ring, under the ball: how far
                // it has still to go.
                Rectangle {
                    readonly property MotionLogic.Rope span: MotionLogic.rope({ x: ball.x + ball.width / 2, y: ball.y + ball.height / 2 }, { x: stage.ringX, y: stage.ringY })
                    z: -1
                    x: ball.width / 2
                    y: ball.height / 2 - 1.5
                    width: span.length
                    height: 3
                    radius: 1.5
                    transformOrigin: Item.Left
                    rotation: span.angle
                    fill: ball.fill
                    opacity: 0.45
                }
                Text {
                    anchors.centerIn: parent
                    color: look.letter
                    font.size: Math.round(ball.width * 0.4)
                    font.weight: Font.Bold
                    text: ball.modelData.name.slice(0, 1)
                }
            }
        }

        // The ring the springs chase. Led, it is under the pointer; on a
        // hop of its own it glides there quickly, so the hop reads as a
        // move, not a jump.
        Rectangle {
            id: ring
            width: stage.ball * 0.9
            height: width
            radius: width / 2
            fill: "transparent"
            border.width: Math.max(3, stage.ball / 12)
            border.color: look.ring
            x: stage.ringAt.x - width / 2
            y: stage.ringAt.y - height / 2
            scale: chase.pressed ? 1.15 : 1
            Behavior on scale {
                enabled: root.active
                NumberAnimation {
                    duration: 120
                    easing.type: Easing.OutCubic
                }
            }
        }

        // The frames that move the ring and the balls, running only while
        // something has still to come to rest: a settled stage ticks not
        // at all. Paused off screen, it goes on from where it was.
        FrameAnimation {
            running: stage.started && stage.moving
            paused: !root.active
            onTriggered: stage.advance(frameTime)
        }

        PointerArea {
            id: chase
            anchors.fill: parent
            onPressed: {
                stage.held = true;
                stage.forceActiveFocus();
                stage.lead(chase.mouseX, chase.mouseY);
            }
            onPositionChanged: {
                if (chase.pressed)
                    stage.lead(chase.mouseX, chase.mouseY);
            }
            onReleased: {
                stage.held = false;
                rest.restart();
            }
            onCanceled: {
                stage.held = false;
                rest.restart();
            }
        }
    }

    // --- The legend -------------------------------------------------------
    // Each spring's name and the tuning it runs with now: under reduced
    // motion the calmer one.
    Flow {
        id: legend
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: calmLine.top
        anchors.leftMargin: 16
        anchors.rightMargin: 16
        anchors.bottomMargin: 6
        spacing: root.compact ? 6 : 18

        Repeater {
            model: root.springs
            delegate: Row {
                id: entry
                required property MotionLogic.Spring modelData
                required property int index
                spacing: 8
                Rectangle {
                    Layout.alignment: Align.VCenter
                    width: 14
                    height: 14
                    radius: 7
                    fill: root.tones[entry.index % root.tones.length]
                }
                Text {
                    Layout.alignment: Align.VCenter
                    color: look.ink
                    font.size: 14
                    font.weight: Font.Bold
                    text: entry.modelData.name
                }
                Text {
                    Layout.alignment: Align.VCenter
                    color: look.muted
                    font.size: 13
                    text: MotionLogic.said(MotionLogic.tuned(entry.modelData, root.calm))
                }
            }
        }
    }

    Text {
        id: calmLine
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.leftMargin: 16
        anchors.rightMargin: 16
        anchors.bottomMargin: 12
        wrap: Text.WordWrap
        color: look.muted
        font.size: 13
        text: root.calm ? t`Reduced motion is on: the springs move more slowly and never swing past the ring.` : t`With reduced motion on, the springs move more slowly and never swing past the ring.`
    }
}
