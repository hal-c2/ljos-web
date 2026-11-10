import QtQuick
import QtQuick3D
import QtQuick3D.Effects

Item {
    width: 200
    height: 200

    View3D {
        anchors.fill: parent
        camera: camera
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
            id: camera
            z: 500
        }
    }
}
