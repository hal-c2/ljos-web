// Four hundred textured models under ten lights, one of which casts
// shadows, seen by a camera that circles them, while one model in eight
// turns: what a busy scene costs when its camera and a part of it move
// every frame. The 3D perf harness's own (tests/perf3d), of the idea of
// ljos-ui's bench/quick3d-stress.qml.
import QtQuick
import QtQuick3D

Window {
    id: root
    width: 800
    height: 600
    visible: true
    color: "#101018"

    property real angle: 0
    NumberAnimation on angle {
        from: 0
        to: 360
        duration: 12000
        loops: Animation.Infinite
    }

    View3D {
        anchors.fill: parent
        environment: SceneEnvironment {
            clearColor: "#101018"
            backgroundMode: SceneEnvironment.Color
        }

        Node {
            eulerRotation.y: root.angle
            PerspectiveCamera {
                y: 700
                z: 1300
                eulerRotation.x: -28
                clipFar: 5000
            }
        }

        DirectionalLight {
            eulerRotation.x: -50
            eulerRotation.y: 30
            brightness: 0.7
            castsShadow: true
            shadowMapQuality: Light.ShadowMapQualityHigh
        }
        DirectionalLight { eulerRotation.x: -20; eulerRotation.y: 200; brightness: 0.25 }
        SpotLight {
            y: 600
            eulerRotation.x: -90
            coneAngle: 50
            brightness: 2
            color: "#ffe0c0"
        }
        Repeater3D {
            model: 7
            PointLight {
                x: 700 * Math.cos(index * 2 * Math.PI / 7)
                z: 700 * Math.sin(index * 2 * Math.PI / 7)
                y: 120
                brightness: 0.6
                color: Qt.hsla(index / 7, 0.7, 0.6, 1)
                quadraticFade: 0.5
            }
        }

        Model {
            source: "#Rectangle"
            y: -40
            eulerRotation.x: -90
            scale: Qt.vector3d(20, 20, 1)
            materials: PrincipledMaterial { baseColor: "#303040"; roughness: 0.9 }
        }

        // 20 by 20, 60 units apart: cubes, spheres and cylinders by turns,
        // each with one of three pictures.
        Repeater3D {
            model: 400
            Model {
                source: ["#Cube", "#Sphere", "#Cylinder"][index % 3]
                x: (index % 20 - 9.5) * 60
                z: (Math.floor(index / 20) - 9.5) * 60
                scale: Qt.vector3d(0.35, 0.35 + (index % 5) * 0.15, 0.35)
                eulerRotation.y: index % 8 === 0 ? root.angle * 4 : index * 7
                materials: PrincipledMaterial {
                    baseColor: Qt.hsla((index % 37) / 37, 0.5, 0.7, 1)
                    metalness: (index % 4) / 4
                    roughness: 0.3 + (index % 3) * 0.2
                    baseColorMap: Texture {
                        source: ["checker.png", "stripes.png", "bands.png"][index % 3]
                    }
                }
            }
        }
    }
}
