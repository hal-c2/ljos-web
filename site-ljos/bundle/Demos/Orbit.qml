// Ljos.Core before QtQuick so t`` is available while shared names stay QtQuick's.
import Ljos.Core
import QtQuick
import QtQuick3D
import QtQuick3D.Helpers
import "logic/orbit.ts" as OrbitLogic

// Declarative 3D driven by a typed TypeScript clock (logic/orbit.ts).
// Drag to orbit, scroll or pinch to zoom. Try changing loopSeconds,
// towerStripe, lampBrightness, or the spin multiples in logic/orbit.ts.
Rectangle {
    id: root
    width: 720
    height: 420
    color: look.canvas

    // Remix knobs: one-line edits change the scene's speed and look.
    property real loopSeconds: 26
    property real calmLoopSeconds: 78
    property real startAngle: 55
    property color towerStripe: "#c77f2a"
    property color lampGlow: "#ffd9a0"
    property real lampBrightness: 6

    // Host contract: DemoFrame pauses off-screen demos and slows calm ones.
    property bool active: true
    property bool calm: false
    readonly property bool turning: active
    // Stays false until View3D paints a frame so the poster holds until then.
    readonly property bool ready: view.renderStats.frameTime > 0

    // One clock turns the whole scene; every angle in `pose` is a whole multiple.
    property real turn: startAngle
    readonly property real pace: OrbitLogic.degreesPerSecond(calm, loopSeconds, calmLoopSeconds)
    readonly property var pose: OrbitLogic.poseAt(turn)

    // FrameAnimation advances by elapsed time rather than interpolating from/to,
    // so changing pace or resuming from pause never jumps back to the start.
    FrameAnimation {
        running: true
        paused: !root.turning
        onTriggered: root.turn = OrbitLogic.advance(root.turn, frameTime, root.pace, root.startAngle)
    }

    QtObject {
        id: look
        readonly property bool dark: Application.styleHints.colorScheme === Qt.ColorScheme.Dark
        readonly property color canvas: dark ? "#12141b" : "#f6f4ee"
        readonly property color sky: dark ? "#14161f" : "#cfdae8"
        // Captions stay on dark translucent pills in both schemes so text keeps
        // readable contrast whether orbiting puts dark water or bright sky behind it.
        readonly property color pill: "#e612141b"
        readonly property color onPill: "#c9cfdd"
        readonly property color onPillMuted: "#aeb6c9"
    }

    View3D {
        id: view
        anchors.fill: parent
        camera: camera
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: look.sky
            antialiasingMode: SceneEnvironment.MSAA
            antialiasingQuality: SceneEnvironment.High
        }

        Node {
            id: origin
            y: 70
            PerspectiveCamera {
                id: camera
                y: 90
                z: 560
                clipNear: 10
                clipFar: 4000
            }
        }

        OrbitCameraController {
            anchors.fill: parent
            origin: origin
            camera: camera
        }

        DirectionalLight {
            eulerRotation: Qt.vector3d(-48, -35, 0)
            color: "#ffe7c4"
            brightness: 1.35
            castsShadow: true
            shadowMapQuality: Light.ShadowMapQualityHigh
        }
        // Cool fill from the opposite side keeps the shadowed faces legible.
        DirectionalLight {
            eulerRotation: Qt.vector3d(-20, 140, 0)
            color: "#7d92c4"
            brightness: 0.35
        }

        Model {
            source: "#Cylinder"
            y: -92
            scale: Qt.vector3d(11, 0.12, 11)
            materials: PrincipledMaterial {
                baseColor: "#22304a"
                roughness: 0.35
                metalness: 0.35
            }
        }
        Model {
            source: "#Cylinder"
            y: -68
            scale: Qt.vector3d(1.9, 0.55, 1.9)
            materials: PrincipledMaterial {
                baseColor: "#3a4152"
                roughness: 0.95
            }
        }

        Node {
            id: tower
            Model {
                source: "#Cylinder"
                y: 55
                scale: Qt.vector3d(0.62, 2.5, 0.62)
                materials: PrincipledMaterial {
                    baseColor: "#e9e2d2"
                    roughness: 0.6
                }
            }
            Model {
                source: "#Cylinder"
                y: 15
                scale: Qt.vector3d(0.66, 0.42, 0.66)
                materials: PrincipledMaterial {
                    baseColor: root.towerStripe
                    roughness: 0.55
                }
            }
            Model {
                source: "#Cylinder"
                y: 115
                scale: Qt.vector3d(0.66, 0.42, 0.66)
                materials: PrincipledMaterial {
                    baseColor: root.towerStripe
                    roughness: 0.55
                }
            }
            Model {
                source: "#Cylinder"
                y: 186
                scale: Qt.vector3d(0.95, 0.16, 0.95)
                materials: PrincipledMaterial {
                    baseColor: "#39415a"
                    roughness: 0.55
                    metalness: 0.25
                }
            }
            Model {
                source: "#Cylinder"
                y: 222
                scale: Qt.vector3d(0.52, 0.62, 0.52)
                materials: PrincipledMaterial {
                    baseColor: "#ffca7a"
                    emissiveFactor: Qt.vector3d(3.0, 1.7, 0.45)
                    roughness: 0.4
                }
            }
            Model {
                source: "#Cone"
                y: 278
                scale: Qt.vector3d(0.85, 0.95, 0.85)
                materials: PrincipledMaterial {
                    baseColor: "#39415a"
                    roughness: 0.55
                    metalness: 0.25
                }
            }
        }

        PointLight {
            y: 222
            color: "#ffb65c"
            brightness: 2.4
            constantFade: 1.0
            linearFade: 0.05
            quadraticFade: 0.0
        }
        Node {
            id: sweep
            y: 222
            eulerRotation: Qt.vector3d(0, root.pose.sweep, 0)
            SpotLight {
                z: 30
                eulerRotation: Qt.vector3d(-24, 0, 0)
                color: root.lampGlow
                brightness: root.lampBrightness
                coneAngle: 26
                innerConeAngle: 12
                constantFade: 1.0
                linearFade: 0.02
                quadraticFade: 0.0
            }
        }

        // Three distinct materials orbit the tower and spin on their own axes
        // so the sweeping lamp reveals highlights from every angle.
        Node {
            id: ring
            y: 40
            eulerRotation: Qt.vector3d(0, root.pose.ring, 0)
            Model {
                x: 215
                scale: Qt.vector3d(0.55, 0.55, 0.55)
                source: "#Sphere"
                eulerRotation: Qt.vector3d(0, root.pose.sphere, 0)
                materials: PrincipledMaterial {
                    baseColor: "#d8b36a"
                    roughness: 0.3
                    metalness: 0.65
                }
            }
            Model {
                x: -190
                y: 55
                z: 90
                scale: Qt.vector3d(0.62, 0.62, 0.62)
                source: "#Cube"
                eulerRotation: Qt.vector3d(root.pose.cubeX, root.pose.cubeY, 0)
                materials: PrincipledMaterial {
                    baseColor: "#5b7ba8"
                    roughness: 0.85
                }
            }
            Model {
                x: -60
                y: -30
                z: -215
                scale: Qt.vector3d(0.7, 0.7, 0.7)
                source: "#Cone"
                eulerRotation: Qt.vector3d(0, root.pose.cone, 0)
                materials: PrincipledMaterial {
                    baseColor: "#c4572e"
                    roughness: 0.35
                }
            }
        }
    }

    // The hint beside the credit where both fit on one line, over it
    // where not; a hint wider than the scene wraps.
    readonly property bool stacked: hint.implicitWidth + credit.implicitWidth + 2 * 16 + 3 * 10 > width

    Rectangle {
        anchors.left: parent.left
        anchors.bottom: root.stacked ? creditPill.top : parent.bottom
        anchors.margins: 10
        anchors.bottomMargin: root.stacked ? 6 : 10
        width: Math.min(hint.implicitWidth, root.width - 36) + 16
        height: hint.height + 8
        // A wrapped hint keeps the rounding of one line, not an oval.
        radius: Math.min(height / 2, 14)
        color: look.pill
        Text {
            id: hint
            anchors.centerIn: parent
            width: Math.min(implicitWidth, root.width - 36)
            wrapMode: Text.Wrap
            color: look.onPill
            font.pixelSize: 14
            text: t`Drag to orbit · scroll or pinch to zoom`
        }
    }
    Rectangle {
        id: creditPill
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.margins: 10
        width: credit.implicitWidth + 16
        height: credit.implicitHeight + 8
        radius: height / 2
        color: look.pill
        Text {
            id: credit
            anchors.centerIn: parent
            color: look.onPillMuted
            font.pixelSize: 13
            text: t`Drawn by Ljós's 3D renderer`
        }
    }
}
