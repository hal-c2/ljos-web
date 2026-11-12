import QtQuick

// Motion with a job to do: a puck that springs after your pointer
// (feedback that feels physical), a row of tiles that glide to their
// new places when shuffled (so a change reads as movement, not a
// jump cut), and a card that opens with a state transition. When
// the page says reduced motion is preferred (root.calm), the same
// changes happen with short fades and no travel or overshoot.
Rectangle {
    id: root
    width: 720
    height: 420
    color: "#171a23"
    radius: 8

    property bool active: true
    property bool calm: false

    // --- the spring tray -------------------------------------------------
    Rectangle {
        id: tray
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.margins: 16
        height: 168
        color: "#1f2432"
        radius: 10

        Text {
            x: 14
            y: 10
            color: "#9aa3b2"
            font.pixelSize: 13
            text: qsTr("Press and move — the puck springs after you")
        }

        Rectangle {
            id: puck
            width: 54
            height: 54
            radius: 27
            color: "#e8a33d"
            x: tray.width / 2 - width / 2
            y: tray.height / 2 - height / 2
            property real goalX: x
            property real goalY: y
            // A spring when motion is welcome; a short direct move
            // when it is not. Both end in the same place.
            Behavior on x {
                enabled: root.active
                SpringAnimation {
                    spring: root.calm ? 30 : 3.2
                    damping: root.calm ? 1.0 : 0.28
                    epsilon: 0.4
                }
            }
            Behavior on y {
                enabled: root.active
                SpringAnimation {
                    spring: root.calm ? 30 : 3.2
                    damping: root.calm ? 1.0 : 0.28
                    epsilon: 0.4
                }
            }
            scale: chase.pressed ? 0.92 : 1.0
            Behavior on scale {
                NumberAnimation {
                    duration: root.calm ? 60 : 140
                    easing.type: Easing.OutCubic
                }
            }
        }

        MouseArea {
            id: chase
            anchors.fill: parent
            Accessible.name: qsTr("Spring tray. Press and move to lead the puck; it springs after the pointer.")
            Accessible.role: Accessible.Slider
            function lead(mouse) {
                puck.goalX = Math.max(0, Math.min(tray.width - puck.width, mouse.x - puck.width / 2));
                puck.goalY = Math.max(0, Math.min(tray.height - puck.height, mouse.y - puck.height / 2));
                puck.x = puck.goalX;
                puck.y = puck.goalY;
            }
            onPressed: (mouse) => lead(mouse)
            onPositionChanged: (mouse) => {
                if (pressed)
                    lead(mouse);
            }
        }
    }

    // --- the tiles that glide home --------------------------------------
    ListModel {
        id: tiles
        ListElement { label: "Ljós"; tone: "#e8a33d" }
        ListElement { label: "holds"; tone: "#5b7ba8" }
        ListElement { label: "state"; tone: "#7ba05b" }
        ListElement { label: "while"; tone: "#a85b7d" }
        ListElement { label: "it"; tone: "#5ba8a0" }
        ListElement { label: "moves"; tone: "#c4572e" }
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
                color: "#14161d"
                font.pixelSize: 17
                font.bold: true
                text: label
            }
        }
        moveDisplaced: Transition {
            NumberAnimation {
                properties: "x,y"
                duration: root.calm ? 120 : 520
                easing.type: root.calm ? Easing.OutCubic : Easing.OutBack
            }
        }
        move: Transition {
            NumberAnimation {
                properties: "x,y"
                duration: root.calm ? 120 : 520
                easing.type: root.calm ? Easing.OutCubic : Easing.OutBack
            }
        }
    }

    // --- controls ---------------------------------------------------------
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
            color: shufflePress.pressed ? "#c77f2a" : "#e8a33d"
            scale: shufflePress.pressed ? 0.97 : 1.0
            activeFocusOnTab: true
            Accessible.name: qsTr("Shuffle the tiles")
            Accessible.role: Accessible.Button
            Accessible.onPressAction: shuffleButton.shuffle()
            Keys.onPressed: (event) => {
                if (event.key === Qt.Key_Space || event.key === Qt.Key_Return) {
                    shuffleButton.shuffle();
                    event.accepted = true;
                }
            }
            Behavior on scale {
                NumberAnimation {
                    duration: root.calm ? 60 : 120
                    easing.type: Easing.OutCubic
                }
            }
            Text {
                anchors.centerIn: parent
                color: "#1a1408"
                font.pixelSize: 15
                font.bold: true
                text: qsTr("Shuffle the tiles")
            }
            MouseArea {
                id: shufflePress
                anchors.fill: parent
                onClicked: shuffleButton.shuffle()
            }
            function shuffle() {
                // A Fisher–Yates pass over the model: every tile
                // travels, none is remade, so the move reads.
                for (let i = tiles.count - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    if (j !== i)
                        tiles.move(i, j, 1);
                }
            }
        }

        Rectangle {
            id: card
            width: 300
            height: open ? 118 : 42
            radius: 8
            color: "#232839"
            clip: true
            property bool open: false
            activeFocusOnTab: true
            Accessible.name: qsTr("About this motion. Tap to open or close.")
            Accessible.role: Accessible.Button
            Accessible.onPressAction: card.open = !card.open
            Keys.onPressed: (event) => {
                if (event.key === Qt.Key_Space || event.key === Qt.Key_Return) {
                    card.open = !card.open;
                    event.accepted = true;
                }
            }
            Behavior on height {
                NumberAnimation {
                    duration: root.calm ? 100 : 320
                    easing.type: Easing.InOutCubic
                }
            }
            Text {
                x: 12
                y: 11
                color: "#e8eaf0"
                font.pixelSize: 15
                text: card.open ? qsTr("About this motion ▾") : qsTr("About this motion ▸")
            }
            Text {
                x: 12
                y: 42
                width: parent.width - 24
                wrapMode: Text.WordWrap
                color: "#b9c0d0"
                font.pixelSize: 13
                opacity: card.open ? 1 : 0
                Behavior on opacity {
                    NumberAnimation {
                        duration: root.calm ? 80 : 220
                        easing.type: Easing.OutCubic
                    }
                }
                text: qsTr("Springs, behaviors, list transitions and states are declarations beside the values they move — no animation loop of yours to run, and nothing ticks while this is off screen.")
            }
            MouseArea {
                anchors.fill: parent
                onClicked: card.open = !card.open
            }
        }
    }
}
