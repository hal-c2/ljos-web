import QtQuick
import QtQuick3D
import QtQuick3D.Helpers

// A lighthouse at night, in Quick3D: drag to orbit it, scroll or pinch
// to zoom. The lamp sweeps a spotlight across the water while three
// unlike shapes circle the tower, so the scene is alive before it is
// touched — and still when the page asks it to be (root.active), or
// gentler when the visitor prefers reduced motion (root.calm).
Rectangle {
    id: root
    width: 720
    height: 420
    color: "#12141b"

    // Driven by the page that embeds this file; harmless standalone.
    property bool active: true
    property bool calm: false
    readonly property bool turning: active && !calm

    // One clock turns everything, each binding at its own whole
    // multiple of it, so the loop wraps without a jump.
    property real turn: 55
    NumberAnimation on turn {
        running: root.turning
        from: 55
        to: 415
        duration: 26000
        loops: Animation.Infinite
    }

    View3D {
        id: view
        anchors.fill: parent
        camera: camera
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#14161f"
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
        // Cool fill from the opposite side, so the night side still reads.
        DirectionalLight {
            eulerRotation: Qt.vector3d(-20, 140, 0)
            color: "#7d92c4"
            brightness: 0.35
        }

        // The water: a broad disc the lamp's sweep can land on.
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
        // The rock the tower stands on.
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
            // Tower shaft with two amber bands.
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
                    baseColor: "#c77f2a"
                    roughness: 0.55
                }
            }
            Model {
                source: "#Cylinder"
                y: 115
                scale: Qt.vector3d(0.66, 0.42, 0.66)
                materials: PrincipledMaterial {
                    baseColor: "#c77f2a"
                    roughness: 0.55
                }
            }
            // Gallery deck, lamp room and roof.
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

        // The lamp itself: a warm point of light, plus a spotlight on a
        // turning arm that sweeps the water and whatever circles by.
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
            eulerRotation: Qt.vector3d(0, root.turn * 2, 0)
            SpotLight {
                z: 30
                eulerRotation: Qt.vector3d(-24, 0, 0)
                color: "#ffd9a0"
                brightness: 6
                coneAngle: 26
                innerConeAngle: 12
                constantFade: 1.0
                linearFade: 0.02
                quadraticFade: 0.0
            }
        }

        // Three shapes in unlike materials circle the tower: polished
        // metal, matte stone, warm glassy amber. Each also turns on
        // its own axis, so orbiting the camera always changes a face.
        Node {
            id: ring
            y: 40
            eulerRotation: Qt.vector3d(0, root.turn, 0)
            Model {
                x: 215
                scale: Qt.vector3d(0.55, 0.55, 0.55)
                source: "#Sphere"
                eulerRotation: Qt.vector3d(0, root.turn * 4, 0)
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
                eulerRotation: Qt.vector3d(root.turn * 2, root.turn * 3, 0)
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
                eulerRotation: Qt.vector3d(0, root.turn * -3, 0)
                materials: PrincipledMaterial {
                    baseColor: "#c4572e"
                    roughness: 0.35
                }
            }
        }
    }

    Text {
        anchors.left: parent.left
        anchors.bottom: parent.bottom
        anchors.margins: 14
        color: "#c9cfdd"
        font.pixelSize: 14
        text: qsTr("Drag to orbit · scroll or pinch to zoom")
    }
    Text {
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.margins: 14
        color: "#8b93a7"
        font.pixelSize: 13
        text: qsTr("One QML file, drawn by Ljós's 3D renderer")
    }
}
