import QtQuick
import QtQuick.Shapes
import Ljos.Core

// The watch's files, by their own names: its Theme is its own, so the
// site's is reached by the module's name.
import Site as Page
import "Watch"

// Kestrel, a made-up smartwatch (Demos/Watch/, the ljos-ui example as it
// is), in a page's frame: the watch's own software on the left, worn
// with the pointer (swipe, tap, the wheel is the crown), and the watch
// in 3D on the right, on a turntable with its light strips blooming.
//
// The watch is the same program at both of its screens: the toggle only
// gives it the other size, and each of its screens lays itself out for
// the shape it is given, so what it was showing stays.
//
// The 3D watch's screen is the time of the watch beside it, drawn on a
// canvas: a browser can't make a picture of the page's own elements, so
// the running software can't be the texture here as it is natively.
//
// The turntable runs only while the frame is on screen; the reader's
// calm slows it a great deal and never stops it.
Item {
    id: demo
    width: 1120
    height: 640

    // Driven by the page that embeds this file; harmless standalone.
    property bool active: true
    property bool calm: false
    // The watch as the reader's edits make it (Demos/pro-live.js), or
    // null for the one the page was built with.
    property var live: null

    // The round screen, or the rounded square.
    property bool round: true
    readonly property int screenWidth: round ? 454 : 410
    readonly property int screenHeight: round ? 454 : 502

    // Side by side where the frame is wide, one above the other where it
    // is tall.
    readonly property bool across: width >= height * 1.1

    // The watch's state, which every screen reads and the keys below
    // drive: its Pages hold it, by the name the app gives them.
    readonly property var pages: app.item ? Array.from(app.item.children).find((child) => child.objectName === "pages") ?? null : null
    readonly property var watch: pages ? pages.watch : null
    readonly property bool asleep: watch ? watch.ambient : false

    Rectangle {
        anchors.fill: parent
        color: Page.Theme.surface
    }

    // The flat watch, and the keys that stand for its hardware.
    Item {
        id: flat
        width: demo.across ? Math.round(demo.width * 0.5) : demo.width
        height: demo.across ? demo.height : Math.round(demo.height * 0.56)

        readonly property real room: height - keys.height - 2 * Page.Theme.m
        readonly property real fit: Math.min((width - 2 * Page.Theme.l) / (demo.screenWidth + 40), room / (demo.screenHeight + 40))

        Item {
            id: worn
            width: demo.screenWidth
            height: demo.screenHeight
            x: Math.round((flat.width - width) / 2)
            y: Math.round(Page.Theme.m + (flat.room - height) / 2)
            scale: flat.fit
            transformOrigin: Item.Center

            // The case round the glass: the bezel is the app's own (its
            // mask), this is the metal beyond it.
            Rectangle {
                id: metal
                anchors.fill: parent
                anchors.margins: -20
                radius: demo.round ? width / 2 : 112
                // Black as the screen is, so the edge of the app's square
                // does not show inside the case.
                color: "#000000"
            }
            Loader {
                id: app
                anchors.fill: parent
                sourceComponent: demo.live ? null : own
                source: demo.live ?? undefined
                // The watch takes the keys once, as it comes; a watch made
                // again from an edit leaves them where the reader types.
                property bool first: true
                onLoaded: {
                    if (first)
                        item.forceActiveFocus();
                    first = false;
                }
            }
            // The app paints its whole square, as a screen does; a watch's
            // glass shows only what is inside its case, so the page covers
            // the rest.
            Shape {
                anchors.fill: metal
                ShapePath {
                    fillColor: Page.Theme.surface
                    strokeColor: "transparent"
                    fillRule: ShapePath.OddEvenFill
                    PathSvg {
                        path: demo.outside(metal.width, metal.height, metal.radius)
                    }
                }
            }
            Rectangle {
                anchors.fill: metal
                radius: metal.radius
                color: "transparent"
                border.color: demo.asleep ? "#1d2a3a" : "#0f5560"
                border.width: 3
            }
        }

        // The keys in lines as wide as the frame allows, each line centred.
        Item {
            id: keys
            readonly property real gap: Page.Theme.xs
            readonly property real room: flat.width - 2 * Page.Theme.m
            // Where each key stands, and how tall the lines are.
            readonly property var spots: {
                const sizes = Array.from(children).map((key) => key.implicitWidth);
                const lines = [[]];
                let used = -gap;
                sizes.forEach((size, i) => {
                    if (lines[lines.length - 1].length > 0 && used + gap + size > room) {
                        lines.push([]);
                        used = -gap;
                    }
                    lines[lines.length - 1].push(i);
                    used += gap + size;
                });
                const at = [];
                lines.forEach((line, row) => {
                    let x = (room - line.reduce((sum, i) => sum + sizes[i] + gap, -gap)) / 2;
                    for (const i of line) {
                        at[i] = Qt.point(Math.round(x), row * (36 + gap));
                        x += sizes[i] + gap;
                    }
                });
                return { at, height: lines.length * (36 + gap) - gap };
            }
            width: room
            height: spots.height
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.bottom: parent.bottom
            anchors.bottomMargin: Page.Theme.m
            Accessible.role: Accessible.ToolBar
            Accessible.name: t`The watch's buttons`

            WatchKey {
                place: 0
                label: demo.round ? t`Round, 454` : t`Square, 410 × 502`
                hint: t`Give the watch its other screen`
                onPressed: demo.round = !demo.round
            }
            WatchKey {
                place: 1
                label: t`Side button`
                hint: t`Wakes the watch, or goes back to its face`
                onPressed: {
                    if (demo.watch)
                        demo.watch.pressSide();
                    scene.pressButton();
                }
            }
            WatchKey {
                place: 2
                label: t`Crown ▲`
                hint: t`Turns the crown up a notch`
                onPressed: demo.crown(-1)
            }
            WatchKey {
                place: 3
                label: t`Crown ▼`
                hint: t`Turns the crown down a notch`
                onPressed: demo.crown(1)
            }
            WatchKey {
                place: 4
                label: t`Other face`
                hint: t`Shows the watch's other face`
                onPressed: if (demo.watch) {
                    demo.watch.touch();
                    demo.watch.nextFace();
                }
            }
            WatchKey {
                place: 5
                label: demo.asleep ? t`Wake` : t`Sleep`
                hint: t`Lets the watch rest on its always-on face, as it does by itself after fifteen seconds`
                on: demo.asleep
                onPressed: if (demo.watch) {
                    if (demo.asleep)
                        demo.watch.touch();
                    else
                        demo.watch.sleep();
                }
            }
            WatchKey {
                place: 6
                label: t`Always on`
                hint: t`Whether the face stays on, dim, while the watch rests`
                on: demo.watch ? demo.watch.alwaysOn : false
                onPressed: if (demo.watch)
                    demo.watch.alwaysOn = !demo.watch.alwaysOn
            }
        }
    }

    Component {
        id: own
        Main {}
    }

    // The box of `w` by `h` less the rounded box inside it, as SVG.
    function outside(w, h, r) {
        const e = 4;
        return `M ${-e} ${-e} H ${w + e} V ${h + e} H ${-e} Z `
            + `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} `
            + `H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
    }

    // Where the 3D crown is going: notches add to it, not to the angle
    // it is passing through.
    property real crownTo: 0
    function crown(steps) {
        if (demo.watch)
            demo.watch.turnCrown(steps);
        crownTo += 15 * steps;
        crownTurn.restart();
    }

    // The watch in 3D.
    Item {
        id: solid
        x: demo.across ? flat.width : 0
        y: demo.across ? 0 : flat.height
        width: demo.across ? demo.width - flat.width : demo.width
        height: demo.across ? demo.height : demo.height - flat.height

        // Seconds for one turn of the turntable.
        readonly property real turnSeconds: demo.calm ? 120 : 24
        property real spin: 0
        // Where the turn under way began: a change of pace goes on from
        // the angle the watch is at, at once, not at the next turn.
        property real turnFrom: 0
        onTurnSecondsChanged: {
            turnFrom = spin % 360;
            if (turn.running) {
                turn.restart();
                if (scene.dragging)
                    turn.pause();
            }
        }
        // Stopped (off screen, its tab hidden, paused), the turn goes on
        // from where it held when it runs again, never from the angle the
        // turn under way began at: a snap back the reader would see.
        Connections {
            target: demo
            function onActiveChanged() {
                if (!demo.active)
                    solid.turnFrom = solid.spin % 360;
            }
        }
        // Whether the turntable turns now, for a test to wait on.
        readonly property bool turning: turn.running && !turn.paused
        NumberAnimation on spin {
            id: turn
            from: solid.turnFrom
            to: solid.turnFrom + 360
            duration: solid.turnSeconds * 1000
            loops: Animation.Infinite
            running: demo.active
            paused: scene.dragging
        }

        WatchScene {
            id: scene
            anchors.fill: parent
            yaw: -24 + solid.spin
            pitch: 12
            bloom: demo.watch ? demo.watch.bloom : true
            dark: Page.Theme.dark
            face: dial
            glowLevel: demo.asleep ? 0.35 : 1

            function pressButton() {
                push.restart();
            }
            NumberAnimation {
                id: crownTurn
                target: scene
                property: "crown"
                to: demo.crownTo
                duration: Page.Theme.enterSmall
                easing.type: Easing.OutCubic
            }
            SequentialAnimation {
                id: push
                NumberAnimation {
                    target: scene
                    property: "press"
                    to: 1
                    duration: 80
                }
                NumberAnimation {
                    target: scene
                    property: "press"
                    to: 0
                    duration: 160
                    easing.type: Easing.OutCubic
                }
            }
        }

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.bottom: parent.bottom
            anchors.bottomMargin: Page.Theme.m
            text: t`Drag to turn it`
            color: Page.Theme.textMuted
            font.family: Page.Theme.sans
            font.pixelSize: Page.Theme.captionSize
        }
    }

    // The 3D screen's picture: the watch's time as its Pulse face shows
    // it, dim outlines while it rests, as its always-on face is.
    Canvas {
        id: dial
        width: 454
        height: 454
        visible: false

        readonly property int hours: demo.watch ? demo.watch.hours : 10
        readonly property int minutes: demo.watch ? demo.watch.minutes : 9
        readonly property int seconds: demo.watch ? demo.watch.seconds : 30
        readonly property bool dim: demo.asleep
        // Asleep with Always on off, the screen is dark, as the flat one is.
        readonly property bool off: demo.asleep && !(demo.watch ? demo.watch.alwaysOn : true)
        onOffChanged: requestPaint()
        onHoursChanged: requestPaint()
        onMinutesChanged: requestPaint()
        onSecondsChanged: requestPaint()
        onDimChanged: requestPaint()

        onPaint: {
            const ctx = getContext("2d");
            const c = width / 2;
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, width, height);
            if (off)
                return;
            const lit = !dim;
            for (let i = 0; i < 60; ++i) {
                const a = i * Math.PI / 30;
                const long = i % 5 === 0;
                ctx.strokeStyle = long ? (lit ? "#e6f1ff" : "#8a9ab0") : (lit ? "#25314a" : "#2a3342");
                ctx.lineWidth = long ? 6 : 3;
                ctx.beginPath();
                ctx.moveTo(c + Math.sin(a) * (c - 18), c - Math.cos(a) * (c - 18));
                ctx.lineTo(c + Math.sin(a) * (c - (long ? 50 : 32)), c - Math.cos(a) * (c - (long ? 50 : 32)));
                ctx.stroke();
            }
            const hand = (turn, length, width, colour) => {
                const a = turn * 2 * Math.PI;
                ctx.strokeStyle = colour;
                ctx.lineWidth = width;
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.moveTo(c - Math.sin(a) * 20, c + Math.cos(a) * 20);
                ctx.lineTo(c + Math.sin(a) * length, c - Math.cos(a) * length);
                ctx.stroke();
            };
            hand(((hours % 12) + minutes / 60) / 12, c * 0.5, 14, lit ? "#e6f1ff" : "#8a9ab0");
            hand((minutes + seconds / 60) / 60, c * 0.75, 10, lit ? "#19f0ff" : "#8a9ab0");
            if (lit)
                hand(seconds / 60, c * 0.82, 4, "#ff3ddb");
            ctx.fillStyle = lit ? "#ff3ddb" : "#8a9ab0";
            ctx.beginPath();
            ctx.arc(c, c, 10, 0, 2 * Math.PI);
            ctx.fill();
        }
    }

    // A key of the watch's hardware, or a setting, drawn as the site's.
    component WatchKey: Rectangle {
        id: key
        property string label: ""
        property string hint: ""
        property bool on: false
        // Its index among the keys, where its row's spots say it stands.
        property int place: 0
        readonly property point spot: parent && parent.spots && parent.spots.at[place] ? parent.spots.at[place] : Qt.point(0, 0)
        signal pressed()

        x: spot.x
        y: spot.y

        implicitWidth: words.implicitWidth + 2 * Page.Theme.s
        implicitHeight: 36
        radius: Page.Theme.radiusSmall
        color: area.pressed ? Page.Theme.surfacePressed : on ? Page.Theme.surfaceSelected : area.containsMouse ? Page.Theme.surfaceHover : Page.Theme.surfaceRaised
        border.color: activeFocus ? Page.Theme.focusRing : on ? Page.Theme.accent : Page.Theme.border
        border.width: activeFocus ? 2 : 1
        activeFocusOnTab: true
        Accessible.role: Accessible.Button
        Accessible.name: label
        Accessible.description: hint
        Accessible.onPressAction: () => key.pressed()
        Keys.onPressed: (event) => {
            if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                key.pressed();
                event.accepted = true;
            }
        }

        Text {
            id: words
            anchors.centerIn: parent
            text: key.label
            color: Page.Theme.text
            font.family: Page.Theme.sans
            font.pixelSize: Page.Theme.captionSize
            font.weight: Font.DemiBold
        }
        MouseArea {
            id: area
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            Accessible.ignored: true
            onClicked: key.pressed()
        }
    }
}
