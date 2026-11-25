import Ljos.Ui
import Ljos.Core
import Ljos.Layout
import QtQuick as Q
import Qt.labs.lottieqt as L

// Plays two MIT-licensed HAL-C2 avatar Lottie files (under lottie/) using
// Ljós's built-in LottieAnimation type, with no JavaScript Lottie library.
// The dance loops continuously; the genie plays once and holds its last
// frame until you press Again. Speed scales the 24 fps base frame rate,
// and reduced motion runs at half the chosen speed.
// Try remixing speeds, danceLoops, genieDirection, or calmPace below.
Rectangle {
    id: root
    width: 720
    height: 420
    fill: look.canvas
    radius: 8

    // Remix knobs: speed choices, how the dance loops, and which way the genie plays.
    property list<real> speeds: [0.5, 1, 2]
    property int danceLoops: L.LottieAnimation.Infinite
    property int genieDirection: L.LottieAnimation.Forward
    // Reduced-motion pace multiplier: slows playback instead of stopping it.
    property real calmPace: 0.5
    // Base frame rate (frames per second) at 1× speed.
    property int fileRate: 24
    // Below this width, the stages shrink and the controls wrap.
    property int compactBelow: 520

    readonly property bool compact: width < compactBelow
    property real speed: 1
    property bool paused: false
    readonly property real pace: speed * (calm ? calmPace : 1)

    // Host contract: DemoFrame pauses off-screen demos and sets calm for reduced motion.
    property bool active: true
    property bool calm: false

    onActiveChanged: root.steer()
    onPausedChanged: root.steer()
    onPaceChanged: root.steer()

    // Both play while on screen and unpaused, holding their current frame
    // otherwise and resuming from it later. Each file sets its own frame
    // rate on load, so we apply the chosen pace once it is ready.
    function steer(): void {
        for (const avatar of [dance, genie]) {
            if (avatar.status !== L.LottieAnimation.Ready)
                continue;
            avatar.frameRate = Math.max(1, Math.round(root.fileRate * root.pace));
            if (root.active && !root.paused)
                avatar.play();
            else
                avatar.pause();
        }
    }

    Object {
        id: look
        readonly property bool dark: App.hints.colorScheme === ColorScheme.Dark
        readonly property color canvas: dark ? "#171a23" : "#f6f4ee"
        readonly property color stage: dark ? "#232839" : "#e8e3d6"
        readonly property color ink: dark ? "#e8eaf0" : "#1b1f2a"
        readonly property color muted: dark ? "#9aa3b2" : "#4d5566"
        readonly property color accent: dark ? "#e8a33d" : "#c07a12"
        readonly property color accentPressed: dark ? "#c77f2a" : "#a8650a"
        readonly property color onAccent: "#1a1408"
        readonly property color chip: dark ? "#2b3144" : "#ebe8df"
    }

    // --- The two stages ----------------------------------------------------
    Row {
        id: stages
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.margins: 16
        spacing: 16
        readonly property real side: Math.min((width - spacing) / 2, root.height - (root.compact ? 150 : 120))

        Repeater {
            model: 2
            delegate: Rectangle {
                id: card
                required property int index
                width: (stages.width - stages.spacing) / 2
                height: stages.side + 32
                radius: 10
                fill: look.stage

                Text {
                    x: 12
                    y: 8
                    color: look.muted
                    font.size: 13
                    text: card.index === 0 ? t`Dance (loops)` : t`Genie (plays once)`
                }
            }
        }
    }

    // Both avatars are 512×512 Lottie files scaled to fit over their cards.
    L.LottieAnimation {
        id: dance
        source: "lottie/hal-c2-dance.json"
        x: 16 + ((stages.width - stages.spacing) / 2 - stages.side) / 2
        y: 16 + 28
        scale: stages.side / 512
        transformOrigin: Q.Item.TopLeft
        loops: root.danceLoops
        autoPlay: false
        Accessible.name: t`HAL-C2's dancing avatar, looping`
        onStatusChanged: if (status === L.LottieAnimation.Ready) root.steer()
    }
    L.LottieAnimation {
        id: genie
        source: "lottie/hal-c2-genie.json"
        x: 16 + (stages.width + stages.spacing) / 2 + ((stages.width - stages.spacing) / 2 - stages.side) / 2
        y: 16 + 28
        scale: stages.side / 512
        transformOrigin: Q.Item.TopLeft
        direction: root.genieDirection
        autoPlay: false
        Accessible.name: t`HAL-C2's genie avatar, plays once`
        onStatusChanged: if (status === L.LottieAnimation.Ready) root.steer()
    }

    // --- Controls ------------------------------------------------------------
    Flow {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: stages.bottom
        anchors.margins: 16
        spacing: 10

        Rectangle {
            id: playButton
            width: 120
            height: 40
            radius: 8
            fill: playPress.pressed ? look.accentPressed : look.accent
            activeFocusOnTab: true
            Accessible.name: root.paused ? t`Play both avatars` : t`Pause both avatars`
            Accessible.role: Accessible.Button
            Accessible.onPressAction: root.paused = !root.paused
            Keys.onPressed: (event: KeyEvent) => {
                if (event.key === Key.Space || event.key === Key.Return) {
                    root.paused = !root.paused;
                    event.accepted = true;
                }
            }
            Text {
                anchors.centerIn: parent
                color: look.onAccent
                font.size: 15
                font.weight: Font.Bold
                text: root.paused ? t`Play` : t`Pause`
            }
            PointerArea {
                id: playPress
                anchors.fill: parent
                onClicked: root.paused = !root.paused
            }
        }

        Rectangle {
            id: againButton
            width: 120
            height: 40
            radius: 8
            fill: againPress.pressed ? look.accentPressed : look.chip
            activeFocusOnTab: true
            Accessible.name: t`Play the genie avatar again`
            Accessible.role: Accessible.Button
            Accessible.onPressAction: againButton.again()
            Keys.onPressed: (event: KeyEvent) => {
                if (event.key === Key.Space || event.key === Key.Return) {
                    againButton.again();
                    event.accepted = true;
                }
            }
            function again(): void {
                root.paused = false;
                genie.start();
                if (!root.active)
                    genie.pause();
            }
            Text {
                anchors.centerIn: parent
                color: look.ink
                font.size: 15
                text: t`Again`
            }
            PointerArea {
                id: againPress
                anchors.fill: parent
                onClicked: againButton.again()
            }
        }

        Repeater {
            model: root.speeds
            delegate: Rectangle {
                id: chip
                required property real modelData
                readonly property bool chosen: root.speed === modelData
                width: 64
                height: 40
                radius: 20
                fill: chosen ? look.accent : look.chip
                activeFocusOnTab: true
                Accessible.name: t`Playback speed ${modelData}×`
                Accessible.role: Accessible.RadioButton
                Accessible.checked: chosen
                Accessible.onPressAction: root.speed = chip.modelData
                Keys.onPressed: (event: KeyEvent) => {
                    if (event.key === Key.Space || event.key === Key.Return) {
                        root.speed = chip.modelData;
                        event.accepted = true;
                    }
                }
                Text {
                    anchors.centerIn: parent
                    color: chip.chosen ? look.onAccent : look.ink
                    font.size: 15
                    text: t`${chip.modelData}×`
                }
                PointerArea {
                    anchors.fill: parent
                    onClicked: root.speed = chip.modelData
                }
            }
        }
    }
}
