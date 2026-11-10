// What QtQuick3D.Helpers and QtQuick3D.Effects have as QML, on a machine with
// no Qt: each view draws a flat rectangle of a known colour.
import QtQuick
import QtQuick3D
import QtQuick3D.Effects
import QtQuick3D.Helpers

Rectangle {
    id: root
    width: 400
    height: 300
    color: "#000000"

    property alias orbited: origin
    property alias orbitCamera: orbitCamera
    property alias orbit: orbit
    property alias walker: walker
    property alias lod: lod
    property alias lodCamera: lodCamera
    property alias near: near
    property alias middle: middle
    property alias far: far
    property alias extended: extended
    property alias master: master
    property alias vignette: vignette
    property alias bloom: bloom
    property alias debug: debug
    readonly property var gridBars: [axes.enableAxisLines, axes.enableXZGrid]

    View3D {
        id: first
        x: 0
        y: 0
        width: 200
        height: 150
        camera: orbitCamera
        environment: extended

        ExtendedSceneEnvironment {
            id: extended
            backgroundMode: SceneEnvironment.Color
            clearColor: "#404040"
        }

        Node {
            id: origin
            OrthographicCamera {
                id: orbitCamera
                z: 500
            }
        }
        Model {
            source: "#Rectangle"
            scale: Qt.vector3d(0.5, 0.5, 1)
            materials: DefaultMaterial {
                lighting: DefaultMaterial.NoLighting
                diffuseColor: "#404040"
            }
        }
        AxisHelper {
            id: axes
            visible: false
        }
        OrbitCameraController {
            id: orbit
            anchors.fill: parent
            origin: origin
            camera: orbitCamera
        }
    }

    View3D {
        x: 200
        y: 0
        width: 200
        height: 150
        camera: walkerCamera
        PerspectiveCamera {
            id: walkerCamera
            z: 300
        }
        WasdController {
            id: walker
            anchors.fill: parent
            controlledObject: walkerCamera
        }
    }

    View3D {
        x: 0
        y: 150
        width: 100
        height: 75
        camera: fixed
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#808080"
            tonemapMode: SceneEnvironment.TonemapModeNone
            effects: master
        }
        ColorMaster {
            id: master
            redStrength: 1
            greenStrength: 1
            blueStrength: 1
        }
        OrthographicCamera {
            id: fixed
            z: 500
        }
    }

    View3D {
        x: 100
        y: 150
        width: 100
        height: 75
        camera: fixed2
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#808080"
            tonemapMode: SceneEnvironment.TonemapModeNone
            effects: vignette
        }
        Vignette {
            id: vignette
            vignetteColor: Qt.vector3d(0, 0, 0)
        }
        OrthographicCamera {
            id: fixed2
            z: 500
        }
    }

    View3D {
        x: 200
        y: 150
        width: 100
        height: 75
        camera: fixed3
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#101010"
            tonemapMode: SceneEnvironment.TonemapModeNone
            effects: bloom
        }
        HDRBloomTonemap {
            id: bloom
            tonemappingLerp: 0
        }
        OrthographicCamera {
            id: fixed3
            z: 500
        }
        Model {
            source: "#Rectangle"
            scale: Qt.vector3d(0.2, 0.2, 1)
            materials: DefaultMaterial {
                lighting: DefaultMaterial.NoLighting
                diffuseColor: "#ffffff"
            }
        }
    }

    View3D {
        x: 300
        y: 150
        width: 100
        height: 75
        camera: lodCamera
        OrthographicCamera {
            id: lodCamera
            z: 100
        }
        LodManager {
            id: lod
            camera: lodCamera
            distances: [400, 800]
            Node { id: near }
            Node { id: middle }
            Node { id: far }
        }
    }

    DebugView {
        id: debug
        y: 225
        source: first
    }
}
